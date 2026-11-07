/// <reference types="jest" />
import { widgetSummary } from '../widget';

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
