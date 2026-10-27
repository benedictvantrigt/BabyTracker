/// <reference types="jest" />
import { computeReminders } from '../reminders';
import { SCHEDULE_STAGES, isNewStage, planDay, scheduleStatus, stageFor } from '../sleep-schedule';
import { HOUR, MINUTE } from '../time';

import { at, entry, kid, settings } from './fixtures';

// at() is 26 Oct 2026; a baby born 20 Jun 2026 is 4 months old then.
const fourMonths = kid('Micky', '2026-06-20');
const tenMonths = kid('Micky', '2025-12-20');

const night = entry('sleep', at(19, 0, -1), at(7), { nap: false });
const nap = (h: number, m: number, endH: number | null, endM = 0) =>
  entry('sleep', at(h, m), endH === null ? null : at(endH, endM), { nap: true });

describe('stageFor', () => {
  it('picks the stage for the age', () => {
    expect(stageFor(kid('M', '2026-10-01'), settings, at(12))?.stage.id).toBe('w3');
    expect(stageFor(fourMonths, settings, at(12))?.stage.id).toBe('m4');
    expect(stageFor(tenMonths, settings, at(12))?.stage.id).toBe('m8');
    expect(stageFor(kid('M', '2020-01-01'), settings, at(12))?.stage.id).toBe('y3');
  });

  it('moves to the 4-month stage at 16 weeks', () => {
    expect(stageFor(kid('M', '2026-07-06'), settings, at(12))?.stage.id).toBe('m4');
    expect(stageFor(kid('M', '2026-07-07'), settings, at(12))?.stage.id).toBe('w12');
  });

  it('counts from the due date for a baby born early', () => {
    const early = kid('M', '2026-09-01', '2026-10-01');
    expect(stageFor(early, settings, at(12))?.stage.id).toBe('w3');
    // Before the due date: the newborn stage.
    expect(stageFor(kid('M', '2026-10-20', '2026-11-20'), settings, at(12))?.stage.id).toBe('w0');
  });

  it('uses a stage picked by hand, and has none without age or pick', () => {
    const picked = stageFor(fourMonths, { scheduleStage: 'm7' }, at(12));
    expect(picked).toMatchObject({ manual: true, since: null });
    expect(picked?.stage.id).toBe('m7');
    expect(stageFor(kid('M'), settings, at(12))).toBeNull();
    expect(stageFor(kid('M'), { scheduleStage: 'm6' }, at(12))?.stage.id).toBe('m6');
  });

  it('has stages in age order with naps inside the day', () => {
    for (const s of SCHEDULE_STAGES) {
      for (const n of s.naps) {
        expect(n.end).toBeGreaterThan(n.start);
        expect(n.end).toBeLessThanOrEqual(17 * 60);
      }
      expect(s.bedtime).toBeGreaterThanOrEqual(18 * 60);
    }
  });
});

describe('planDay', () => {
  it('places the stage on the day and shifts it with the day start', () => {
    const stage = SCHEDULE_STAGES.find((s) => s.id === 'm4')!;
    const plan = planDay(stage, settings, at(12));
    expect(plan.naps.map((n) => [n.startAt, n.endAt])).toEqual([
      [at(9), at(10)],
      [at(12), at(14)],
      [at(16, 15), at(17)],
    ]);
    expect(plan.bedtimeAt).toBe(at(19));
    const later = planDay(stage, { dayStartMinute: 7 * 60 + 30 }, at(12));
    expect(later.naps[0].startAt).toBe(at(9, 30));
    expect(later.bedtimeAt).toBe(at(19, 30));
  });
});

describe('scheduleStatus', () => {
  it('tracks slept naps, the next nap and day sleep', () => {
    const entries = [night, nap(9, 5, 10)];
    const status = scheduleStatus(entries, fourMonths, settings, at(11))!;
    expect(status.slots.map((s) => s.status)).toEqual(['done', 'upcoming', 'upcoming']);
    expect(status.next).toMatchObject({ index: 2, startAt: at(12), endAt: at(14) });
    expect(status.current).toBeNull();
    expect(status.daySleptMs).toBe(55 * MINUTE);
    expect(status.advice).toBeNull();
  });

  it('gives the planned end of a running nap', () => {
    const status = scheduleStatus([night, nap(12, 5, null)], fourMonths, settings, at(12, 30))!;
    expect(status.current).toMatchObject({ endAt: at(14), startedAt: at(12, 5) });
    expect(status.current?.slot?.index).toBe(2);
    expect(status.slots[1].status).toBe('sleeping');
    expect(status.next).toBeNull();
  });

  it('caps an unplanned nap at 2.5 hours and at 17:00', () => {
    const status = scheduleStatus([night, nap(10, 30, null)], fourMonths, settings, at(10, 40))!;
    expect(status.current).toMatchObject({ slot: null, endAt: at(13) });
    const late = scheduleStatus([night, nap(16, 50, null)], fourMonths, settings, at(17, 20))!;
    expect(late.advice).toEqual({ kind: 'wake-overdue', since: at(17) });
  });

  it('treats sleep from 17:00 as the night, also when logged as a nap', () => {
    const evening = scheduleStatus([night, nap(18, 40, null)], fourMonths, settings, at(19))!;
    expect(evening.current).toBeNull();
    expect(evening.advice).toBeNull();
    expect(evening.morningAt).toBe(at(7, 0, 1));
    expect(computeReminders([night, nap(18, 40, null)], settings, fourMonths, at(19))).toEqual([]);
    const early = scheduleStatus([], fourMonths, settings, at(5))!;
    expect(early.morningAt).toBe(at(7));
  });

  it('advises resettling after waking early from a planned nap', () => {
    const status = scheduleStatus([night, nap(12, 0, 12, 40)], fourMonths, settings, at(12, 45))!;
    expect(status.advice).toEqual({ kind: 'resettle', until: at(14) });
  });

  it('advises a catch-up nap after a missed or short midday nap', () => {
    const short = scheduleStatus([night, nap(12, 30, 13)], tenMonths, settings, at(15))!;
    expect(short.slots[1].status).toBe('short');
    expect(short.advice).toEqual({ kind: 'catch-up', from: at(16), to: at(17) });

    const missed = scheduleStatus([night, nap(9, 15, 10)], tenMonths, settings, at(14, 45))!;
    expect(missed.slots[1].status).toBe('missed');
    expect(missed.advice).toEqual({ kind: 'catch-up', from: at(16), to: at(17) });

    expect(scheduleStatus([night], tenMonths, settings, at(17, 30))!.advice).toBeNull();
  });

  it('gives no catch-up advice while a planned nap is left, or nothing is logged today', () => {
    // Three naps: the late-afternoon nap is the catch-up.
    const threeNaps = scheduleStatus([night, nap(9, 0, 10)], fourMonths, settings, at(14, 30))!;
    expect(threeNaps.slots[1].status).toBe('missed');
    expect(threeNaps.advice).toBeNull();
    expect(scheduleStatus([], tenMonths, settings, at(15))!.advice).toBeNull();
  });

  it('flags a nap running past its planned end', () => {
    const status = scheduleStatus([night, nap(12, 0, null)], fourMonths, settings, at(14, 10))!;
    expect(status.advice).toEqual({ kind: 'wake-overdue', since: at(14) });
  });
});

describe('schedule reminders', () => {
  it('reminds before the next nap and bedtime while awake', () => {
    const reminders = computeReminders([night, nap(9, 0, 10)], settings, fourMonths, at(11));
    expect(reminders).toEqual([
      expect.objectContaining({ id: 'nap', fireAt: at(11, 45), alarm: false }),
      expect.objectContaining({ id: 'bed', fireAt: at(18, 45) }),
    ]);
    expect(reminders[0].body).toBe('Nap 2 of 3: in bed 12:00–14:00.');
  });

  it('reminds at the planned end of a running nap only', () => {
    const reminders = computeReminders([night, nap(12, 0, null)], settings, fourMonths, at(12, 30));
    expect(reminders).toEqual([expect.objectContaining({ id: 'wake', fireAt: at(14) })]);
  });

  it('after bedtime, reminds about the next morning', () => {
    const reminders = computeReminders([night], settings, fourMonths, at(20));
    expect(reminders).toEqual([expect.objectContaining({ id: 'nap', fireAt: at(8, 45, 1) })]);
  });

  it('honours the lead time and the nap reminder switch', () => {
    const lead = computeReminders([night], { ...settings, napLeadMinutes: 30 }, fourMonths, at(8));
    expect(lead[0].fireAt).toBe(at(8, 30));
    expect(
      computeReminders([night], { ...settings, napReminders: false }, fourMonths, at(8)),
    ).toEqual([]);
  });

  it('falls back to the awake window with the schedule off or no age', () => {
    const entries = [nap(10, 0, 11)];
    const off = computeReminders(
      entries,
      { ...settings, sleepSchedule: false },
      fourMonths,
      at(11),
    );
    expect(off).toEqual([expect.objectContaining({ id: 'nap', fireAt: at(12, 30) })]);
    const noAge = computeReminders(entries, settings, kid('M'), at(11));
    expect(noAge).toEqual([expect.objectContaining({ id: 'nap', fireAt: at(12, 30) })]);
  });
});

describe('isNewStage', () => {
  it('flags an age-based stage for its first days only', () => {
    const born = kid('M', '2026-07-06'); // 16 weeks on 26 Oct
    const stage = stageFor(born, settings, at(12))!;
    expect(stage.stage.id).toBe('m4');
    expect(isNewStage(stage, at(12))).toBe(true);
    expect(isNewStage(stage, at(12) + 3 * 24 * HOUR)).toBe(false);
    expect(isNewStage(stageFor(born, { scheduleStage: 'm4' }, at(12))!, at(12))).toBe(false);
  });
});
