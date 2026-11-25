/// <reference types="jest" />
/// <reference types="node" />
import { openDatabaseAsync } from 'expo-sqlite';
import * as TaskManager from 'expo-task-manager';

import { setAppRepo } from '@/data/app-repo';
import { nodeDb } from '@/db/node-db';
import { Repo } from '@/db/repo';
import { migrate } from '@/db/schema';
import { loadEngine } from '@/sync/setup';

import '../push-task';

jest.mock('expo-task-manager', () => ({ defineTask: jest.fn() }));
jest.mock('expo-notifications', () => ({
  registerTaskAsync: jest.fn(() => Promise.resolve()),
  BackgroundNotificationTaskResult: { NewData: 1, NoData: 2, Failed: 3 },
}));
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));
jest.mock('expo-crypto', () => ({ getRandomBytes: jest.fn(), randomUUID: jest.fn() }));
jest.mock('@/sync/setup', () => ({ loadEngine: jest.fn() }));
jest.mock('@/sync/secure-store', () => ({ secureStore: {} }));
jest.mock('@/sync/reminders', () => ({ openReminder: jest.fn() }));
jest.mock('@/notifications/refresh', () => ({
  refreshNotifications: jest.fn(() => Promise.resolve()),
}));
jest.mock('@/notifications/scheduler', () => ({ presentPushedReminder: jest.fn() }));
jest.mock('@/widget/widget-task', () => ({ updateWidgets: jest.fn(() => Promise.resolve()) }));

const NOW = new Date(2026, 10, 25, 12, 0).getTime();

async function phone(prefix: string): Promise<Repo> {
  const db = nodeDb();
  await migrate(db);
  let n = 0;
  return new Repo(db, { uuid: () => `${prefix}-${++n}`, now: () => NOW });
}

type Task = (body: { data: unknown; error: unknown }) => Promise<unknown>;

afterEach(() => setAppRepo(null));

describe('push task', () => {
  it("pulls a partner's change through the running app's repository, so the screens redraw", async () => {
    // The partner logs a wet diaper.
    const partner = await phone('partner');
    const child = await partner.addChild('Micky', '2026-08-01');
    await partner.addEntry(child.id, {
      kind: 'diaper',
      start: NOW,
      end: NOW,
      data: { wet: true, solid: false },
    });
    const [diaper] = await partner.listEntries(child.id, 0);

    // This phone has the app running; its screens listen to its repository.
    const app = await phone('app');
    setAppRepo(app);
    const heard: boolean[] = [];
    app.subscribe(({ remote }) => heard.push(remote));

    // The sync round pulls the diaper into whichever repository the task gave the engine.
    jest.mocked(loadEngine).mockImplementation(
      async ({ repo }) =>
        ({
          sync: async () => ({
            pushed: 0,
            pulled: await repo.applyRemote(
              [
                { type: 'child', row: child },
                { type: 'entry', row: diaper },
              ],
              1,
            ),
          }),
        }) as never,
    );

    const task = jest.mocked(TaskManager.defineTask).mock.calls[0][1] as unknown as Task;
    const result = await task({ data: { data: { type: 'sync' } }, error: null });

    expect(result).toBe(1); // NewData
    expect(heard).toEqual([true]);
    expect(await app.listEntries(child.id, 0)).toHaveLength(1);
    // No second repository on the same database, whose changes nobody hears of.
    expect(openDatabaseAsync).not.toHaveBeenCalled();
  });
});
