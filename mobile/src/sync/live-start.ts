import type { SyncChange } from '@/db/repo';

import type { LiveStart } from './client';

/**
 * A sleep or feeding timer started on this phone a moment ago, in the batch about to be
 * pushed: the relay starts its Live Activity on the partner iPhones (#98). Not an older
 * running timer that was only edited, which would start a second one there.
 */
export function liveStartIn(bodies: string[], now: number): LiveStart | undefined {
  for (const body of bodies) {
    try {
      const change = JSON.parse(body) as SyncChange;
      if (change.type !== 'entry') continue;
      const { kind, start, end, createdAt, deletedAt } = change.row;
      if (kind !== 'sleep' && kind !== 'feeding') continue;
      if (end !== null || deletedAt !== null || now - createdAt > 2 * 60_000) continue;
      return { kind, start };
    } catch {
      // Not a change this phone can read: nothing to start.
    }
  }
  return undefined;
}
