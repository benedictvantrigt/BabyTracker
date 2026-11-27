import type { Reminder } from './reminders';
import { MINUTE, formatClock } from './time';
import type { Entry, Settings } from './types';

/**
 * The reflux timer (#93): after a feed the baby stays upright for a while. It runs from the
 * end of the latest milk feed for `refluxMinutes`, on every phone of the family, since it
 * follows from the synced log. Not after solids, and not while a feed is still running (a
 * switch of sides): it starts when that one ends.
 */
export interface RefluxWindow {
  feedId: string;
  /** When the feed ended. */
  start: number;
  /** When the baby may lie down again. */
  until: number;
}

export function refluxWindow(
  entries: Entry[],
  settings: Pick<Settings, 'refluxTimer' | 'refluxMinutes'>,
  now: number,
): RefluxWindow | null {
  if (!settings.refluxTimer) return null;
  const feeds = entries.filter(
    (e) => e.kind === 'feeding' && e.deletedAt === null && e.data.type !== 'solid',
  );
  if (feeds.some((e) => e.end === null)) return null;
  let last: Entry | null = null;
  for (const e of feeds) if (!last || e.end! > last.end!) last = e;
  if (!last || last.end! > now) return null;
  const until = last.end! + settings.refluxMinutes * MINUTE;
  if (until <= now) return null;
  return { feedId: last.id, start: last.end!, until };
}

/** The notification when the upright time is over. */
export function refluxReminder(window: RefluxWindow, childName: string): Reminder {
  return {
    id: 'reflux',
    fireAt: window.until,
    title: 'Upright time is over',
    body: `${childName} can lie down again (fed until ${formatClock(window.start)}).`,
    alarm: false,
  };
}
