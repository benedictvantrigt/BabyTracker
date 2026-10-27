import { lastCompletedSleep, latest } from './entries';
import { planDay, scheduleStatus, stageFor, type ScheduleStatus } from './sleep-schedule';
import { DAY, MINUTE, formatClock, formatDuration, isDaytime } from './time';
import type { Child, Entry, Settings } from './types';

export type ReminderId = 'nap' | 'wake' | 'bed' | 'feed';

/** What reminders need to know about the child. */
export type ReminderChild = Pick<Child, 'name' | 'birthDate' | 'dueDate'>;

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
  child: ReminderChild,
  now: number,
): Reminder[] {
  const childName = child.name;
  const live = entries.filter((e) => e.deletedAt === null);
  const reminders: Reminder[] = [];
  const asleep = live.some((e) => e.kind === 'sleep' && e.end === null);
  const schedule = settings.sleepSchedule ? scheduleStatus(live, child, settings, now) : null;

  if (settings.napReminders && schedule) {
    reminders.push(...scheduleReminders(schedule, child, settings, asleep, now));
  } else if (settings.napReminders && !asleep) {
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

/**
 * Reminders from the day schedule: before the next planned nap and bedtime while awake,
 * and at the planned end of a running nap. After bedtime, the next morning's first nap.
 */
function scheduleReminders(
  status: ScheduleStatus,
  child: ReminderChild,
  settings: Settings,
  asleep: boolean,
  now: number,
): Reminder[] {
  const lead = settings.napLeadMinutes * MINUTE;
  const naps = status.plan.naps.length;
  const reminders: Reminder[] = [];

  if (status.current) {
    const { slot, endAt } = status.current;
    if (endAt > now) {
      reminders.push({
        id: 'wake',
        fireAt: endAt,
        title: 'Wake-up time',
        body: slot
          ? `Nap ${slot.index} of ${naps} is planned until ${formatClock(endAt)}.`
          : `${child.name} has napped long enough; wake up at ${formatClock(endAt)}.`,
        alarm: false,
      });
    }
    return reminders;
  }
  if (asleep) return reminders;

  if (status.next && status.next.startAt - lead > now) {
    const next = status.next;
    reminders.push({
      id: 'nap',
      fireAt: next.startAt - lead,
      title: 'Nap time soon',
      body: `Nap ${next.index} of ${naps}: in bed ${formatClock(next.startAt)}–${formatClock(next.endAt)}.`,
      alarm: false,
    });
  }
  const bedAt = status.plan.bedtimeAt;
  if (bedAt - lead > now) {
    reminders.push({
      id: 'bed',
      fireAt: bedAt - lead,
      title: 'Bedtime soon',
      body: `${child.name} goes to bed at ${formatClock(bedAt)}.`,
      alarm: false,
    });
  } else {
    // Today's plan is over: remind about tomorrow's first nap.
    const tomorrow = stageFor(child, settings, now + DAY);
    const first = tomorrow && planDay(tomorrow.stage, settings, now + DAY).naps[0];
    if (first && first.startAt - lead > now) {
      reminders.push({
        id: 'nap',
        fireAt: first.startAt - lead,
        title: 'Nap time soon',
        body: `Nap 1 of ${tomorrow.stage.naps.length}: in bed ${formatClock(first.startAt)}–${formatClock(first.endAt)}.`,
        alarm: false,
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
