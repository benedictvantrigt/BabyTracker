/// <reference types="node" />
// Integration test: two simulated phones syncing through the real relay (wrangler dev).
// Run with: npm run test:sync
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { RelayClient, RelayError } from '../src/sync/client';
import { createFamily, joinFamily, leaveFamily, loadEngine } from '../src/sync/setup';
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
    });

    await syncAll(a, b, a);
    assert.equal((await a.repo.getEntry(e.id))?.notes, 'from B');
    assert.equal((await b.repo.getEntry(e.id))?.notes, 'from B');
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
});
