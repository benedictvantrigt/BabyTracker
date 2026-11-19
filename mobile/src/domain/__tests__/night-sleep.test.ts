/// <reference types="jest" />
import {
  awakeWindowFrom,
  isUntrackedNight,
  lastWake,
  nextDayStart,
  sleepTimerAllowed,
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
