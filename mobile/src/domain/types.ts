import { DEFAULT_DASHBOARD, type DashboardCardId } from './dashboard';

// Every record is an immutable-id row with timestamps and a soft-delete marker,
// so the Phase 2 sync layer can replicate it as a last-writer-wins change log.

export type EntryKind = 'feeding' | 'sleep' | 'diaper';

export type FeedingType = 'breast_milk' | 'formula' | 'fortified' | 'solid';
export type FeedingMethod = 'left' | 'right' | 'both' | 'bottle' | 'self';

export interface FeedingData {
  type: FeedingType;
  method: FeedingMethod;
  /** Millilitres; only meaningful for bottle feeds. */
  amount?: number;
}

export interface SleepData {
  nap: boolean;
}

export type DiaperColor = 'black' | 'brown' | 'green' | 'yellow';

export interface DiaperData {
  wet: boolean;
  solid: boolean;
  color?: DiaperColor;
}

export interface EntryDataMap {
  feeding: FeedingData;
  sleep: SleepData;
  diaper: DiaperData;
}

interface EntryBase<K extends EntryKind> {
  id: string;
  childId: string;
  kind: K;
  /** Epoch ms. */
  start: number;
  /** Epoch ms; `null` means the timer is still running. Instant entries use `end === start`. */
  end: number | null;
  data: EntryDataMap[K];
  notes: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export type FeedingEntry = EntryBase<'feeding'>;
export type SleepEntry = EntryBase<'sleep'>;
export type DiaperEntry = EntryBase<'diaper'>;
export type Entry = FeedingEntry | SleepEntry | DiaperEntry;

export type EntryOf<K extends EntryKind> = Extract<Entry, { kind: K }>;

/** Fields a caller provides when creating or editing an entry. */
export type EntryInput<K extends EntryKind = EntryKind> = {
  [P in K]: {
    kind: P;
    start: number;
    end: number | null;
    data: EntryDataMap[P];
    notes?: string;
  };
}[K];

export interface Child {
  id: string;
  name: string;
  /** ISO date (YYYY-MM-DD) or null when unknown. */
  birthDate: string | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface Settings {
  activeChildId: string | null;
  /** Minutes awake after a sleep before the nap reminder fires. */
  awakeWindowMinutes: number;
  /** Minutes after the start of the last feed before the next one is due. */
  feedIntervalMinutes: number;
  /** Daytime window, as minutes after local midnight. Outside it is "night". */
  dayStartMinute: number;
  dayEndMinute: number;
  napReminders: boolean;
  feedRemindersDay: boolean;
  feedAlarmNight: boolean;
  /** Visible Today-screen cards in display order. */
  dashboardCards: DashboardCardId[];
  /** Whether this phone shows nap and feed reminders (per phone, not synced). */
  remindersOnThisPhone: boolean;
}

/** Reminder rules shared by the phones of a family; the rest of Settings is per phone. */
export const SHARED_SETTINGS = [
  'awakeWindowMinutes',
  'feedIntervalMinutes',
  'dayStartMinute',
  'dayEndMinute',
  'napReminders',
  'feedRemindersDay',
  'feedAlarmNight',
] as const satisfies readonly (keyof Settings)[];

export type SharedSettings = Pick<Settings, (typeof SHARED_SETTINGS)[number]>;

export const DEFAULT_SETTINGS: Settings = {
  activeChildId: null,
  awakeWindowMinutes: 90,
  feedIntervalMinutes: 240,
  dayStartMinute: 7 * 60,
  dayEndMinute: 19 * 60 + 30,
  napReminders: true,
  feedRemindersDay: false,
  feedAlarmNight: true,
  dashboardCards: DEFAULT_DASHBOARD,
  remindersOnThisPhone: true,
};
