/// <reference types="jest" />
import { refluxReminder, refluxWindow } from '../reflux';
import { reminderWantedHere } from '../reminders';

import { at, entry, settings } from './fixtures';

const on = { ...settings, refluxTimer: true, refluxMinutes: 30 };
const milk = { type: 'breast_milk', method: 'left' } as const;

describe('refluxWindow', () => {
  it('runs from the end of the latest milk feed', () => {
    const entries = [
      entry('feeding', at(9), at(9, 20), milk),
      entry('feeding', at(12), at(12, 15), milk),
    ];
    expect(refluxWindow(entries, on, at(12, 20))).toMatchObject({
      start: at(12, 15),
      until: at(12, 45),
    });
  });

  it('is off when switched off, over, or before any feed', () => {
    const entries = [entry('feeding', at(12), at(12, 15), milk)];
    expect(refluxWindow(entries, settings, at(12, 20))).toBeNull();
    expect(refluxWindow(entries, on, at(12, 45))).toBeNull();
    expect(refluxWindow([], on, at(12, 20))).toBeNull();
  });

  it('waits while a feed runs, as when switching sides', () => {
    const entries = [
      entry('feeding', at(12), at(12, 10), milk),
      entry('feeding', at(12, 10), null, { type: 'breast_milk', method: 'right' }),
    ];
    expect(refluxWindow(entries, on, at(12, 15))).toBeNull();
  });

  it('starts at a feed logged without a length, and not after solids', () => {
    const bottle = entry('feeding', at(12), at(12), { type: 'formula', method: 'bottle' });
    expect(refluxWindow([bottle], on, at(12, 5))?.until).toBe(at(12, 30));
    const solid = entry('feeding', at(13), at(13, 10), { type: 'solid', method: 'self' });
    expect(refluxWindow([bottle, solid], on, at(13, 15))).toBeNull();
  });

  it('ignores a deleted feed', () => {
    const deleted = entry('feeding', at(12), at(12, 15), milk, { deletedAt: at(12, 16) });
    expect(refluxWindow([deleted], on, at(12, 20))).toBeNull();
  });
});

describe('refluxReminder', () => {
  it('fires when the upright time is over, whatever the feed reminder switches', () => {
    const window = refluxWindow([entry('feeding', at(12), at(12, 15), milk)], on, at(12, 20))!;
    const reminder = refluxReminder(window, 'Micky');
    expect(reminder).toMatchObject({ id: 'reflux', fireAt: at(12, 45), alarm: false });
    expect(reminder.body).toContain('Micky');
    const off = { napReminders: false, feedRemindersDay: false, feedAlarmNight: false };
    expect(reminderWantedHere('reflux', off)).toBe(true);
  });
});
