// Handles pushes from the sync server, also when the app is closed (headless JS task).
// Imported from index.ts before Expo Router so the task is defined at startup.
import { getRandomBytes, randomUUID } from 'expo-crypto';
import * as Notifications from 'expo-notifications';
import { openDatabaseAsync } from 'expo-sqlite';
import * as TaskManager from 'expo-task-manager';

import { Repo } from '@/db/repo';
import { migrate } from '@/db/schema';
import { refreshNotifications } from '@/notifications/refresh';
import { presentPushedReminder } from '@/notifications/scheduler';
import { openReminder } from '@/sync/reminders';
import { secureStore } from '@/sync/secure-store';
import { loadEngine } from '@/sync/setup';

export const PUSH_TASK = 'babytracker-push';

type Message = { type?: string; tag?: string; payload?: string };

function readMessage(data: Record<string, unknown>): Message {
  let fromString: Message = {};
  if (typeof data.dataString === 'string') {
    try {
      fromString = JSON.parse(data.dataString);
    } catch {
      // ignore
    }
  }
  return { ...(data as Message), ...fromString };
}

async function handle(message: Message): Promise<boolean> {
  const db = await openDatabaseAsync('babytracker.db');
  await migrate(db);
  const repo = new Repo(db, { uuid: randomUUID, now: Date.now });
  const engine = await loadEngine({ repo, store: secureStore, random: getRandomBytes });
  if (!engine) return false;

  if (message.type === 'reminder' && message.tag && message.payload) {
    const settings = await repo.getSettings();
    const reminder = openReminder(engine, message.payload);
    if (!reminder || !settings.remindersOnThisPhone) return false;
    await presentPushedReminder(message.tag, reminder);
    return true;
  }
  if (message.type === 'sync') {
    const { pulled } = await engine.sync();
    await refreshNotifications(repo);
    return pulled > 0;
  }
  return false;
}

TaskManager.defineTask<Notifications.NotificationTaskPayload>(
  PUSH_TASK,
  async ({ data, error }) => {
    if (error || !data || 'actionIdentifier' in data) {
      return Notifications.BackgroundNotificationTaskResult.NoData;
    }
    try {
      const changed = await handle(readMessage(data.data ?? {}));
      return changed
        ? Notifications.BackgroundNotificationTaskResult.NewData
        : Notifications.BackgroundNotificationTaskResult.NoData;
    } catch {
      return Notifications.BackgroundNotificationTaskResult.Failed;
    }
  },
);

Notifications.registerTaskAsync(PUSH_TASK).catch(() => {});
