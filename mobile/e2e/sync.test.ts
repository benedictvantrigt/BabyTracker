/// <reference types="node" />
// Integration test: two simulated phones syncing through the real relay (wrangler dev).
// Run with: npm run test:sync
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { RelayClient, RelayError } from '../src/sync/client';
import { deviceIdFor, sealContext, wrapKey } from '../src/sync/crypto';
import { UntrustedKeyError } from '../src/sync/engine';
import {
  createFamily,
  deleteFamily,
  isRemovedError,
  joinFamily,
  leaveFamily,
  loadEngine,
} from '../src/sync/setup';
import { phone, random, type Phone } from './phone';
import { startRelay, type LocalRelay } from './relay-harness';

let relay: LocalRelay;

before(async () => {
  relay = await startRelay(8790 + Math.floor(Math.random() * 100));
});
after(async () => {
  await relay.stop();
});

async function syncAll(...phones: Phone[]) {
  for (const p of phones) await (await loadEngine(p))!.sync();
}

async function entriesOf(p: Phone) {
  const [child] = await p.repo.listChildren();
  return child ? p.repo.listEntries(child.id, 0) : [];
}

describe('partner sync', () => {
  it('shares existing data with a partner who joins, then syncs both ways', async () => {
    const a = await phone();
    const b = await phone();

    const child = await a.repo.addChild('Micky', '2026-10-01');
    await a.repo.updateChild(child.id, {
      name: 'Micky',
      birthDate: '2026-10-01',
      dueDate: '2026-10-20',
    });
    const t = Date.now() - 60 * 60_000;
    await a.repo.addEntry(child.id, {
      kind: 'feeding',
      start: t,
      end: t + 15 * 60_000,
      data: { type: 'breast_milk', method: 'left' },
    });
    // B logged something before joining; joining replaces it with the family's log.
    const own = await b.repo.addChild('Other', null);
    await b.repo.addEntry(own.id, {
      kind: 'diaper',
      start: t,
      end: t,
      data: { wet: true, solid: false },
    });

    const engineA = await createFamily(a, relay.url);
    const { code } = await engineA.createInvite();
    assert.match(code, /^BT1\./);
    await joinFamily(b, code);

    assert.deepEqual(
      (await b.repo.listChildren()).map((c) => [c.name, c.dueDate]),
      [['Micky', '2026-10-20']],
    );
    assert.equal((await b.repo.getSettings()).activeChildId, null);
    const bEntries = await entriesOf(b);
    assert.equal(bEntries.length, 1);
    assert.equal(bEntries[0].kind, 'feeding');

    // B logs a diaper and starts a sleep; A sees both.
    await b.repo.addEntry(child.id, {
      kind: 'diaper',
      start: Date.now(),
      end: Date.now(),
      data: { wet: true, solid: true },
    });
    const sleep = await b.repo.startTimer(child.id, 'sleep', { nap: true });
    await syncAll(b, a);
    const aEntries = await entriesOf(a);
    assert.deepEqual(aEntries.map((e) => e.kind).sort(), ['diaper', 'feeding', 'sleep']);
    assert.equal(aEntries.find((e) => e.id === sleep.id)?.end, null);

    // A stops the sleep B started; B sees it stopped.
    a.advance(1000);
    assert.equal(await a.repo.stopEntry(sleep.id), true);
    await syncAll(a, b);
    assert.notEqual((await b.repo.getEntry(sleep.id))?.end, null);

    // Deletes propagate.
    const feed = aEntries.find((e) => e.kind === 'feeding')!;
    await b.repo.deleteEntry(feed.id);
    await syncAll(b, a);
    assert.equal(
      (await entriesOf(a)).some((e) => e.id === feed.id),
      false,
    );
  });

  it('settles conflicting edits on the most recent one, on both phones', async () => {
    const a = await phone();
    const b = await phone();
    const child = await a.repo.addChild('Micky', null);
    const t = Date.now() - 30 * 60_000;
    const e = await a.repo.addEntry(child.id, {
      kind: 'sleep',
      start: t,
      end: t + 10 * 60_000,
      data: { nap: true },
    });
    const engineA = await createFamily(a, relay.url);
    await joinFamily(b, (await engineA.createInvite()).code);

    // Both edit offline; B's edit is later.
    await a.repo.updateEntry(e.id, {
      kind: 'sleep',
      start: t,
      end: t + 20 * 60_000,
      data: { nap: true },
      notes: 'from A',
    });
    b.advance(5_000);
    await b.repo.updateEntry(e.id, {
      kind: 'sleep',
      start: t,
      end: t + 25 * 60_000,
      data: { nap: true },
      notes: 'from B',
      tags: ['teething'],
    });

    await syncAll(a, b, a);
    assert.equal((await a.repo.getEntry(e.id))?.notes, 'from B');
    assert.equal((await b.repo.getEntry(e.id))?.notes, 'from B');
    assert.deepEqual((await a.repo.getEntry(e.id))?.tags, ['teething']);
  });

  it('rejects reused invites, outsiders and phones that left', async () => {
    const a = await phone();
    const b = await phone();
    const c = await phone();
    await a.repo.addChild('Micky', null);
    const engineA = await createFamily(a, relay.url);
    const { code } = await engineA.createInvite();
    await joinFamily(b, code);

    await assert.rejects(joinFamily(c, code), (err: unknown) => {
      assert.ok(err instanceof RelayError);
      assert.equal(err.code, 'invite_invalid');
      return true;
    });
    assert.equal(await c.repo.getSyncState(), null);

    // A device that is not a member cannot read the family's (encrypted) log.
    const outsider = new RelayClient(relay.url, engineA.client.familyId, random(32));
    await assert.rejects(outsider.pull(0), (err: unknown) => (err as RelayError).status === 403);

    await leaveFamily(b);
    assert.equal(await b.repo.getSyncState(), null);
    assert.equal((await b.repo.listChildren()).length, 1, 'local data stays after leaving');
    const devices = await engineA.client.devices();
    assert.equal(devices.devices.length, 1);
  });

  it('only stores ciphertext on the relay', async () => {
    const a = await phone();
    await a.repo.addChild('Micky Secretname', null);
    const engineA = await createFamily(a, relay.url);
    const { changes } = await engineA.client.pull(0);
    assert.ok(changes.length > 0);
    for (const c of changes) assert.ok(!c.body.includes('Secretname'));
  });

  it('removes a phone and moves the others to a new family key', async () => {
    const [a, b, c] = [await phone(), await phone(), await phone()];
    const child = await a.repo.addChild('Micky', null);
    const engineA = await createFamily(a, relay.url);
    await joinFamily(b, (await engineA.createInvite()).code);
    await joinFamily(c, (await engineA.createInvite()).code);
    const engineC = (await loadEngine(c))!;

    // B logs something before it learns about the new key: its push is refused once,
    // then sealed again with the new key.
    const [childB] = await b.repo.listChildren();
    const t = Date.now();
    await b.repo.addEntry(childB.id, {
      kind: 'diaper',
      start: t,
      end: t,
      data: { wet: true, solid: false },
    });

    await engineA.removeDevice(engineC.client.deviceId);
    assert.equal(engineA.epoch, 1);
    const devices = await engineA.devices();
    assert.deepEqual(
      devices.map((d) => d.id).sort(),
      [engineA.client.deviceId, (await loadEngine(b))!.client.deviceId].sort(),
    );

    await a.repo.addEntry(child.id, {
      kind: 'diaper',
      start: t + 1,
      end: t + 1,
      data: { wet: false, solid: true },
    });
    await syncAll(b, a, b);
    assert.equal((await loadEngine(b))!.epoch, 1, 'B stored the new key');
    assert.equal((await entriesOf(a)).length, 2);
    assert.equal((await entriesOf(b)).length, 2);

    // C is out: the relay refuses it, and what it still knows cannot open new data.
    await assert.rejects(engineC.sync(), (e: unknown) => isRemovedError(e));
    const { changes } = await engineA.client.pull(0);
    assert.ok(changes.length > 0);
    for (const ch of changes) assert.throws(() => engineC.openChange(ch.body));
  });

  it('drops changes every phone has received; a later partner still gets everything', async () => {
    const [a, b, c] = [await phone(), await phone(), await phone()];
    const child = await a.repo.addChild('Micky', null);
    const engineA = await createFamily(a, relay.url);
    await joinFamily(b, (await engineA.createInvite()).code);
    const t = Date.now() - 60 * 60_000;
    for (let i = 0; i < 5; i++) {
      await a.repo.addEntry(child.id, {
        kind: 'diaper',
        start: t + i * 60_000,
        end: t + i * 60_000,
        data: { wet: true, solid: false },
      });
    }
    await syncAll(a, b, a, b);
    assert.equal((await engineA.client.pull(0)).changes.length, 0, 'relay dropped the log');

    await joinFamily(c, (await engineA.createInvite()).code);
    assert.equal((await entriesOf(c)).length, 5);
    assert.deepEqual(
      (await c.repo.listChildren()).map((k) => k.name),
      ['Micky'],
    );
  });

  it('deletes the family; the other phones stop syncing and keep their log', async () => {
    const [a, b] = [await phone(), await phone()];
    await a.repo.addChild('Micky', null);
    const engineA = await createFamily(a, relay.url);
    await joinFamily(b, (await engineA.createInvite()).code);
    const engineB = (await loadEngine(b))!;

    await deleteFamily(a);
    assert.equal(await a.repo.getSyncState(), null);
    await assert.rejects(engineB.sync(), (e: unknown) => isRemovedError(e));
    assert.equal((await b.repo.listChildren()).length, 1);
  });

  it('only lets a phone remove itself without a new key', async () => {
    const [a, b] = [await phone(), await phone()];
    await a.repo.addChild('Micky', null);
    const engineA = await createFamily(a, relay.url);
    await joinFamily(b, (await engineA.createInvite()).code);
    const engineB = (await loadEngine(b))!;
    await assert.rejects(
      engineA.client.revoke(engineB.client.deviceId),
      (e: unknown) => (e as RelayError).code === 'use_rotate',
    );
  });
});

type Json = Record<string, unknown>;

/**
 * The real relay, with its answers to this phone changed by `tamper` (method, path below
 * the family, response JSON, request JSON): a compromised relay.
 */
function lyingRelay(tamper: (method: string, path: string, res: Json, req?: Json) => void) {
  return async (input: string | URL | Request, init?: RequestInit) => {
    const response = await fetch(input, init);
    if (!response.ok) return response;
    const path = new URL(String(input)).pathname.replace(/^\/v1\/families\/[^/]+/, '');
    const res = (await response.json()) as Json;
    const req = init?.body ? (JSON.parse(String(init.body)) as Json) : undefined;
    tamper(init?.method ?? 'GET', path, res, req);
    return Response.json(res, { status: response.status });
  };
}

describe('a compromised relay (#41)', () => {
  it('cannot hand a phone a family key of its own', async () => {
    const [a, b] = [await phone(), await phone()];
    await a.repo.addChild('Micky', null);
    const engineA = await createFamily(a, relay.url);
    await joinFamily(b, (await engineA.createInvite()).code);
    const engineB = (await loadEngine(b))!;

    // The relay invents a phone and a new key "from" it for B.
    const ghost = random(32);
    const ghostId = deviceIdFor(ghost);
    const context = sealContext.wrap(engineB.client.familyId, 1, engineB.client.deviceId);
    const wrap = wrapKey(ghost, engineB.client.deviceId, random(32), random, context);
    b.fetch = lyingRelay((method, path, res) => {
      if (path === '/devices') {
        (res.devices as Json[]).push({ id: ghostId, createdAt: 0, lastSeenAt: null, label: null });
      }
      if (path.startsWith('/changes') && method === 'GET') res.epoch = 1;
      if (path === '/key') {
        Object.assign(res, { epoch: 1, wrap: { epoch: 1, from: ghostId, body: wrap } });
      }
    }) as typeof fetch;

    const lied = (await loadEngine(b))!;
    await assert.rejects(lied.sync(), (e: unknown) => e instanceof UntrustedKeyError);
    assert.equal((await loadEngine(b))!.epoch, 0, 'B kept its key');
    const ghostRow = (await lied.devices()).find((d) => d.id === ghostId);
    assert.deepEqual([ghostRow?.trusted, ghostRow?.name], [false, null]);
  });

  it('cannot get the new key for an invented phone when a phone is removed', async () => {
    const [a, b, c] = [await phone(), await phone(), await phone()];
    await a.repo.addChild('Micky', null);
    const engineA = await createFamily(a, relay.url);
    await joinFamily(b, (await engineA.createInvite()).code);
    await joinFamily(c, (await engineA.createInvite()).code);
    await syncAll(a, b, c, a);
    const idB = (await loadEngine(b))!.client.deviceId;
    const idC = (await loadEngine(c))!.client.deviceId;

    // The phones learnt each other from the encrypted member list.
    const codes = await Promise.all(
      [a, b, c].map(async (p) => (await loadEngine(p))!.safetyCode()),
    );
    assert.equal(new Set(codes).size, 1, 'all phones trust the same phones');

    const ghostId = deviceIdFor(random(32));
    let rotate: Json | undefined;
    a.fetch = lyingRelay((method, path, res, req) => {
      if (path === '/devices') {
        (res.devices as Json[]).push({ id: ghostId, createdAt: 0, lastSeenAt: null, label: null });
      }
      if (path === '/rotate') rotate = req;
    }) as typeof fetch;

    await (await loadEngine(a))!.removeDevice(idC);
    const wraps = Object.keys((rotate!.wraps ?? {}) as Json).sort();
    assert.deepEqual(wraps, [engineA.client.deviceId, idB].sort(), 'no key for the ghost');
    assert.deepEqual(rotate!.remove, [idC, ghostId]);

    // B follows the rotation (A is trusted) and drops C from its list too.
    await syncAll(b);
    const [engineA2, engineB] = [(await loadEngine(a))!, (await loadEngine(b))!];
    assert.equal(engineB.epoch, 1);
    assert.equal(await engineB.safetyCode(), await engineA2.safetyCode());
    assert.notEqual(await engineB.safetyCode(), codes[0], 'C is no longer trusted');
    const membersB = await b.repo.listMembers();
    assert.ok(membersB.find((m) => m.id === idC)?.removedAt, 'C stays removed on B');
  });
});
