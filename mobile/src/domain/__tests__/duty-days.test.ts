/// <reference types="jest" />
import { DEFAULT_SETTINGS } from '../types';
import { dutyWeekday, isOnDuty, normalizeDutyDays, toggleDutyDay } from '../duty-days';

// 2026-11-16 is a Monday.
const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 10, day, hour, minute).getTime();

describe('dutyWeekday', () => {
  it('counts the night until day start as the day before', () => {
    expect(dutyWeekday(at(17, 3), 7 * 60)).toBe(1); // Tuesday 03:00 → Monday
    expect(dutyWeekday(at(17, 6, 59), 7 * 60)).toBe(1);
    expect(dutyWeekday(at(17, 7), 7 * 60)).toBe(2);
    expect(dutyWeekday(at(17, 23, 30), 7 * 60)).toBe(2);
    // Sunday night belongs to Saturday, Monday 03:00 to Sunday.
    expect(dutyWeekday(at(16, 3), 7 * 60)).toBe(0);
    expect(dutyWeekday(at(15, 3), 7 * 60)).toBe(6);
  });
});

describe('isOnDuty', () => {
  const mondays = { ...DEFAULT_SETTINGS, dutyDays: [1 as const] };

  it('is on duty every day by default', () => {
    for (let day = 16; day <= 22; day++) expect(isOnDuty(DEFAULT_SETTINGS, at(day, 12))).toBe(true);
  });

  it('follows the marked days and the day start', () => {
    expect(isOnDuty(mondays, at(16, 12))).toBe(true);
    expect(isOnDuty(mondays, at(17, 3))).toBe(true);
    expect(isOnDuty(mondays, at(17, 8))).toBe(false);
    expect(isOnDuty(mondays, at(16, 6))).toBe(false);
    expect(isOnDuty({ ...mondays, dayStartMinute: 5 * 60 }, at(16, 6))).toBe(true);
  });

  it('is never on duty without days', () => {
    expect(isOnDuty({ ...DEFAULT_SETTINGS, dutyDays: [] }, at(16, 12))).toBe(false);
  });
});

describe('normalizeDutyDays and toggleDutyDay', () => {
  it('keeps valid days in order and reads anything else as every day', () => {
    expect(normalizeDutyDays([5, 1, 1, 9, 'x'])).toEqual([1, 5]);
    expect(normalizeDutyDays([])).toEqual([]);
    expect(normalizeDutyDays(null)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('turns a day on or off', () => {
    expect(toggleDutyDay([1, 5], 3)).toEqual([1, 3, 5]);
    expect(toggleDutyDay([1, 3, 5], 3)).toEqual([1, 5]);
  });
});
