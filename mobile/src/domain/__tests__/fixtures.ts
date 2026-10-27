import {
  DEFAULT_SETTINGS,
  type Entry,
  type EntryDataMap,
  type EntryKind,
  type Settings,
} from '../types';

let seq = 0;

/** Local time on 26 Oct 2026. */
export function at(hour: number, minute = 0, dayOffset = 0): number {
  return new Date(2026, 9, 26 + dayOffset, hour, minute).getTime();
}

export function entry<K extends EntryKind>(
  kind: K,
  start: number,
  end: number | null,
  data: EntryDataMap[K],
  extra: Partial<Entry> = {},
): Entry {
  seq += 1;
  return {
    id: `e${seq}`,
    childId: 'c1',
    kind,
    start,
    end,
    data,
    notes: '',
    createdAt: start,
    updatedAt: start,
    deletedAt: null,
    ...extra,
  } as Entry;
}

/** A child for reminders and the schedule; no birth date means no schedule. */
export function kid(name: string, birthDate: string | null = null, dueDate: string | null = null) {
  return { name, birthDate, dueDate };
}

export const settings: Settings = { ...DEFAULT_SETTINGS, activeChildId: 'c1' };
