/// <reference types="jest" />
import { DEFAULT_SETTINGS } from '@/domain/types';

import { reminderFilterFor } from '../reminders';

describe('reminderFilterFor', () => {
  it('tells the relay the kinds and duty days this phone wants', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      feedRemindersDay: false,
      feedAlarmNight: false,
      dutyDays: [1, 3] as (0 | 1 | 2 | 3 | 4 | 5 | 6)[],
      dayStartMinute: 420,
    };
    expect(reminderFilterFor(settings, 'Europe/Amsterdam')).toEqual({
      ids: ['nap', 'wake', 'bed'],
      dutyDays: [1, 3],
      dayStartMinute: 420,
      timeZone: 'Europe/Amsterdam',
    });
    const feeds = { ...DEFAULT_SETTINGS, napReminders: false, feedRemindersDay: true };
    expect(reminderFilterFor(feeds, null).ids).toEqual(['feed', 'feedday']);
    const nightOnly = { ...feeds, feedRemindersDay: false };
    expect(reminderFilterFor(nightOnly, null).ids).toEqual(['feed']);
  });
});
