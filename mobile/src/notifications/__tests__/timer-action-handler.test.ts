/// <reference types="jest" />
/// <reference types="node" />
import { nodeDb } from '@/db/node-db';
import { Repo } from '@/db/repo';
import { migrate } from '@/db/schema';
import { MINUTE } from '@/domain/time';

import { handleTimerAction } from '../timer-action-handler';

async function setup() {
  const db = nodeDb();
  await migrate(db);
  let clock = new Date(2026, 9, 26, 12, 0).getTime();
  let n = 0;
  const repo = new Repo(db, { uuid: () => `id-${++n}`, now: () => clock });
  const child = await repo.addChild('Micky', '2026-08-01');
  await repo.updateSettings({ activeChildId: child.id });
  const running = async () =>
    (await repo.listEntries(child.id, 0)).filter((e) => e.end === null).map((e) => e.kind);
  return { repo, child, running, advance: (ms: number) => (clock += ms), now: () => clock };
}

describe('handleTimerAction', () => {
  it('Wake stops the running sleep, and does nothing without one', async () => {
    const { repo, child, running, advance, now } = await setup();
    await repo.startTimer(child.id, 'sleep', { nap: true });
    advance(30 * MINUTE);
    expect(await handleTimerAction(repo, 'wake', now())).toBe(true);
    expect(await running()).toEqual([]);
    advance(MINUTE);
    expect(await handleTimerAction(repo, 'wake', now())).toBe(false);
  });

  it('Sleep starts a sleep, but not over one a partner already started', async () => {
    const { repo, child, running, advance, now } = await setup();
    expect(await handleTimerAction(repo, 'sleep', now())).toBe(true);
    expect(await running()).toEqual(['sleep']);
    advance(MINUTE);
    expect(await handleTimerAction(repo, 'sleep', now())).toBe(false);
    expect((await repo.listEntries(child.id, 0)).length).toBe(1);
  });

  it('ignores a second tap right after the first', async () => {
    const { repo, child, running, advance, now } = await setup();
    await repo.startTimer(child.id, 'sleep', { nap: true });
    advance(30 * MINUTE);
    expect(await handleTimerAction(repo, 'wake', now())).toBe(true);
    advance(1_000);
    expect(await handleTimerAction(repo, 'sleep', now())).toBe(false);
    expect(await running()).toEqual([]);
  });

  it('Stop ends the running feed', async () => {
    const { repo, child, running, advance, now } = await setup();
    await repo.startTimer(child.id, 'feeding', { type: 'breast_milk', method: 'left' });
    advance(10 * MINUTE);
    expect(await handleTimerAction(repo, 'stopFeeding', now())).toBe(true);
    expect(await running()).toEqual([]);
  });
});
