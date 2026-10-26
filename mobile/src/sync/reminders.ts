import type { Repo } from '@/db/repo';
import { computeReminders } from '@/domain/reminders';
import { DAY } from '@/domain/time';

import type { SyncEngine } from './engine';

/** What the relay pushes when a reminder is due; sealed with the family key. */
export interface ReminderPayload {
  title: string;
  body: string;
  alarm: boolean;
}

/**
 * Computes the family's reminders from the shared log and rules and hands them to the
 * relay, which pushes them when due. Call after a sync round, so `basis` covers the
 * latest log; the relay ignores a set computed from an older log.
 */
export async function publishReminders(repo: Repo, engine: SyncEngine, now = Date.now()) {
  const state = await repo.getSyncState();
  if (!state) return;
  const settings = await repo.getSettings();
  const children = await repo.listChildren();
  const reminders = [];
  for (const [index, child] of children.entries()) {
    const entries = await repo.listEntries(child.id, now - 2 * DAY);
    for (const r of computeReminders(entries, settings, child.name, now)) {
      const payload: ReminderPayload = { title: r.title, body: r.body, alarm: r.alarm };
      reminders.push({
        tag: `${r.id}-${index}`,
        fireAt: r.fireAt,
        body: engine.seal(JSON.stringify(payload)),
      });
    }
  }
  await engine.client.setReminders(state.lastSeq, reminders);
}

export function openReminder(engine: SyncEngine, sealed: string): ReminderPayload | null {
  try {
    const value = JSON.parse(engine.open(sealed));
    if (typeof value.title !== 'string' || typeof value.body !== 'string') return null;
    return { title: value.title, body: value.body, alarm: value.alarm === true };
  } catch {
    return null;
  }
}
