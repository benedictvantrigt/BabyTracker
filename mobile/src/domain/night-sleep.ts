import { lastCompletedSleep } from './entries';
import { DAY, HOUR, atMinuteOfDay, isDaytime } from './time';
import type { Entry, Settings } from './types';

// "Track night sleep" off: the phone tracks day sleep (naps) only. The night is often not
// logged at all, so the morning counts from the day start instead of the end of a night.

type NightSettings = Pick<Settings, 'nightSleep' | 'dayStartMinute' | 'dayEndMinute'>;

/** A wake-up up to this long before the day start still counts as the morning. */
export const MORNING_SLACK = HOUR;

/**
 * Whether this phone may start a sleep timer at `ms`: always, unless it tracks day sleep
 * only and `ms` falls outside the daytime window.
 */
export function sleepTimerAllowed(settings: NightSettings, ms: number): boolean {
  return settings.nightSleep || isDaytime(ms, settings.dayStartMinute, settings.dayEndMinute);
}

/** Night on a phone that tracks day sleep only: no sleep timer and no awake time then. */
export function isUntrackedNight(settings: NightSettings, ms: number): boolean {
  return !sleepTimerAllowed(settings, ms);
}

/** The next day start (wake-up time) from `now`: today's if it is still to come, else tomorrow's. */
export function nextDayStart(settings: Pick<Settings, 'dayStartMinute'>, now: number): number {
  const today = atMinuteOfDay(now, settings.dayStartMinute);
  return today > now ? today : atMinuteOfDay(now + DAY, settings.dayStartMinute);
}

/**
 * When the baby last woke up, for "awake since" and the awake timer: the end of the last
 * sleep. On a phone that tracks day sleep only, during the day a last sleep that ended
 * before the morning (or no sleep at all) counts as waking at today's day start.
 * Null when no sleep has ended and the night is tracked.
 */
export function lastWake(entries: Entry[], settings: NightSettings, now: number): number | null {
  const end = lastCompletedSleep(entries)?.end ?? null;
  if (settings.nightSleep || isUntrackedNight(settings, now)) return end;
  const dayStart = atMinuteOfDay(now, settings.dayStartMinute);
  return end === null || end < dayStart - MORNING_SLACK ? dayStart : end;
}

/**
 * The wake-up the awake window counts from for the next nap: the last wake-up, or at night
 * on a phone that tracks day sleep only, the coming day start.
 */
export function awakeWindowFrom(
  entries: Entry[],
  settings: NightSettings,
  now: number,
): number | null {
  if (isUntrackedNight(settings, now)) return nextDayStart(settings, now);
  return lastWake(entries, settings, now);
}

/**
 * When a sleep started at `start` stops being a nap on a phone that tracks day sleep only:
 * the day end of the day it started. Null when the phone tracks the night too, or the sleep
 * started outside this phone's daytime (a night sleep from a partner who does track nights).
 */
export function napCutoff(settings: NightSettings, start: number): number | null {
  if (settings.nightSleep) return null;
  if (!isDaytime(start, settings.dayStartMinute, settings.dayEndMinute)) return null;
  return atMinuteOfDay(start, settings.dayEndMinute);
}

/**
 * Sleep timers left running into the night on a phone that tracks day sleep only: the sleep
 * button was tapped and never stopped. They are removed at the day end, as if never logged.
 */
export function forgottenSleeps(entries: Entry[], settings: NightSettings, now: number): Entry[] {
  return entries.filter((e) => {
    if (e.kind !== 'sleep' || e.end !== null || e.deletedAt !== null) return false;
    const cutoff = napCutoff(settings, e.start);
    return cutoff !== null && cutoff <= now;
  });
}

/** `entries` without the forgotten sleeps: what to show at `now` before the app removed them. */
export function withoutForgottenSleeps(
  entries: Entry[],
  settings: NightSettings,
  now: number,
): Entry[] {
  const forgotten = new Set(forgottenSleeps(entries, settings, now).map((e) => e.id));
  return forgotten.size ? entries.filter((e) => !forgotten.has(e.id)) : entries;
}
