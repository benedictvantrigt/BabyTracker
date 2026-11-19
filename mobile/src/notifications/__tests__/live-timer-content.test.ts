/// <reference types="jest" />
import { formatClock } from '@/domain/time';
import { at, entry, kid, settings } from '@/domain/__tests__/fixtures';

import { awakeTimerFor, liveTimerFor } from '../live-timer-content';

describe('liveTimerFor', () => {
  it('names a running sleep after the child', () => {
    const nap = entry('sleep', at(13, 5), null, { nap: true });
    expect(liveTimerFor(nap, 'Micky')).toEqual({
      id: nap.id,
      kind: 'sleep',
      title: 'Micky is asleep',
      text: `Sleep timer running since ${formatClock(at(13, 5))}`,
      start: at(13, 5),
    });
  });

  it('names a running feed after its side', () => {
    const feed = entry('feeding', at(9), null, { type: 'breast_milk', method: 'left' });
    expect(liveTimerFor(feed, 'Micky')).toMatchObject({
      kind: 'feeding',
      title: 'Feeding · Left',
      start: at(9),
    });
  });
});

describe('awakeTimerFor', () => {
  // Day window 07:00–19:30 by default.
  const plain = { ...settings, sleepSchedule: false, awakeWindowMinutes: 105 };
  const noKid = kid('Micky');
  const fourMonths = kid('Micky', '2026-06-20');

  it('counts down from waking to the end of the awake window', () => {
    const nap = entry('sleep', at(9), at(10, 12), { nap: true });
    expect(awakeTimerFor([nap], noKid, plain, at(10, 30))).toEqual({
      id: `awake-${at(10, 12)}-${at(11, 57)}`,
      kind: 'awake',
      title: `Micky awake since ${formatClock(at(10, 12))}`,
      text: `Nap at ${formatClock(at(11, 57))}`,
      start: at(10, 12),
      countdownTo: at(11, 57),
      until: at(19, 30),
    });
  });

  it('keeps counting once the nap is overdue', () => {
    const nap = entry('sleep', at(9), at(10, 12), { nap: true });
    expect(awakeTimerFor([nap], noKid, plain, at(12, 30))?.countdownTo).toBe(at(11, 57));
  });

  it('follows the schedule when it is on: the next planned nap, then bedtime', () => {
    const night = entry('sleep', at(19, 0, -1), at(7), { nap: false });
    const nap1 = entry('sleep', at(9, 5), at(10), { nap: true });
    expect(awakeTimerFor([night, nap1], fourMonths, settings, at(11))).toMatchObject({
      text: `Nap 2 of 3 at ${formatClock(at(12))}`,
      countdownTo: at(12),
    });
    const nap3 = entry('sleep', at(16, 15), at(17), { nap: true });
    expect(awakeTimerFor([night, nap1, nap3], fourMonths, settings, at(17, 30))).toMatchObject({
      text: `Bed at ${formatClock(at(19))}`,
      countdownTo: at(19),
    });
  });

  it('uses the awake window when the schedule has no age to go on', () => {
    const nap = entry('sleep', at(9), at(10), { nap: true });
    expect(awakeTimerFor([nap], noKid, settings, at(10, 30))?.countdownTo).toBe(at(11, 30));
  });

  it('counts a wake-up shortly before the day starts as the morning', () => {
    const night = entry('sleep', at(19, 0, -1), at(6, 30), { nap: false });
    expect(awakeTimerFor([night], noKid, plain, at(7, 15))?.start).toBe(at(6, 30));
  });

  it('is off while asleep, at night, after a night waking, or when switched off', () => {
    const nap = entry('sleep', at(9), at(10), { nap: true });
    expect(awakeTimerFor([nap], noKid, { ...plain, awakeTimer: false }, at(10, 30))).toBeNull();
    expect(
      awakeTimerFor([nap, entry('sleep', at(11), null, { nap: true })], noKid, plain, at(11, 30)),
    ).toBeNull();
    const evening = entry('sleep', at(17), at(18), { nap: true });
    expect(awakeTimerFor([evening], noKid, plain, at(20))).toBeNull();
    const waking = entry('sleep', at(19, 0, -1), at(3), { nap: false });
    expect(awakeTimerFor([waking], noKid, plain, at(7, 30))).toBeNull();
    expect(awakeTimerFor([], noKid, plain, at(10))).toBeNull();
  });

  it('counts the morning from the day start when tracking day sleep only', () => {
    const dayOnly = { ...plain, nightSleep: false };
    const evening = entry('sleep', at(17, 0, -1), at(18, 0, -1), { nap: true });
    expect(awakeTimerFor([evening], noKid, dayOnly, at(7, 30))).toMatchObject({
      start: at(7),
      countdownTo: at(8, 45),
    });
    expect(awakeTimerFor([], noKid, dayOnly, at(7, 30))?.start).toBe(at(7));
    expect(awakeTimerFor([evening], noKid, dayOnly, at(5))).toBeNull();
  });
});
