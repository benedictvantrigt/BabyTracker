import { formatDuration, isDaytime, startOfLocalDay } from './time';
import type {
  DiaperData,
  Entry,
  EntryInput,
  EntryKind,
  EntryOf,
  FeedingData,
  FeedingMethod,
  FeedingType,
  Settings,
} from './types';

export const KIND_LABEL: Record<EntryKind, string> = {
  feeding: 'Feeding',
  sleep: 'Sleep',
  diaper: 'Diaper',
};

export const FEEDING_TYPE_LABEL: Record<FeedingType, string> = {
  breast_milk: 'Breast milk',
  formula: 'Formula',
  fortified: 'Fortified milk',
  solid: 'Solid food',
};

export const FEEDING_METHOD_LABEL: Record<FeedingMethod, string> = {
  left: 'Left',
  right: 'Right',
  both: 'Both',
  bottle: 'Bottle',
  self: 'Self-fed',
};

/** Kinds with a duration; diapers are instant. */
export function isTimedKind(kind: EntryKind): boolean {
  return kind !== 'diaper';
}

export function isRunning(entry: Entry): boolean {
  return entry.end === null;
}

export function diaperLabel(data: DiaperData): string {
  if (data.wet && data.solid) return 'Wet + solid';
  if (data.solid) return 'Solid';
  if (data.wet) return 'Wet';
  return 'Dry';
}

export function feedingLabel(data: FeedingData): string {
  if (data.method === 'bottle') {
    const amount = data.amount ? ` ${data.amount} ml` : '';
    return `Bottle${amount} · ${FEEDING_TYPE_LABEL[data.type]}`;
  }
  if (data.type === 'solid') return FEEDING_TYPE_LABEL.solid;
  return FEEDING_METHOD_LABEL[data.method];
}

/** One-line description, e.g. "Feeding · Left" or "Nap". */
export function entryTitle(entry: Entry): string {
  switch (entry.kind) {
    case 'feeding':
      return `Feeding · ${feedingLabel(entry.data)}`;
    case 'sleep':
      return entry.data.nap ? 'Nap' : 'Night sleep';
    case 'diaper':
      return `Diaper · ${diaperLabel(entry.data)}`;
  }
}

export function entryDurationLabel(entry: Entry, now: number): string | null {
  if (!isTimedKind(entry.kind)) return null;
  return formatDuration((entry.end ?? now) - entry.start);
}

/** A sleep counts as a nap when it starts during the daytime window. */
export function isNapStart(start: number, settings: Settings): boolean {
  return isDaytime(start, settings.dayStartMinute, settings.dayEndMinute);
}

/** Returns an error message for invalid input, or null. */
export function validateEntry(input: EntryInput, now: number): string | null {
  if (!Number.isFinite(input.start)) return 'Start time is missing.';
  if (input.start > now + 60_000) return 'Start time is in the future.';
  if (input.end !== null) {
    if (input.end < input.start) return 'End time is before the start time.';
    if (input.end > now + 60_000) return 'End time is in the future.';
  }
  if (input.kind === 'diaper') {
    if (input.end !== input.start) return 'A diaper change has no duration.';
    if (!input.data.wet && !input.data.solid) return 'Pick wet, solid or both.';
  }
  if (input.kind === 'feeding' && input.data.amount !== undefined) {
    if (!(input.data.amount > 0) || input.data.amount > 1000)
      return 'Amount must be between 1 and 1000 ml.';
  }
  return null;
}

/** Most recent entry of a kind (by start), ignoring deleted rows. Entries may be in any order. */
export function latest<K extends EntryKind>(entries: Entry[], kind: K): EntryOf<K> | null {
  let best: EntryOf<K> | null = null;
  for (const e of entries) {
    if (e.kind !== kind || e.deletedAt !== null) continue;
    if (!best || e.start > best.start) best = e as EntryOf<K>;
  }
  return best;
}

/** Most recent finished sleep (by end time). */
export function lastCompletedSleep(entries: Entry[]): EntryOf<'sleep'> | null {
  let best: EntryOf<'sleep'> | null = null;
  for (const e of entries) {
    if (e.kind !== 'sleep' || e.deletedAt !== null || e.end === null) continue;
    if (!best || e.end > (best.end as number)) best = e;
  }
  return best;
}

export function runningEntries(entries: Entry[]): Entry[] {
  return entries
    .filter((e) => e.deletedAt === null && e.end === null)
    .sort((a, b) => a.start - b.start);
}

export interface DaySummary {
  feedings: number;
  /** Total bottle volume in ml. */
  bottleMl: number;
  diapers: number;
  wet: number;
  solid: number;
  /** Sleep ms overlapping the day, counting running sleep up to `now`. */
  sleepMs: number;
  naps: number;
}

/** Totals for the local day containing `now`. */
export function summarizeDay(entries: Entry[], now: number): DaySummary {
  const dayStart = startOfLocalDay(now);
  const dayEnd = dayStart + 24 * 60 * 60_000;
  const s: DaySummary = {
    feedings: 0,
    bottleMl: 0,
    diapers: 0,
    wet: 0,
    solid: 0,
    sleepMs: 0,
    naps: 0,
  };
  for (const e of entries) {
    if (e.deletedAt !== null) continue;
    const inDay = e.start >= dayStart && e.start < dayEnd;
    switch (e.kind) {
      case 'feeding':
        if (inDay) {
          s.feedings += 1;
          s.bottleMl += e.data.amount ?? 0;
        }
        break;
      case 'diaper':
        if (inDay) {
          s.diapers += 1;
          if (e.data.wet) s.wet += 1;
          if (e.data.solid) s.solid += 1;
        }
        break;
      case 'sleep': {
        const from = Math.max(e.start, dayStart);
        const to = Math.min(e.end ?? now, dayEnd, now);
        if (to > from) s.sleepMs += to - from;
        if (inDay && e.data.nap) s.naps += 1;
        break;
      }
    }
  }
  return s;
}

/** Groups entries (newest first) into local days, newest day first. */
export function groupByDay(entries: Entry[]): { dayStart: number; entries: Entry[] }[] {
  const sorted = entries.filter((e) => e.deletedAt === null).sort((a, b) => b.start - a.start);
  const groups: { dayStart: number; entries: Entry[] }[] = [];
  for (const e of sorted) {
    const day = startOfLocalDay(e.start);
    const last = groups[groups.length - 1];
    if (last && last.dayStart === day) last.entries.push(e);
    else groups.push({ dayStart: day, entries: [e] });
  }
  return groups;
}
