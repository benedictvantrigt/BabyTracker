import type { Repo } from '@/db/repo';
import { runningEntries } from '@/domain/entries';
import { computeReminders } from '@/domain/reminders';
import { DAY } from '@/domain/time';

import { syncNotifications } from './scheduler';

/**
 * Brings this phone's notifications in line with the log: one ongoing notification per
 * running timer, and nap/feed reminders scheduled on the phone, unless they are switched
 * off here or the sync server delivers them by push. Works without the UI (background push).
 */
export async function refreshNotifications(repo: Repo, now = Date.now()): Promise<void> {
  const [settings, children, sync] = await Promise.all([
    repo.getSettings(),
    repo.listChildren(),
    repo.getSyncState(),
  ]);
  const child = children.find((c) => c.id === settings.activeChildId) ?? children[0];
  if (!child) return;
  const entries = await repo.listEntries(child.id, now - 2 * DAY);
  const localReminders = settings.remindersOnThisPhone && !sync?.pushActive;
  const reminders = localReminders ? computeReminders(entries, settings, child, now) : [];
  await syncNotifications(reminders, runningEntries(entries), child.name);
}
