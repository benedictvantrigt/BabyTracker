import { KIND_LABEL, entryTitle } from '@/domain/entries';
import { formatClock } from '@/domain/time';
import type { Entry } from '@/domain/types';

/** What a running timer shows outside the app: notification, Live Activity or Live Update. */
export interface LiveTimer {
  id: string;
  kind: 'sleep' | 'feeding';
  title: string;
  text: string;
  /** When the timer started, in milliseconds since the epoch. */
  start: number;
}

export function liveTimerFor(entry: Entry, childName: string): LiveTimer {
  return {
    id: entry.id,
    kind: entry.kind === 'sleep' ? 'sleep' : 'feeding',
    title: entry.kind === 'sleep' ? `${childName} is asleep` : entryTitle(entry),
    text: `${KIND_LABEL[entry.kind]} timer running since ${formatClock(entry.start)}`,
    start: entry.start,
  };
}
