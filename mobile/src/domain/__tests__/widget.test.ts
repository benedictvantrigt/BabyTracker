/// <reference types="jest" />
import { isRepeatTap, widgetSummary } from '../widget';

import { at, entry, kid, settings } from './fixtures';

const fourMonths = kid('Micky', '2026-06-20');
const noSchedule = { ...settings, sleepSchedule: false };

describe('widgetSummary', () => {
  it('shows clock times for the last feed, sleep and diaper', () => {
    const entries = [
      entry('feeding', at(9, 30), at(9, 50), { type: 'breast_milk', method: 'left' }),
      entry('sleep', at(19, 0, -1), at(7), { nap: false }),
      entry('sleep', at(9, 5), at(10), { nap: true }),
      entry('diaper', at(10, 15), at(10, 15), { wet: true, solid: false }),
    ];
    const s = widgetSummary(fourMonths, entries, settings, at(11));
    expect(s.childName).toBe('Micky');
    expect(s.feeding).toEqual({ title: 'Fed 09:30', detail: 'Left · next 13:30' });
    expect(s.sleep).toEqual({ title: 'Awake since 10:00', detail: 'nap 12:00' });
    expect(s.diaper).toEqual({ title: 'Diaper 10:15', detail: 'Wet' });
    expect(s.sleeping).toBe(false);
  });

  it('shows running timers', () => {
    const entries = [
      entry('feeding', at(12, 40), null, { type: 'breast_milk', method: 'right' }),
      entry('sleep', at(12, 5), null, { nap: true }),
    ];
    const s = widgetSummary(fourMonths, entries, settings, at(12, 45));
    expect(s.feeding).toEqual({ title: 'Feeding since 12:40', detail: 'Right' });
    expect(s.sleep).toEqual({ title: 'Asleep since 12:05', detail: 'until 14:00' });
    expect(s.sleeping).toBe(true);
  });

  it('shows the night as untracked, and the morning from the day start, for day sleep only', () => {
    const dayOnly = { ...settings, nightSleep: false };
    const entries = [entry('sleep', at(16, 15, -1), at(17, 0, -1), { nap: true })];
    expect(widgetSummary(fourMonths, entries, dayOnly, at(5)).sleep).toEqual({
      title: 'Night',
      detail: 'day starts 07:00',
    });
    expect(widgetSummary(fourMonths, entries, dayOnly, at(8)).sleep).toEqual({
      title: 'Awake since 07:00',
      detail: 'nap 09:00',
    });
  });

  it('uses the awake window without the schedule, and handles an empty log', () => {
    const entries = [entry('sleep', at(9), at(10), { nap: true })];
    expect(widgetSummary(fourMonths, entries, noSchedule, at(10, 30)).sleep).toEqual({
      title: 'Awake since 10:00',
      detail: 'nap 11:30',
    });
    const empty = widgetSummary(kid('M'), [], settings, at(10));
    expect([empty.feeding.title, empty.sleep.title, empty.diaper.title]).toEqual([
      'No feed yet',
      'No sleep yet',
      'No diaper yet',
    ]);
  });
});

describe('isRepeatTap', () => {
  const wet = { wet: true, solid: false };

  it('catches the same diaper button tapped twice', () => {
    const entries = [entry('diaper', at(10), at(10), wet)];
    expect(isRepeatTap(entries, at(10) + 2_000, wet)).toBe(true);
    expect(isRepeatTap(entries, at(10) + 6_000, wet)).toBe(false);
    // Wet, then Solid: two different changes.
    expect(isRepeatTap(entries, at(10) + 2_000, { wet: false, solid: true })).toBe(false);
  });

  it('catches a second sleep tap right after starting or stopping', () => {
    expect(isRepeatTap([entry('sleep', at(10), null, { nap: true })], at(10) + 1_000)).toBe(true);
    expect(isRepeatTap([entry('sleep', at(9), at(10), { nap: true })], at(10) + 1_000)).toBe(true);
    expect(isRepeatTap([entry('sleep', at(9), null, { nap: true })], at(10))).toBe(false);
    // A diaper just logged does not block the sleep button.
    expect(isRepeatTap([entry('diaper', at(10), at(10), wet)], at(10) + 1_000)).toBe(false);
  });

  it('ignores deleted entries', () => {
    const undone = entry('diaper', at(10), at(10), wet, { deletedAt: at(10) + 500 });
    expect(isRepeatTap([undone], at(10) + 1_000, wet)).toBe(false);
  });
});
