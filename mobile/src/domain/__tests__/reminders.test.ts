/// <reference types="jest" />
import { computeReminders, nextFeedAt, nextNapAt } from '../reminders';
import { MINUTE } from '../time';

import { at, entry, kid, settings } from './fixtures';

const micky = kid('Micky');
const m = kid('M');

describe('computeReminders', () => {
  it('schedules a nap reminder one awake window after the last sleep ended', () => {
    const entries = [entry('sleep', at(10), at(11), { nap: true })];
    const [nap] = computeReminders(entries, settings, micky, at(11, 30));
    expect(nap).toMatchObject({ id: 'nap', fireAt: at(12, 30), alarm: false });
    expect(nap.body).toContain('Micky');
    expect(nap.body).toContain('11:00');
  });

  it('skips the nap reminder while asleep, when disabled, already past, or at night', () => {
    const awake = [entry('sleep', at(10), at(11), { nap: true })];
    const asleep = [...awake, entry('sleep', at(11, 20), null, { nap: true })];
    expect(computeReminders(asleep, settings, m, at(11, 30))).toEqual([]);
    expect(computeReminders(awake, { ...settings, napReminders: false }, m, at(11, 30))).toEqual(
      [],
    );
    expect(computeReminders(awake, settings, m, at(13))).toEqual([]);

    const evening = [entry('sleep', at(17), at(18, 30), { nap: true })];
    // 18:30 + 90m = 20:00, after the 19:30 day end.
    expect(computeReminders(evening, settings, m, at(18, 45))).toEqual([]);
  });

  it('uses the most recently ended sleep, ignoring deleted ones', () => {
    const entries = [
      entry('sleep', at(9), at(10), { nap: true }),
      entry('sleep', at(11), at(12), { nap: true }, { deletedAt: at(12) }),
    ];
    const [nap] = computeReminders(entries, settings, m, at(10, 30));
    expect(nap.fireAt).toBe(at(11, 30));
  });

  it('turns a night-time feed reminder into an alarm and respects the day toggle', () => {
    const night = [entry('feeding', at(22), at(22, 20), { type: 'breast_milk', method: 'left' })];
    const [alarm] = computeReminders(night, settings, m, at(22, 30));
    expect(alarm).toMatchObject({ id: 'feed', fireAt: at(2, 0, 1), alarm: true });

    const day = [entry('feeding', at(8), at(8, 20), { type: 'breast_milk', method: 'left' })];
    expect(computeReminders(day, settings, m, at(9))).toEqual([]);
    const [daily] = computeReminders(day, { ...settings, feedRemindersDay: true }, m, at(9));
    expect(daily).toMatchObject({ id: 'feed', fireAt: at(12), alarm: false });
  });

  it('counts the feed interval from the start of the latest feed', () => {
    const entries = [
      entry('feeding', at(20), at(20, 15), { type: 'breast_milk', method: 'left' }),
      entry('feeding', at(23), null, { type: 'breast_milk', method: 'right' }),
    ];
    const [feed] = computeReminders(entries, settings, m, at(23, 5));
    expect(feed.fireAt).toBe(at(23) + settings.feedIntervalMinutes * MINUTE);
  });
});

describe('next times for the dashboard', () => {
  it('reports the next nap and feed regardless of reminder toggles', () => {
    const entries = [
      entry('sleep', at(10), at(11), { nap: true }),
      entry('feeding', at(11, 5), at(11, 20), { type: 'formula', method: 'bottle', amount: 120 }),
    ];
    const off = { ...settings, napReminders: false, feedAlarmNight: false };
    expect(nextNapAt(entries, off)).toBe(at(12, 30));
    expect(nextFeedAt(entries, off)).toBe(at(15, 5));
  });

  it('has no next nap while a sleep timer runs', () => {
    expect(nextNapAt([entry('sleep', at(10), null, { nap: true })], settings)).toBeNull();
  });
});
