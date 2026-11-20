import type { Repo } from '@/db/repo';
import { computeReminders, reminderWantedHere, type ReminderId } from '@/domain/reminders';
import type { Settings } from '@/domain/types';
import { DAY } from '@/domain/time';

import type { ReminderFilter } from './client';
import type { SyncEngine } from './engine';

const REMINDER_IDS: ReminderId[] = ['nap', 'wake', 'bed', 'feed'];

/** The phone's IANA time zone, or null where the JS engine does not tell. */
export function currentTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/**
 * What this phone tells the relay about the reminders it wants: the kinds switched on here
 * and its duty days, so the relay does not push the rest (an iPhone shows a pushed alert
 * without asking the app).
 */
export function reminderFilterFor(
  settings: Pick<
    Settings,
    'napRemindersHere' | 'feedRemindersHere' | 'dutyDays' | 'dayStartMinute'
  >,
  timeZone: string | null,
): ReminderFilter {
  return {
    ids: REMINDER_IDS.filter((id) => reminderWantedHere(id, settings)),
    dutyDays: [...settings.dutyDays],
    dayStartMinute: settings.dayStartMinute,
    timeZone,
  };
}

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
    for (const r of computeReminders(entries, settings, child, now)) {
      const payload: ReminderPayload = { title: r.title, body: r.body, alarm: r.alarm };
      reminders.push({
        tag: `${r.id}-${index}`,
        fireAt: r.fireAt,
        body: engine.sealReminder(JSON.stringify(payload)),
      });
    }
  }
  await engine.client.setReminders(state.lastSeq, reminders);
}

export function openReminder(engine: SyncEngine, sealed: string): ReminderPayload | null {
  try {
    const value = JSON.parse(engine.openReminder(sealed));
    if (typeof value.title !== 'string' || typeof value.body !== 'string') return null;
    return { title: value.title, body: value.body, alarm: value.alarm === true };
  } catch {
    return null;
  }
}
