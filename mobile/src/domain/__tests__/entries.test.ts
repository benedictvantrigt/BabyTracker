/// <reference types="jest" />
import { entryTitle, groupByDay, isNapStart, summarizeDay, validateEntry } from '../entries';
import { HOUR, MINUTE, formatAge, formatDuration, formatStopwatch } from '../time';

import { at, entry, settings } from './fixtures';

describe('summarizeDay', () => {
  it('totals today only and clips sleep to the day and to now', () => {
    const entries = [
      entry('feeding', at(23, 0, -1), at(23, 20, -1), { type: 'breast_milk', method: 'left' }),
      entry('feeding', at(6), at(6, 20), { type: 'breast_milk', method: 'right' }),
      entry('feeding', at(9), at(9, 10), { type: 'formula', method: 'bottle', amount: 90 }),
      entry('diaper', at(7), at(7), { wet: true, solid: true }),
      entry('diaper', at(8), at(8), { wet: true, solid: false }),
      entry('diaper', at(8, 30), at(8, 30), { wet: false, solid: true }, { deletedAt: at(9) }),
      // Night sleep from 23:30 yesterday to 05:30 counts 5h30m today.
      entry('sleep', at(23, 30, -1), at(5, 30), { nap: false }),
      // Running nap since 11:00, now is 11:45.
      entry('sleep', at(11), null, { nap: true }),
    ];
    expect(summarizeDay(entries, at(11, 45))).toEqual({
      feedings: 2,
      bottleMl: 90,
      diapers: 2,
      wet: 2,
      solid: 1,
      sleepMs: 5.5 * HOUR + 45 * MINUTE,
      naps: 1,
    });
  });
});

describe('validateEntry', () => {
  const now = at(12);
  it('accepts a valid feed and a running timer', () => {
    const data = { type: 'breast_milk', method: 'left' } as const;
    expect(
      validateEntry({ kind: 'feeding', start: at(11), end: at(11, 15), data }, now),
    ).toBeNull();
    expect(validateEntry({ kind: 'feeding', start: at(11), end: null, data }, now)).toBeNull();
  });

  it('rejects inverted, future and empty entries', () => {
    expect(
      validateEntry({ kind: 'sleep', start: at(11), end: at(10), data: { nap: true } }, now),
    ).toMatch(/before/);
    expect(
      validateEntry({ kind: 'sleep', start: at(13), end: null, data: { nap: true } }, now),
    ).toMatch(/future/);
    expect(
      validateEntry(
        { kind: 'diaper', start: at(11), end: at(11), data: { wet: false, solid: false } },
        now,
      ),
    ).toMatch(/wet, solid/);
    expect(
      validateEntry(
        {
          kind: 'feeding',
          start: at(11),
          end: at(11),
          data: { type: 'formula', method: 'bottle', amount: 0 },
        },
        now,
      ),
    ).toMatch(/Amount/);
  });
});

describe('labels and grouping', () => {
  it('describes entries', () => {
    expect(entryTitle(entry('feeding', 0, 0, { type: 'breast_milk', method: 'right' }))).toBe(
      'Feeding · Right',
    );
    expect(
      entryTitle(entry('feeding', 0, 0, { type: 'formula', method: 'bottle', amount: 120 })),
    ).toBe('Feeding · Bottle 120 ml · Formula');
    expect(entryTitle(entry('diaper', 0, 0, { wet: true, solid: true }))).toBe(
      'Diaper · Wet + solid',
    );
    expect(entryTitle(entry('sleep', 0, 0, { nap: false }))).toBe('Night sleep');
  });

  it('groups by local day, newest first', () => {
    const groups = groupByDay([
      entry('diaper', at(8, 0, -1), at(8, 0, -1), { wet: true, solid: false }),
      entry('diaper', at(9), at(9), { wet: true, solid: false }),
      entry('diaper', at(7), at(7), { wet: true, solid: false }),
    ]);
    expect(groups.map((g) => g.entries.map((e) => e.start))).toEqual([
      [at(9), at(7)],
      [at(8, 0, -1)],
    ]);
  });

  it('classifies naps by the daytime window', () => {
    expect(isNapStart(at(13), settings)).toBe(true);
    expect(isNapStart(at(20), settings)).toBe(false);
  });
});

describe('time formatting', () => {
  it('formats durations and stopwatches', () => {
    expect(formatDuration(30_000)).toBe('<1m');
    expect(formatDuration(42 * MINUTE)).toBe('42m');
    expect(formatDuration(HOUR + 5 * MINUTE)).toBe('1h 05m');
    expect(formatStopwatch(HOUR + 5 * MINUTE + 9_000)).toBe('1:05:09');
    expect(formatStopwatch(65_000)).toBe('1:05');
  });

  it('formats age in days, weeks then months', () => {
    expect(formatAge('2026-10-20', at(12))).toBe('6 days');
    expect(formatAge('2026-09-01', at(12))).toBe('7 weeks');
    // Spans the spring DST change (29 Mar 2026): still 8 whole days.
    expect(formatAge('2026-03-25', new Date(2026, 3, 2, 12).getTime())).toBe('8 days');
    expect(formatAge('2026-04-26', at(12))).toBe('6 months');
    expect(formatAge('2026-04-27', at(12))).toBe('5 months');
  });
});
