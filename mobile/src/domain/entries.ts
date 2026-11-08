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
  GrowthData,
  PumpingData,
  PumpingSide,
  Settings,
  TemperatureData,
  TemperatureSite,
} from './types';

export const ENTRY_KINDS: readonly EntryKind[] = [
  'feeding',
  'sleep',
  'diaper',
  'tummy',
  'pumping',
  'temperature',
  'growth',
];

/** Kinds whose running timer shows outside the app (notification, Live Activity). */
export const LIVE_TIMER_KINDS: readonly EntryKind[] = ['sleep', 'feeding'];

export const KIND_LABEL: Record<EntryKind, string> = {
  feeding: 'Feeding',
  sleep: 'Sleep',
  diaper: 'Diaper',
  tummy: 'Tummy time',
  pumping: 'Pumping',
  temperature: 'Temperature',
  growth: 'Growth',
};

export const PUMPING_SIDE_LABEL: Record<PumpingSide, string> = {
  left: 'Left',
  right: 'Right',
  both: 'Both',
};

export const TEMPERATURE_SITE_LABEL: Record<TemperatureSite, string> = {
  armpit: 'Armpit',
  rectal: 'Rectal',
  ear: 'Ear',
  forehead: 'Forehead',
};

/** Limits for measurements typed by hand, to catch typos (e.g. weight in grams for kg). */
export const LIMITS = {
  amountMl: [1, 1000],
  celsius: [34, 43],
  weightGrams: [300, 30000],
  lengthCm: [30, 130],
  headCm: [20, 60],
} as const;

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

/** Kinds with a duration; diapers, temperatures and growth measurements are instant. */
export function isTimedKind(kind: EntryKind): boolean {
  return kind !== 'diaper' && kind !== 'temperature' && kind !== 'growth';
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

export function pumpingLabel(data: PumpingData): string {
  const side = PUMPING_SIDE_LABEL[data.side];
  return data.amount ? `${side} · ${data.amount} ml` : side;
}

/** "37.8 °C". */
export function temperatureLabel(data: TemperatureData): string {
  return `${data.celsius.toFixed(1)} °C`;
}

/** Up to `digits` decimals without trailing zeros: 4.25, 55, 37.5. */
function decimal(value: number, digits: number): string {
  return String(Number(value.toFixed(digits)));
}

/** "4.25 kg · 55 cm · head 37.5 cm", leaving out what was not measured. */
export function growthLabel(data: GrowthData): string {
  return [
    data.weightGrams !== undefined && `${decimal(data.weightGrams / 1000, 3)} kg`,
    data.lengthCm !== undefined && `${decimal(data.lengthCm, 1)} cm`,
    data.headCm !== undefined && `head ${decimal(data.headCm, 1)} cm`,
  ]
    .filter(Boolean)
    .join(' · ');
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
    case 'tummy':
      return 'Tummy time';
    case 'pumping':
      return `Pumping · ${pumpingLabel(entry.data)}`;
    case 'temperature':
      return `Temperature · ${temperatureLabel(entry.data)}`;
    case 'growth':
      return `Growth · ${growthLabel(entry.data)}`;
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
  if ((input.kind === 'feeding' || input.kind === 'pumping') && input.data.amount !== undefined) {
    if (!within(input.data.amount, LIMITS.amountMl)) return 'Amount must be between 1 and 1000 ml.';
  }
  if (input.kind === 'temperature') {
    if (input.end !== input.start) return 'A temperature reading has no duration.';
    if (!within(input.data.celsius, LIMITS.celsius)) {
      return 'Temperature must be between 34 and 43 °C.';
    }
  }
  if (input.kind === 'growth') {
    if (input.end !== input.start) return 'A measurement has no duration.';
    const { weightGrams, lengthCm, headCm } = input.data;
    if (weightGrams === undefined && lengthCm === undefined && headCm === undefined) {
      return 'Enter the weight, length or head circumference.';
    }
    if (weightGrams !== undefined && !within(weightGrams, LIMITS.weightGrams)) {
      return 'Weight must be between 0.3 and 30 kg.';
    }
    if (lengthCm !== undefined && !within(lengthCm, LIMITS.lengthCm)) {
      return 'Length must be between 30 and 130 cm.';
    }
    if (headCm !== undefined && !within(headCm, LIMITS.headCm)) {
      return 'Head circumference must be between 20 and 60 cm.';
    }
  }
  return null;
}

function within(value: number, [min, max]: readonly [number, number]): boolean {
  return Number.isFinite(value) && value >= min && value <= max;
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
  /** Tummy time ms started that day, counting a running session up to `now`. */
  tummyMs: number;
  /** Total pumped volume in ml. */
  pumpedMl: number;
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
    tummyMs: 0,
    pumpedMl: 0,
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
      case 'tummy':
        if (inDay) s.tummyMs += Math.max(0, Math.min(e.end ?? now, now) - e.start);
        break;
      case 'pumping':
        if (inDay) s.pumpedMl += e.data.amount ?? 0;
        break;
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
