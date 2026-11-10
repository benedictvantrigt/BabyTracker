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
      tummyMs: 0,
      pumpedMl: 0,
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
    expect(formatDuration(0)).toBe('0m');
    expect(formatDuration(30_000)).toBe('<1m');
    expect(formatDuration(42 * MINUTE)).toBe('42m');
    expect(formatDuration(HOUR + 5 * MINUTE)).toBe('1h 05m');
    expect(formatStopwatch(HOUR + 5 * MINUTE + 9_000)).toBe('1:05:09');
    expect(formatStopwatch(65_000)).toBe('1:05');
  });

  it('formats age in days, weeks then months, with the remaining days', () => {
    expect(formatAge('2026-10-26', at(12))).toBe('0 days');
    expect(formatAge('2026-10-25', at(12))).toBe('1 day');
    expect(formatAge('2026-10-20', at(12))).toBe('6 days');
    expect(formatAge('2026-10-12', at(12))).toBe('2 weeks');
    expect(formatAge('2026-09-01', at(12))).toBe('7 weeks 6 days');
    expect(formatAge('2026-08-29', at(12))).toBe('8 weeks 2 days');
    expect(formatAge('2026-07-28', at(12))).toBe('12 weeks 6 days');
    expect(formatAge('2026-07-27', at(12))).toBe('2 months 29 days');
    expect(formatAge('2026-10-27', at(12))).toBe('');
    // Spans the spring DST change (29 Mar 2026): still 8 whole days.
    expect(formatAge('2026-03-25', new Date(2026, 3, 2, 12).getTime())).toBe('8 days');
    expect(formatAge('2026-04-26', at(12))).toBe('6 months');
    expect(formatAge('2026-04-27', at(12))).toBe('5 months 29 days');
    expect(formatAge('2026-06-14', at(12))).toBe('4 months 12 days');
    expect(formatAge('2025-09-25', at(12))).toBe('13 months 1 day');
    // Across the autumn DST change (25 Oct 2026).
    expect(formatAge('2026-07-20', at(12))).toBe('3 months 6 days');
  });

  it('counts months from the last day of a shorter month', () => {
    // Four months after 30 October is 28 February (2026 is no leap year).
    const born = '2025-10-30';
    expect(formatAge(born, new Date(2026, 1, 27, 12).getTime())).toBe('3 months 28 days');
    expect(formatAge(born, new Date(2026, 1, 28, 12).getTime())).toBe('4 months');
    expect(formatAge('2025-10-31', new Date(2026, 1, 28, 12).getTime())).toBe('4 months');
    expect(formatAge('2025-10-31', new Date(2026, 2, 3, 12).getTime())).toBe('4 months 3 days');
  });
});

describe('tummy time, pumping, temperature and growth', () => {
  const now = at(12);

  it('have titles', () => {
    expect(entryTitle(entry('tummy', at(9), at(9, 10), {}))).toBe('Tummy time');
    expect(entryTitle(entry('pumping', at(9), at(9, 15), { side: 'left', amount: 80 }))).toBe(
      'Pumping · Left · 80 ml',
    );
    expect(entryTitle(entry('pumping', at(9), at(9, 15), { side: 'both' }))).toBe('Pumping · Both');
    expect(entryTitle(entry('temperature', at(9), at(9), { celsius: 38 }))).toBe(
      'Temperature · 38.0 °C',
    );
    expect(
      entryTitle(entry('growth', at(9), at(9), { weightGrams: 4250, lengthCm: 55, headCm: 37.5 })),
    ).toBe('Growth · 4.25 kg · 55 cm · head 37.5 cm');
    expect(entryTitle(entry('growth', at(9), at(9), { headCm: 38 }))).toBe('Growth · head 38 cm');
  });

  it('validate measurements', () => {
    const temperature = (celsius: number) =>
      validateEntry({ kind: 'temperature', start: at(9), end: at(9), data: { celsius } }, now);
    expect(temperature(37.2)).toBeNull();
    expect(temperature(372)).toMatch(/between 34 and 43/);
    expect(temperature(NaN)).toMatch(/between 34 and 43/);

    const growth = (data: { weightGrams?: number; lengthCm?: number; headCm?: number }) =>
      validateEntry({ kind: 'growth', start: at(9), end: at(9), data }, now);
    expect(growth({ weightGrams: 4250 })).toBeNull();
    expect(growth({})).toMatch(/weight, length or head/);
    expect(growth({ weightGrams: 4250000 })).toMatch(/Weight/);
    expect(growth({ lengthCm: 5.5 })).toMatch(/Length/);
    expect(growth({ headCm: 370 })).toMatch(/Head/);
    expect(
      validateEntry({ kind: 'growth', start: at(9), end: at(10), data: { headCm: 37 } }, now),
    ).toMatch(/no duration/);

    expect(
      validateEntry(
        { kind: 'pumping', start: at(9), end: at(9, 15), data: { side: 'left', amount: 0 } },
        now,
      ),
    ).toMatch(/Amount/);
  });

  it('count tummy time and pumped milk for the day', () => {
    const entries = [
      entry('tummy', at(9), at(9, 10), {}),
      entry('tummy', at(11, 50), null, {}),
      entry('tummy', at(9, 0, -1), at(9, 30, -1), {}),
      entry('pumping', at(8), at(8, 15), { side: 'both', amount: 120 }),
      entry('pumping', at(10), at(10, 15), { side: 'left' }),
    ];
    const day = summarizeDay(entries, now);
    expect(day.tummyMs).toBe(20 * MINUTE);
    expect(day.pumpedMl).toBe(120);
  });
});
