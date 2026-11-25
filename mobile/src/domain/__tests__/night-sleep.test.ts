/// <reference types="jest" />
import {
  awakeWindowFrom,
  forgottenSleeps,
  isUntrackedNight,
  lastWake,
  nextDayStart,
  sleepTimerAllowed,
  withoutForgottenSleeps,
} from '../night-sleep';

import { at, entry, settings } from './fixtures';

// Day window 07:00–19:30 by default.
const dayOnly = { ...settings, nightSleep: false };

describe('sleepTimerAllowed', () => {
  it('always allows a sleep timer when the night is tracked', () => {
    expect(sleepTimerAllowed(settings, at(23))).toBe(true);
    expect(isUntrackedNight(settings, at(3))).toBe(false);
  });

  it('allows it only during the day when tracking day sleep only', () => {
    expect(sleepTimerAllowed(dayOnly, at(7))).toBe(true);
    expect(sleepTimerAllowed(dayOnly, at(19, 29))).toBe(true);
    expect(sleepTimerAllowed(dayOnly, at(19, 30))).toBe(false);
    expect(isUntrackedNight(dayOnly, at(6, 59))).toBe(true);
  });
});

describe('nextDayStart', () => {
  it("is today's day start before it, else tomorrow's", () => {
    expect(nextDayStart(settings, at(5))).toBe(at(7));
    expect(nextDayStart(settings, at(21))).toBe(at(7, 0, 1));
  });
});

describe('lastWake', () => {
  const evening = entry('sleep', at(16, 15, -1), at(17, 0, -1), { nap: true });

  it('is the end of the last sleep when the night is tracked', () => {
    expect(lastWake([evening], settings, at(9))).toBe(at(17, 0, -1));
    expect(lastWake([], settings, at(9))).toBeNull();
  });

  it('counts the morning from the day start when tracking day sleep only', () => {
    expect(lastWake([evening], dayOnly, at(9))).toBe(at(7));
    expect(lastWake([], dayOnly, at(9))).toBe(at(7));
    // A night logged on a partner's phone that ended close to the day start still counts.
    const night = entry('sleep', at(19, 0, -1), at(6, 30), { nap: false });
    expect(lastWake([night], dayOnly, at(9))).toBe(at(6, 30));
    const nap = entry('sleep', at(9), at(10), { nap: true });
    expect(lastWake([evening, nap], dayOnly, at(11))).toBe(at(10));
  });
});

describe('awakeWindowFrom', () => {
  it('counts from the coming day start at night when tracking day sleep only', () => {
    const evening = entry('sleep', at(16, 15), at(17), { nap: true });
    expect(awakeWindowFrom([evening], dayOnly, at(21))).toBe(at(7, 0, 1));
    expect(awakeWindowFrom([evening], settings, at(21))).toBe(at(17));
  });
});

describe('forgottenSleeps', () => {
  const nap = entry('sleep', at(17), null, { nap: true });

  it('removes a sleep still running at the day end when tracking day sleep only', () => {
    expect(forgottenSleeps([nap], dayOnly, at(19, 29))).toEqual([]);
    expect(forgottenSleeps([nap], dayOnly, at(19, 30))).toEqual([nap]);
    expect(forgottenSleeps([nap], dayOnly, at(6, 0, 1))).toEqual([nap]);
    expect(withoutForgottenSleeps([nap], dayOnly, at(22))).toEqual([]);
  });

  it('keeps stopped sleeps, tracked nights and night sleeps from a partner', () => {
    const stopped = entry('sleep', at(17), at(18), { nap: true });
    const night = entry('sleep', at(20), null, { nap: false });
    expect(forgottenSleeps([stopped, night], dayOnly, at(23))).toEqual([]);
    expect(forgottenSleeps([nap], settings, at(23))).toEqual([]);
  });
});
