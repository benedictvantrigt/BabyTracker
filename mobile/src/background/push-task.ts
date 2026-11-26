// Handles pushes from the sync server, also when the app is closed (headless JS task).
// Imported from index.ts before Expo Router so the task is defined at startup.
import { getRandomBytes, randomUUID } from 'expo-crypto';
import * as Notifications from 'expo-notifications';
import { openDatabaseAsync } from 'expo-sqlite';
import * as TaskManager from 'expo-task-manager';

import { getAppRepo } from '@/data/app-repo';
import { Repo } from '@/db/repo';
import { migrate } from '@/db/schema';
import { isOnDuty } from '@/domain/duty-days';
import { reminderWantedHere } from '@/domain/reminders';
import { refreshNotifications } from '@/notifications/refresh';
import { presentPushedReminder } from '@/notifications/scheduler';
import { openReminder } from '@/sync/reminders';
import { secureStore } from '@/sync/secure-store';
import { loadEngine } from '@/sync/setup';
import { updateWidgets } from '@/widget/widget-task';

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

/**
 * The app's repository when the app is running (in the background): what the push pulls then
 * reaches its screens at once. With a repository of its own, the open app went on showing the
 * old log, and "Sync now" found nothing new to pull, until it was restarted.
 */
async function pushRepo(): Promise<Repo> {
  const app = getAppRepo();
  if (app) return app;
  const db = await openDatabaseAsync('babytracker.db');
  await migrate(db);
  return new Repo(db, { uuid: randomUUID, now: Date.now });
}

async function handle(message: Message): Promise<boolean> {
  const repo = await pushRepo();
  const engine = await loadEngine({ repo, store: secureStore, random: getRandomBytes });
  if (!engine) return false;

  if (message.type === 'reminder' && message.tag && message.payload) {
    const settings = await repo.getSettings();
    let reminder = openReminder(engine, message.payload);
    if (!reminder) {
      // Sealed with a family key this phone has not fetched yet (a phone was removed).
      await engine.sync().catch(() => {});
      reminder = openReminder(engine, message.payload);
    }
    // A pushed reminder is due now: shown only on this phone's duty days, and only if this
    // phone wants its kind (the tag starts with the reminder id: nap, wake, bed or feed).
    const id = message.tag.split('-')[0];
    if (!reminder || !reminderWantedHere(id, settings) || !isOnDuty(settings, Date.now())) {
      return false;
    }
    await presentPushedReminder(message.tag, reminder);
    return true;
  }
  if (message.type === 'sync') {
    const { pulled } = await engine.sync();
    await refreshNotifications(repo);
    if (pulled > 0) await updateWidgets(repo).catch(() => {});
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
