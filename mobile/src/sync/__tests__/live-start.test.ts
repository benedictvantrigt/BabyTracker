/// <reference types="jest" />
import { at, entry } from '@/domain/__tests__/fixtures';
import type { Entry } from '@/domain/types';

import { liveStartIn } from '../live-start';

const change = (row: Entry) => JSON.stringify({ type: 'entry', row });

describe('liveStartIn', () => {
  it('finds a sleep or feeding timer started a moment ago', () => {
    const sleep = entry('sleep', at(12), null, { nap: true });
    expect(liveStartIn([change(sleep)], at(12, 1))).toEqual({ kind: 'sleep', start: at(12) });
    const feed = entry('feeding', at(12), null, { type: 'breast_milk', method: 'left' });
    expect(liveStartIn([change(feed)], at(12))).toEqual({ kind: 'feeding', start: at(12) });
  });

  it('skips stopped, deleted, older and other timers', () => {
    const stopped = entry('sleep', at(12), at(12, 1), { nap: true });
    const deleted = entry('sleep', at(12), null, { nap: true }, { deletedAt: at(12, 1) });
    const older = entry('sleep', at(11), null, { nap: true });
    const tummy = entry('tummy', at(12), null, {});
    const bodies = [stopped, deleted, older, tummy].map(change);
    expect(liveStartIn([...bodies, 'not json'], at(12, 1))).toBeUndefined();
  });
});
