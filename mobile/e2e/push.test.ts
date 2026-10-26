/// <reference types="node" />
// Integration test for phase 3: the relay pushes sync nudges and due reminders through
// a fake FCM (and Google OAuth) server, with a real RS256 service-account login.
// Run with: npm run test:sync
import assert from 'node:assert/strict';
import { createVerify, generateKeyPairSync } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';

import { openReminder, publishReminders } from '../src/sync/reminders';
import { createFamily, joinFamily, loadEngine } from '../src/sync/setup';
import { phone, type Phone } from './phone';
import { startRelay, type LocalRelay } from './relay-harness';

interface Sent {
  token: string;
  data: Record<string, string>;
  priority: string;
}

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
let google: Server;
let relay: LocalRelay;
let sent: Sent[] = [];
let tokenRequests = 0;

function readBody(req: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => resolve(body));
  });
}

before(async () => {
  google = createServer(async (req, res) => {
    const body = await readBody(req);
    if (req.url === '/token') {
      // Verify the relay's service-account JWT like Google would.
      const assertion = new URLSearchParams(body).get('assertion') ?? '';
      const [header, claims, signature] = assertion.split('.');
      const ok = createVerify('RSA-SHA256')
        .update(`${header}.${claims}`)
        .verify(publicKey, Buffer.from(signature, 'base64url'));
      const payload = JSON.parse(Buffer.from(claims, 'base64url').toString());
      if (!ok || payload.scope !== 'https://www.googleapis.com/auth/firebase.messaging') {
        res.writeHead(401).end('{}');
        return;
      }
      tokenRequests += 1;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ access_token: 'test-access', expires_in: 3600 }));
      return;
    }
    if (req.url === '/v1/projects/test-project/messages:send') {
      if (req.headers.authorization !== 'Bearer test-access') {
        res.writeHead(401).end('{}');
        return;
      }
      const { message } = JSON.parse(body);
      if (message.token === 'dead-token') {
        res
          .writeHead(404)
          .end('{"error":{"status":"NOT_FOUND","details":[{"errorCode":"UNREGISTERED"}]}}');
        return;
      }
      sent.push({ token: message.token, data: message.data, priority: message.android.priority });
      res.writeHead(200).end('{"name":"projects/test-project/messages/1"}');
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => google.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(google.address() as AddressInfo).port}`;
  relay = await startRelay(8890 + Math.floor(Math.random() * 100), {
    FCM_API_BASE: base,
    FCM_SERVICE_ACCOUNT: JSON.stringify({
      project_id: 'test-project',
      client_email: 'relay@test-project.iam.gserviceaccount.com',
      private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
      token_uri: `${base}/token`,
    }),
  });
});

after(async () => {
  await relay.stop();
  google.close();
});

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until(check: () => boolean, ms = 8000) {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('timed out');
    await wait(100);
  }
}

async function family(): Promise<[Phone, Phone]> {
  const a = await phone();
  const b = await phone();
  await a.repo.addChild('Micky', null);
  const engineA = await createFamily(a, relay.url);
  await joinFamily(b, (await engineA.createInvite()).code);
  return [a, b];
}

const engineOf = async (p: Phone) => (await loadEngine(p))!;

describe('push through the relay', () => {
  it('nudges the other phone after a change, with high priority only for timers', async () => {
    const [a, b] = await family();
    const ea = await engineOf(a);
    const eb = await engineOf(b);
    assert.deepEqual(await ea.client.updateDevice('token-a', true), { ok: true, push: true });
    await eb.client.updateDevice('token-b', true);
    const [child] = await a.repo.listChildren();

    sent = [];
    const t = Date.now();
    await a.repo.addEntry(child.id, {
      kind: 'diaper',
      start: t,
      end: t,
      data: { wet: true, solid: false },
    });
    await ea.sync();
    await until(() => sent.length > 0);
    assert.deepEqual(sent, [{ token: 'token-b', data: { type: 'sync' }, priority: 'NORMAL' }]);
    assert.ok(tokenRequests >= 1);

    sent = [];
    await a.repo.startTimer(child.id, 'sleep', { nap: true });
    await ea.sync();
    await until(() => sent.length > 0);
    assert.deepEqual(sent, [{ token: 'token-b', data: { type: 'sync' }, priority: 'HIGH' }]);
  });

  it('pushes due reminders to phones that want them, encrypted', async () => {
    const [a, b] = await family();
    const ea = await engineOf(a);
    const eb = await engineOf(b);
    await ea.client.updateDevice('token-a2', true);
    await eb.client.updateDevice('token-b2', false); // reminders off on B

    sent = [];
    const basis = (await a.repo.getSyncState())!.lastSeq;
    const body = ea.seal(
      JSON.stringify({ title: 'Nap time', body: 'Micky has been awake 1h 30m', alarm: false }),
    );
    assert.deepEqual(
      await ea.client.setReminders(basis, [{ tag: 'nap-0', fireAt: Date.now() + 1500, body }]),
      { applied: true },
    );
    // A set computed from an older log is ignored.
    assert.deepEqual(await eb.client.setReminders(basis - 1, []), { applied: false });

    await until(() => sent.some((m) => m.data.type === 'reminder'), 10_000);
    const reminders = sent.filter((m) => m.data.type === 'reminder');
    assert.deepEqual(
      reminders.map((m) => m.token),
      ['token-a2'],
    );
    assert.equal(reminders[0].priority, 'HIGH');
    assert.equal(reminders[0].data.tag, 'nap-0');
    assert.ok(!reminders[0].data.payload.includes('Micky'), 'relay only sees ciphertext');
    // Any phone of the family can open it.
    assert.deepEqual(openReminder(eb, reminders[0].data.payload), {
      title: 'Nap time',
      body: 'Micky has been awake 1h 30m',
      alarm: false,
    });
  });

  it('replaces pending reminders when the log changes', async () => {
    const [a] = await family();
    const ea = await engineOf(a);
    await ea.client.updateDevice('token-a3', true);
    const [child] = await a.repo.listChildren();
    // A sleep that ended a minute ago: nap reminder due in ~89 minutes, nothing due now.
    const end = Date.now() - 60_000;
    await a.repo.addEntry(child.id, {
      kind: 'sleep',
      start: end - 3600_000,
      end,
      data: { nap: true },
    });
    await ea.sync();
    sent = [];
    await publishReminders(a.repo, ea);
    // Replace with an immediate one to prove the earlier set was replaced, not added to.
    const basis = (await a.repo.getSyncState())!.lastSeq;
    await ea.client.setReminders(basis, [
      {
        tag: 'feed-0',
        fireAt: Date.now() + 1000,
        body: ea.seal('{"title":"Feed","body":"x","alarm":true}'),
      },
    ]);
    await until(() => sent.some((m) => m.data.type === 'reminder'), 10_000);
    await wait(1500);
    assert.deepEqual(
      sent.filter((m) => m.data.type === 'reminder').map((m) => m.data.tag),
      ['feed-0'],
    );
  });

  it('forgets tokens FCM reports as unregistered', async () => {
    const [a, b] = await family();
    const ea = await engineOf(a);
    const eb = await engineOf(b);
    await eb.client.updateDevice('dead-token', true);
    const [child] = await a.repo.listChildren();
    const t = Date.now();
    await a.repo.addEntry(child.id, {
      kind: 'diaper',
      start: t,
      end: t,
      data: { wet: true, solid: false },
    });
    await ea.sync();
    await wait(1500);
    sent = [];
    await eb.client.updateDevice('token-b4', true); // re-registers fine
    await a.repo.addEntry(child.id, {
      kind: 'diaper',
      start: t,
      end: t,
      data: { wet: false, solid: true },
    });
    await ea.sync();
    await until(() => sent.length > 0);
    assert.deepEqual(
      sent.map((m) => m.token),
      ['token-b4'],
    );
  });

  it('shares reminder rules between phones but keeps per-phone choices', async () => {
    const [a, b] = await family();
    await b.repo.updateSettings({ remindersOnThisPhone: false, dashboardCards: ['diaper'] });
    await a.repo.updateSettings({ awakeWindowMinutes: 120, feedAlarmNight: false });
    await (await engineOf(a)).sync();
    await (await engineOf(b)).sync();
    const s = await b.repo.getSettings();
    assert.equal(s.awakeWindowMinutes, 120);
    assert.equal(s.feedAlarmNight, false);
    assert.equal(s.remindersOnThisPhone, false);
    assert.deepEqual(s.dashboardCards, ['diaper']);
  });
});
