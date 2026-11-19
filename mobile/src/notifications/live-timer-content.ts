import { KIND_LABEL, entryTitle } from '@/domain/entries';
import { MORNING_SLACK, lastWake } from '@/domain/night-sleep';
import { scheduleStatus } from '@/domain/sleep-schedule';
import { MINUTE, atMinuteOfDay, formatClock, isDaytime } from '@/domain/time';
import type { Child, Entry, Settings } from '@/domain/types';

/** What a running timer shows outside the app: notification, Live Activity or Live Update. */
export interface LiveTimer {
  id: string;
  /** 'awake' is the time between sleeps, counting down to the next nap or bedtime. */
  kind: 'sleep' | 'feeding' | 'awake';
  title: string;
  text: string;
  /** When the timer started, in milliseconds since the epoch. */
  start: number;
  /**
   * For a countdown: the time it counts down to. Once that has passed it counts on, so
   * the clock shows how long the nap is overdue.
   */
  countdownTo?: number;
  /** When the timer goes stale and should disappear even if the app does not run (day end). */
  until?: number;
}

export function liveTimerFor(entry: Entry, childName: string): LiveTimer {
  return {
    id: entry.id,
    kind: entry.kind === 'sleep' ? 'sleep' : 'feeding',
    title: entry.kind === 'sleep' ? `${childName} is asleep` : entryTitle(entry),
    text: `${KIND_LABEL[entry.kind]} timer running since ${formatClock(entry.start)}`,
    start: entry.start,
  };
}

/**
 * The awake timer: from the end of the last sleep until the next nap, during the day. The
 * nap time comes from the age-based schedule when it is on (the next planned nap, or bedtime
 * after the last one), else from the awake window. Past that time it keeps counting.
 * Null while asleep, at night, after a night waking, or when switched off on this phone.
 * A phone that tracks day sleep only counts the morning from the day start.
 */
export function awakeTimerFor(
  entries: Entry[],
  child: Pick<Child, 'name' | 'birthDate' | 'dueDate'>,
  settings: Settings,
  now: number,
): LiveTimer | null {
  if (!settings.awakeTimer) return null;
  const live = entries.filter((e) => e.deletedAt === null);
  if (live.some((e) => e.kind === 'sleep' && e.end === null)) return null;
  const { dayStartMinute, dayEndMinute } = settings;
  if (!isDaytime(now, dayStartMinute, dayEndMinute)) return null;
  const woke = lastWake(live, settings, now);
  if (woke === null) return null;
  const dayStart = atMinuteOfDay(now, dayStartMinute);
  const dayEnd = atMinuteOfDay(now, dayEndMinute);
  // Woke today, during the day or shortly before it starts (not a night waking).
  if (woke < dayStart - MORNING_SLACK || woke >= dayEnd) return null;

  let target: number;
  let text: string;
  const schedule = settings.sleepSchedule ? scheduleStatus(live, child, settings, now) : null;
  if (schedule) {
    const naps = schedule.plan.naps.length;
    if (schedule.next) {
      target = schedule.next.startAt;
      text = `Nap ${schedule.next.index} of ${naps} at ${formatClock(target)}`;
    } else {
      target = schedule.plan.bedtimeAt;
      text = `Bed at ${formatClock(target)}`;
    }
  } else {
    target = woke + settings.awakeWindowMinutes * MINUTE;
    text = `Nap at ${formatClock(target)}`;
  }

  return {
    id: `awake-${woke}-${target}`,
    kind: 'awake',
    title: `${child.name} awake since ${formatClock(woke)}`,
    text,
    start: woke,
    countdownTo: target,
    until: dayEnd,
  };
}
