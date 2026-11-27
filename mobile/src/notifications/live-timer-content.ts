import { KIND_LABEL, entryTitle } from '@/domain/entries';
import { MORNING_SLACK, lastWake } from '@/domain/night-sleep';
import { scheduleStatus } from '@/domain/sleep-schedule';
import { DAY, MINUTE, atMinuteOfDay, formatClock, isDaytime } from '@/domain/time';
import { Colors } from '@/constants/theme';
import type { RefluxWindow } from '@/domain/reflux';
import type { Child, Entry, Settings } from '@/domain/types';

/**
 * The button on a timer outside the app (#97): Wake on the sleep timer, Sleep on the awake
 * timer, Stop on a feeding timer. The tap runs without opening the app.
 */
export type TimerAction = 'wake' | 'sleep' | 'stopFeeding';

export const TIMER_ACTION_LABEL: Record<TimerAction, string> = {
  wake: 'Wake',
  sleep: 'Sleep',
  stopFeeding: 'Stop',
};

export function isTimerAction(value: unknown): value is TimerAction {
  return typeof value === 'string' && value in TIMER_ACTION_LABEL;
}

/** What a running timer shows outside the app: notification, Live Activity or Live Update. */
export interface LiveTimer {
  id: string;
  /**
   * 'awake' is the time between sleeps, counting down to the next nap or bedtime; 'reflux' the
   * upright time after a feed (#93), counting down.
   */
  kind: 'sleep' | 'feeding' | 'awake' | 'reflux';
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
  /** Its button, if any. */
  action?: TimerAction;
}

/**
 * A running timer outside the app. For sleep, `sleepPlan` (from `sleepPlanText`) says until
 * when the baby should sleep; without it the text says when the timer started.
 */
export function liveTimerFor(entry: Entry, childName: string, sleepPlan?: string | null): LiveTimer {
  return {
    id: entry.id,
    kind: entry.kind === 'sleep' ? 'sleep' : 'feeding',
    title: entry.kind === 'sleep' ? `${childName} is asleep` : entryTitle(entry),
    text:
      entry.kind === 'sleep' && sleepPlan
        ? sleepPlan
        : `${KIND_LABEL[entry.kind]} timer running since ${formatClock(entry.start)}`,
    start: entry.start,
    action: entry.kind === 'sleep' ? 'wake' : 'stopFeeding',
  };
}

/**
 * Until when the running sleep should last, as the Today screen says it: a nap until its
 * planned end, a night until the day starts. A nap needs the age schedule for its end. Null
 * while awake, or once a nap's planned end has passed (the timer then just counts on).
 */
export function sleepPlanText(
  entries: Entry[],
  child: Pick<Child, 'birthDate' | 'dueDate'>,
  settings: Settings,
  now: number,
): string | null {
  const live = entries.filter((e) => e.deletedAt === null);
  const running = live.find((e) => e.kind === 'sleep' && e.end === null);
  if (!running || running.kind !== 'sleep') return null;
  const schedule = settings.sleepSchedule ? scheduleStatus(live, child, settings, now) : null;
  if (!schedule) {
    // Without the schedule a nap has no planned length; a night lasts until the day start.
    if (running.data.nap) return null;
    const today = atMinuteOfDay(now, settings.dayStartMinute);
    return `Night until ${formatClock(now < today ? today : today + DAY)}`;
  }
  if (schedule.current) {
    const { endAt } = schedule.current;
    if (endAt <= now) return null;
    return `Nap until ${formatClock(endAt)}`;
  }
  if (!running.data.nap) {
    return `Night until ${formatClock(schedule.morningAt)}`;
  }
  return null;
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
    action: 'sleep',
  };
}

/** Accent color of a timer outside the app: the color of the kind it belongs to. */
export function timerColor(kind: LiveTimer['kind']): string {
  return Colors.light[kind === 'awake' ? 'sleep' : kind === 'reflux' ? 'feeding' : kind];
}

/** The reflux timer outside the app: counts down the upright time, then goes (#93). */
export function refluxTimerFor(window: RefluxWindow, childName: string): LiveTimer {
  return {
    id: `reflux-${window.feedId}-${window.until}`,
    kind: 'reflux',
    title: `Keep ${childName} upright`,
    text: `Until ${formatClock(window.until)}`,
    start: window.start,
    countdownTo: window.until,
    until: window.until,
  };
}
