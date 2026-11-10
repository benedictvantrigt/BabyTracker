import { DEFAULT_DASHBOARD, type DashboardLayout } from './dashboard';

// Every record is an immutable-id row with timestamps and a soft-delete marker,
// so the Phase 2 sync layer can replicate it as a last-writer-wins change log.

export type EntryKind =
  | 'feeding'
  | 'sleep'
  | 'diaper'
  | 'tummy'
  | 'pumping'
  | 'temperature'
  | 'growth';

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

/** Tummy time is a timer with nothing else to record. */
export type TummyData = Record<string, never>;

export type PumpingSide = 'left' | 'right' | 'both';

export interface PumpingData {
  side: PumpingSide;
  /** Millilitres. */
  amount?: number;
}

export type TemperatureSite = 'armpit' | 'rectal' | 'ear' | 'forehead';

export interface TemperatureData {
  /** Degrees Celsius, to one decimal. */
  celsius: number;
  site?: TemperatureSite;
}

/** One measurement session; at least one of the three is set. */
export interface GrowthData {
  weightGrams?: number;
  lengthCm?: number;
  headCm?: number;
}

export interface EntryDataMap {
  feeding: FeedingData;
  sleep: SleepData;
  diaper: DiaperData;
  tummy: TummyData;
  pumping: PumpingData;
  temperature: TemperatureData;
  growth: GrowthData;
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
  /** Free-form labels, e.g. "teething"; see `normalizeTags`. */
  tags: string[];
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export type FeedingEntry = EntryBase<'feeding'>;
export type SleepEntry = EntryBase<'sleep'>;
export type DiaperEntry = EntryBase<'diaper'>;
export type TummyEntry = EntryBase<'tummy'>;
export type PumpingEntry = EntryBase<'pumping'>;
export type TemperatureEntry = EntryBase<'temperature'>;
export type GrowthEntry = EntryBase<'growth'>;
export type Entry =
  | FeedingEntry
  | SleepEntry
  | DiaperEntry
  | TummyEntry
  | PumpingEntry
  | TemperatureEntry
  | GrowthEntry;

export type EntryOf<K extends EntryKind> = Extract<Entry, { kind: K }>;

/** Fields a caller provides when creating or editing an entry. */
export type EntryInput<K extends EntryKind = EntryKind> = {
  [P in K]: {
    kind: P;
    start: number;
    end: number | null;
    data: EntryDataMap[P];
    notes?: string;
    /** Left out when editing: the entry keeps its tags. */
    tags?: string[];
  };
}[K];

export interface Child {
  id: string;
  name: string;
  /** ISO date (YYYY-MM-DD) or null when unknown. */
  birthDate: string | null;
  /** ISO due date for a baby born early; the sleep schedule counts age from it. */
  dueDate: string | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface Settings {
  activeChildId: string | null;
  /** Follow the age-based day schedule for naps and bedtime (else the awake window). */
  sleepSchedule: boolean;
  /** Schedule stage id picked by hand, or '' to follow the child's age. */
  scheduleStage: string;
  /** Minutes before a planned nap or bedtime that the reminder fires. */
  napLeadMinutes: number;
  /** Minutes awake after a sleep before the nap reminder fires (without the schedule). */
  awakeWindowMinutes: number;
  /** Minutes after the start of the last feed before the next one is due. */
  feedIntervalMinutes: number;
  /** Daytime window, as minutes after local midnight. Outside it is "night". */
  dayStartMinute: number;
  dayEndMinute: number;
  napReminders: boolean;
  feedRemindersDay: boolean;
  feedAlarmNight: boolean;
  /** Today-screen cards: display order and which are turned off (per phone). */
  dashboardLayout: DashboardLayout;
  /** Whether this phone shows nap and feed reminders (per phone, not synced). */
  remindersOnThisPhone: boolean;
}

/** Reminder rules shared by the phones of a family; the rest of Settings is per phone. */
export const SHARED_SETTINGS = [
  'sleepSchedule',
  'scheduleStage',
  'napLeadMinutes',
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
  sleepSchedule: true,
  scheduleStage: '',
  napLeadMinutes: 15,
  awakeWindowMinutes: 90,
  feedIntervalMinutes: 240,
  dayStartMinute: 7 * 60,
  dayEndMinute: 19 * 60 + 30,
  napReminders: true,
  feedRemindersDay: false,
  feedAlarmNight: true,
  dashboardLayout: DEFAULT_DASHBOARD,
  remindersOnThisPhone: true,
};
