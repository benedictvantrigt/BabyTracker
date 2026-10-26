/// <reference types="jest" />
/// <reference types="node" />
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

import type { Db } from '../db';
import { Repo, ValidationError } from '../repo';
import { SCHEMA_VERSION, migrate } from '../schema';

/** Adapts Node's built-in SQLite to the app's Db interface. */
function memoryDb(): Db {
  const db = new DatabaseSync(':memory:');
  return {
    execAsync: async (sql) => {
      db.exec(sql);
    },
    runAsync: async (sql, params) => db.prepare(sql).run(...(params as SQLInputValue[])),
    getFirstAsync: async <T>(sql: string, params: unknown[]) =>
      (db.prepare(sql).get(...(params as SQLInputValue[])) ?? null) as T | null,
    getAllAsync: async <T>(sql: string, params: unknown[]) =>
      db.prepare(sql).all(...(params as SQLInputValue[])) as T[],
    withTransactionAsync: async (task) => {
      db.exec('BEGIN');
      try {
        await task();
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
}

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
});
