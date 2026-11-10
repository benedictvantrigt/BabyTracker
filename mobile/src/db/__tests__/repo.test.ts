/// <reference types="jest" />
/// <reference types="node" />
import { nodeDb } from '../node-db';
import { Repo, ValidationError } from '../repo';
import { SCHEMA_VERSION, migrate } from '../schema';

const memoryDb = () => nodeDb();

async function setup() {
  const db = memoryDb();
  await migrate(db);
  let clock = new Date(2026, 9, 26, 12, 0).getTime();
  let n = 0;
  const repo = new Repo(db, { uuid: () => `id-${++n}`, now: () => clock });
  const child = await repo.addChild(' Micky ', '2026-08-01');
  return {
    db,
    repo,
    child,
    advance: (ms: number) => (clock += ms),
    now: () => clock,
  };
}

describe('Repo', () => {
  it('migrates idempotently', async () => {
    const db = memoryDb();
    await migrate(db);
    await migrate(db);
    const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version', []);
    expect(row?.user_version).toBe(SCHEMA_VERSION);
  });

  it('creates the first child as the active child', async () => {
    const { repo, child } = await setup();
    expect(child.name).toBe('Micky');
    expect((await repo.getSettings()).activeChildId).toBe(child.id);
    await expect(repo.addChild('  ', null)).rejects.toBeInstanceOf(ValidationError);
  });

  it('stores a due date for a baby born early', async () => {
    const { repo, child } = await setup();
    expect(child.dueDate).toBeNull();
    await repo.updateChild(child.id, {
      name: 'Micky',
      birthDate: '2026-08-01',
      dueDate: '2026-09-01',
    });
    const [stored] = await repo.listChildren();
    expect(stored).toMatchObject({ birthDate: '2026-08-01', dueDate: '2026-09-01' });
  });

  it('round-trips entries and lists running timers regardless of age', async () => {
    const { repo, child, now, advance } = await setup();
    const sleep = await repo.startTimer(child.id, 'sleep', { nap: true });
    advance(3 * 60 * 60_000);
    const diaper = await repo.addEntry(child.id, {
      kind: 'diaper',
      start: now(),
      end: now(),
      data: { wet: true, solid: false, color: 'yellow' },
      notes: '  ok ',
    });

    const listed = await repo.listEntries(child.id, now() - 60_000);
    expect(listed.map((e) => e.id)).toEqual([diaper.id, sleep.id]);
    expect(listed[0]).toMatchObject({
      data: { wet: true, solid: false, color: 'yellow' },
      notes: 'ok',
    });
    expect(listed[1].end).toBeNull();
  });

  it('stores tags, keeps them when an edit leaves them out, and lists them by use', async () => {
    const { repo, child, now, advance } = await setup();
    const diaper = (tags?: string[]) =>
      ({
        kind: 'diaper',
        start: now(),
        end: now(),
        data: { wet: true, solid: false },
        tags,
      }) as const;
    const a = await repo.addEntry(child.id, diaper(['#Teething', ' teething ', '', 'Daycare']));
    expect(a.tags).toEqual(['Teething', 'Daycare']);
    expect((await repo.getEntry(a.id))?.tags).toEqual(['Teething', 'Daycare']);

    advance(60_000);
    await repo.updateEntry(a.id, { ...diaper(), notes: 'edited' });
    expect((await repo.getEntry(a.id))?.tags).toEqual(['Teething', 'Daycare']);
    await repo.updateEntry(a.id, diaper(['daycare']));
    expect((await repo.getEntry(a.id))?.tags).toEqual(['daycare']);

    advance(60_000);
    await repo.addEntry(child.id, diaper(['grandma']));
    await repo.addEntry(child.id, diaper(['grandma']));
    advance(60_000);
    await repo.addEntry(child.id, diaper(['Daycare', 'grandma']));
    const deleted = await repo.addEntry(child.id, diaper(['gone']));
    await repo.deleteEntry(deleted.id);
    expect(await repo.listTags(child.id)).toEqual(['grandma', 'Daycare']);
  });

  it('accepts entries from phones without tags', async () => {
    const { repo, child, now } = await setup();
    const row = {
      id: 'remote-1',
      childId: child.id,
      kind: 'diaper',
      start: now(),
      end: now(),
      data: { wet: true, solid: false },
      notes: '',
      createdAt: now(),
      updatedAt: now(),
      deletedAt: null,
    };
    await repo.applyRemote([{ type: 'entry', row: row as never }], 1);
    expect((await repo.getEntry('remote-1'))?.tags).toEqual([]);
  });

  it('switching sides stops the running feed and starts a new one', async () => {
    const { repo, child, advance, now } = await setup();
    const left = await repo.startTimer(child.id, 'feeding', {
      type: 'breast_milk',
      method: 'left',
    });
    advance(10 * 60_000);
    const right = await repo.startTimer(child.id, 'feeding', {
      type: 'breast_milk',
      method: 'right',
    });
    expect((await repo.getEntry(left.id))?.end).toBe(now());
    expect((await repo.getEntry(right.id))?.end).toBeNull();

    advance(5 * 60_000);
    expect(await repo.stopEntry(right.id)).toBe(true);
    expect(await repo.stopEntry(right.id)).toBe(false);
    expect((await repo.getEntry(right.id))?.end).toBe(now());
  });

  it('soft-deletes and restores, notifying subscribers', async () => {
    const { repo, child, now } = await setup();
    const listener = jest.fn();
    repo.subscribe(listener);
    const e = await repo.addEntry(child.id, {
      kind: 'diaper',
      start: now(),
      end: now(),
      data: { wet: true, solid: true },
    });
    await repo.deleteEntry(e.id);
    expect(await repo.listEntries(child.id, 0)).toEqual([]);
    expect((await repo.getEntry(e.id))?.deletedAt).toBe(now());
    await repo.restoreEntry(e.id);
    expect(await repo.listEntries(child.id, 0)).toHaveLength(1);
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('rejects invalid edits', async () => {
    const { repo, child, now } = await setup();
    const e = await repo.addEntry(child.id, {
      kind: 'sleep',
      start: now() - 60_000,
      end: now(),
      data: { nap: true },
    });
    await expect(
      repo.updateEntry(e.id, {
        kind: 'sleep',
        start: now(),
        end: now() - 60_000,
        data: { nap: true },
      }),
    ).rejects.toThrow(/before the start/);
  });

  it('stores settings over defaults', async () => {
    const { repo } = await setup();
    await repo.updateSettings({ awakeWindowMinutes: 105, feedAlarmNight: false });
    const s = await repo.getSettings();
    expect(s.awakeWindowMinutes).toBe(105);
    expect(s.feedAlarmNight).toBe(false);
    expect(s.feedIntervalMinutes).toBe(240);
  });

  it('stores the dashboard layout and drops unknown cards', async () => {
    const { repo } = await setup();
    expect((await repo.getSettings()).dashboardLayout).toEqual({
      order: ['timers', 'sleep', 'feeding', 'diaper', 'records', 'today'],
      off: [],
    });
    const layout = {
      order: ['today', 'records', 'diaper', 'feeding', 'sleep', 'timers'],
      off: ['feeding'],
    } as const;
    await repo.updateSettings({ dashboardLayout: { order: [...layout.order], off: ['feeding'] } });
    expect((await repo.getSettings()).dashboardLayout).toEqual(layout);
    await repo.updateSettings({
      dashboardLayout: { order: ['diaper', 'weather'], off: ['weather'] } as never,
    });
    expect((await repo.getSettings()).dashboardLayout).toEqual({
      order: ['diaper', 'timers', 'sleep', 'feeding', 'records', 'today'],
      off: [],
    });
  });

  it('migrates the layout stored by 0.5 and older', async () => {
    const { db, repo } = await setup();
    await db.runAsync('INSERT INTO settings (key, value) VALUES (?, ?)', [
      'dashboardCards',
      JSON.stringify(['diaper', 'sleep']),
    ]);
    expect((await repo.getSettings()).dashboardLayout).toEqual({
      order: ['diaper', 'sleep', 'timers', 'feeding', 'records', 'today'],
      off: ['timers', 'feeding', 'records', 'today'],
    });
    // Once a new layout is saved it wins over the old key.
    await repo.updateSettings({ dashboardLayout: { order: ['sleep'], off: [] } });
    expect((await repo.getSettings()).dashboardLayout.off).toEqual([]);
  });

  describe('family members (#41)', () => {
    const state = { familyId: 'f', relayUrl: 'https://relay.example', lastSeq: 0 };

    it('starts with the given members and announces them', async () => {
      const { repo } = await setup();
      await repo.startSync(state, true, [{ id: 'me', addedBy: 'inviter' }]);
      expect((await repo.listMembers()).map((m) => [m.id, m.addedBy])).toEqual([
        ['me', 'inviter'],
      ]);
      const bodies = (await repo.outboxBatch(10)).map((o) => JSON.parse(o.body));
      expect(bodies).toEqual([{ type: 'member', row: expect.objectContaining({ id: 'me' }) }]);
    });

    it('keeps a removed phone removed, whatever copy arrives later', async () => {
      const { repo, now, advance } = await setup();
      await repo.startSync(state, true, [{ id: 'me', addedBy: null }]);
      const ghost = { id: 'x', addedBy: 'me', updatedAt: now(), removedAt: null };
      await repo.applyRemote([{ type: 'member', row: ghost }], 1);
      expect((await repo.listMembers()).find((m) => m.id === 'x')?.removedAt).toBeNull();

      advance(1000);
      await repo.removeMember('x');
      advance(1000);
      // A newer copy without the removal (e.g. replayed) does not bring it back.
      await repo.applyRemote([{ type: 'member', row: { ...ghost, updatedAt: now() } }], 2);
      expect((await repo.listMembers()).find((m) => m.id === 'x')?.removedAt).not.toBeNull();
    });

    it('puts members in the snapshot and forgets them when sync stops', async () => {
      const { repo } = await setup();
      await repo.startSync(state, false, [{ id: 'me', addedBy: null }]);
      await repo.ackOutbox(Number.MAX_SAFE_INTEGER);
      await repo.enqueueSnapshot();
      const types = (await repo.outboxBatch(100)).map((o) => JSON.parse(o.body).type);
      expect(types).toContain('member');
      await repo.stopSync();
      expect(await repo.listMembers()).toEqual([]);
    });
  });
});
