import { lastCompletedSleep, latest } from './entries';
import { MINUTE, formatClock, formatDuration, isDaytime } from './time';
import type { Entry, Settings } from './types';

export type ReminderId = 'nap' | 'feed';

export interface Reminder {
  id: ReminderId;
  fireAt: number;
  title: string;
  body: string;
  /** Alarm-style delivery (exact, shown as an upcoming alarm, loud channel). */
  alarm: boolean;
}

/**
 * The reminders that should be pending right now, derived only from the log.
 * Re-running this after every change and replacing all scheduled reminders
 * keeps notifications consistent, also once a partner's changes arrive via sync.
 */
export function computeReminders(
  entries: Entry[],
  settings: Settings,
  childName: string,
  now: number,
): Reminder[] {
  const live = entries.filter((e) => e.deletedAt === null);
  const reminders: Reminder[] = [];
  const asleep = live.some((e) => e.kind === 'sleep' && e.end === null);

  if (settings.napReminders && !asleep) {
    const sleep = lastCompletedSleep(live);
    if (sleep && sleep.end !== null) {
      const fireAt = sleep.end + settings.awakeWindowMinutes * MINUTE;
      if (fireAt > now && isDaytime(fireAt, settings.dayStartMinute, settings.dayEndMinute)) {
        reminders.push({
          id: 'nap',
          fireAt,
          title: 'Nap time',
          body: `${childName} has been awake ${formatDuration(fireAt - sleep.end)} (since ${formatClock(sleep.end)}).`,
          alarm: false,
        });
      }
    }
  }

  const feeding = latest(live, 'feeding');
  if (feeding) {
    const fireAt = feeding.start + settings.feedIntervalMinutes * MINUTE;
    const daytime = isDaytime(fireAt, settings.dayStartMinute, settings.dayEndMinute);
    const enabled = daytime ? settings.feedRemindersDay : settings.feedAlarmNight;
    if (fireAt > now && enabled) {
      reminders.push({
        id: 'feed',
        fireAt,
        title: daytime ? 'Feeding due' : `Feed ${childName}`,
        body: `Last feed started at ${formatClock(feeding.start)} (${formatDuration(fireAt - feeding.start)} ago).`,
        alarm: !daytime,
      });
    }
  }

  return reminders;
}

/** Next nap time for display on the dashboard, ignoring whether reminders are enabled. */
export function nextNapAt(entries: Entry[], settings: Settings): number | null {
  const live = entries.filter((e) => e.deletedAt === null);
  if (live.some((e) => e.kind === 'sleep' && e.end === null)) return null;
  const sleep = lastCompletedSleep(live);
  return sleep?.end != null ? sleep.end + settings.awakeWindowMinutes * MINUTE : null;
}

export function nextFeedAt(entries: Entry[], settings: Settings): number | null {
  const feeding = latest(entries, 'feeding');
  return feeding ? feeding.start + settings.feedIntervalMinutes * MINUTE : null;
}
