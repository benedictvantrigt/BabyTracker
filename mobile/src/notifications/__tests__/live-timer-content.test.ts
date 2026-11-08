/// <reference types="jest" />
import { formatClock } from '@/domain/time';
import { at, entry } from '@/domain/__tests__/fixtures';

import { liveTimerFor } from '../live-timer-content';

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
