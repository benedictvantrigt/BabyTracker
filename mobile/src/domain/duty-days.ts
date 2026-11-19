import type { Settings } from './types';

/** Day of the week as `Date.getDay()` numbers it: 0 is Sunday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const ALL_WEEKDAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6];

/** Monday first, as the day chips in Settings show them. */
export const WEEKDAY_ORDER: Weekday[] = [1, 2, 3, 4, 5, 6, 0];

export const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

/** Stored duty days as a sorted list of weekdays; anything unreadable means every day. */
export function normalizeDutyDays(value: unknown): Weekday[] {
  if (!Array.isArray(value)) return [...ALL_WEEKDAYS];
  return ALL_WEEKDAYS.filter((d) => value.includes(d));
}

/**
 * The day of the week a moment belongs to for duty days: a day runs from the day start to
 * the next day start, so 03:00 on Tuesday (day start 07:00) is still Monday.
 */
export function dutyWeekday(ms: number, dayStartMinute: number): Weekday {
  const d = new Date(ms);
  const minute = d.getHours() * 60 + d.getMinutes();
  const day = d.getDay();
  return (minute < dayStartMinute ? (day + 6) % 7 : day) as Weekday;
}

/** Whether this phone is on duty at `ms`: it shows reminders and timer notifications then. */
export function isOnDuty(
  settings: Pick<Settings, 'dutyDays' | 'dayStartMinute'>,
  ms: number,
): boolean {
  return settings.dutyDays.includes(dutyWeekday(ms, settings.dayStartMinute));
}

/** Turns one day on or off. */
export function toggleDutyDay(days: Weekday[], day: Weekday): Weekday[] {
  return days.includes(day)
    ? days.filter((d) => d !== day)
    : ALL_WEEKDAYS.filter((d) => d === day || days.includes(d));
}
