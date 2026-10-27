import { DAY, HOUR, MINUTE, startOfLocalDay } from './time';
import type { Entry, EntryOf, Settings } from './types';

// Age-based day schedules. Times are minutes after midnight for a day that starts at 07:00;
// a different `dayStartMinute` shifts the whole day. Nap times are in-bed times: the baby
// goes into bed at `start` and is taken out at `end`, also after a shorter sleep.

/** Reference wake-up time the schedule times are written for. */
const BASE_DAY_START = 7 * 60;

export interface PlannedNap {
  start: number;
  end: number;
}

export interface ScheduleStage {
  id: string;
  label: string;
  naps: PlannedNap[];
  bedtime: number;
  /** Typical minutes awake between sleeps; null where the clock times lead instead. */
  wakeWindow: [number, number] | null;
  /** Typical minutes awake after the last nap before bed (older babies). */
  awakeBeforeBed: [number, number] | null;
  /** Target daytime sleep in minutes. */
  daySleep: [number, number];
  /** Night sleep in hours. */
  nightSleepHours: number;
}

const t = (h: number, m = 0) => h * 60 + m;
const nap = (start: number, end: number): PlannedNap => ({ start, end });

/** Stages in age order; a stage applies until the next one starts. */
const STAGES: (ScheduleStage & { from: Age })[] = [
  {
    id: 'w0',
    label: '0–3 weeks',
    from: { weeks: 0 },
    naps: [nap(t(8, 15), t(10)), nap(t(11, 15), t(14)), nap(t(15, 30), t(17))],
    bedtime: t(18),
    wakeWindow: [45, 75],
    awakeBeforeBed: null,
    daySleep: [330, 450],
    nightSleepHours: 13,
  },
  {
    id: 'w3',
    label: '3–6 weeks',
    from: { weeks: 3 },
    naps: [nap(t(8, 30), t(10)), nap(t(11, 30), t(14)), nap(t(15, 30), t(17))],
    bedtime: t(18),
    wakeWindow: [75, 90],
    awakeBeforeBed: null,
    daySleep: [315, 330],
    nightSleepHours: 13,
  },
  {
    id: 'w6',
    label: '6–9 weeks',
    from: { weeks: 6 },
    naps: [nap(t(8, 30), t(10)), nap(t(11, 30), t(14)), nap(t(15, 45), t(17))],
    bedtime: t(18, 15),
    wakeWindow: [90, 90],
    awakeBeforeBed: null,
    daySleep: [315, 315],
    nightSleepHours: 12,
  },
  {
    id: 'w9',
    label: '9–12 weeks',
    from: { weeks: 9 },
    naps: [nap(t(8, 45), t(10)), nap(t(11, 30), t(14)), nap(t(15, 45), t(17))],
    bedtime: t(18, 15),
    wakeWindow: [90, 105],
    awakeBeforeBed: null,
    daySleep: [300, 300],
    nightSleepHours: 12,
  },
  {
    id: 'w12',
    label: '12–16 weeks',
    from: { weeks: 12 },
    naps: [nap(t(8, 45), t(10)), nap(t(11, 30), t(14)), nap(t(16), t(17))],
    bedtime: t(18, 30),
    wakeWindow: [90, 120],
    awakeBeforeBed: null,
    daySleep: [270, 270],
    nightSleepHours: 12,
  },
  {
    id: 'm4',
    label: '4 months',
    from: { weeks: 16 },
    naps: [nap(t(9), t(10)), nap(t(12), t(14)), nap(t(16, 15), t(17))],
    bedtime: t(19),
    wakeWindow: [120, 120],
    awakeBeforeBed: null,
    daySleep: [240, 240],
    nightSleepHours: 12,
  },
  {
    id: 'm5',
    label: '5 months',
    from: { months: 5 },
    naps: [nap(t(9, 15), t(10)), nap(t(12), t(14, 15)), nap(t(16, 30), t(17))],
    bedtime: t(19),
    wakeWindow: [135, 135],
    awakeBeforeBed: null,
    daySleep: [240, 240],
    nightSleepHours: 12,
  },
  {
    id: 'm6',
    label: '6 months',
    from: { months: 6 },
    naps: [nap(t(9, 15), t(10)), nap(t(12, 15), t(14, 15)), nap(t(16, 45), t(17))],
    bedtime: t(19),
    wakeWindow: [150, 150],
    awakeBeforeBed: null,
    daySleep: [180, 180],
    nightSleepHours: 12,
  },
  {
    id: 'm7',
    label: '7 months',
    from: { months: 7 },
    naps: [nap(t(9, 30), t(10)), nap(t(12, 30), t(14, 30)), nap(t(16, 45), t(17))],
    bedtime: t(19),
    wakeWindow: [150, 150],
    awakeBeforeBed: null,
    daySleep: [165, 165],
    nightSleepHours: 12,
  },
  {
    id: 'm8',
    label: '8–12 months',
    from: { months: 8 },
    naps: [nap(t(9, 15), t(10)), nap(t(12, 30), t(14, 30))],
    bedtime: t(19),
    wakeWindow: [150, 150],
    awakeBeforeBed: [240, 270],
    daySleep: [150, 165],
    nightSleepHours: 12,
  },
  {
    id: 'm13',
    label: '13–18 months',
    from: { months: 13 },
    naps: [nap(t(9, 40), t(10)), nap(t(12, 30), t(14, 30))],
    bedtime: t(19),
    wakeWindow: null,
    awakeBeforeBed: [240, 270],
    daySleep: [120, 150],
    nightSleepHours: 12,
  },
  {
    id: 'm19',
    label: '19–24 months',
    from: { months: 19 },
    naps: [nap(t(12, 30), t(14, 30))],
    bedtime: t(19),
    wakeWindow: null,
    awakeBeforeBed: [270, 270],
    daySleep: [120, 150],
    nightSleepHours: 12,
  },
  {
    id: 'y2',
    label: '2–3 years',
    from: { months: 25 },
    naps: [nap(t(12, 30), t(14, 30))],
    bedtime: t(19),
    wakeWindow: null,
    awakeBeforeBed: [270, 270],
    daySleep: [90, 120],
    nightSleepHours: 12,
  },
  {
    id: 'y3',
    label: '3–4 years',
    from: { months: 37 },
    naps: [nap(t(13), t(14, 30))],
    bedtime: t(19),
    wakeWindow: null,
    awakeBeforeBed: [270, 270],
    daySleep: [90, 90],
    nightSleepHours: 12,
  },
];

export const SCHEDULE_STAGES: readonly ScheduleStage[] = STAGES;

/** Latest time of day a nap may run to, and the longest single unplanned nap. */
export const LATEST_NAP_END = t(17);
export const MAX_NAP_MINUTES = 150;
/** Start of the catch-up window after a failed midday nap; it runs to LATEST_NAP_END. */
const CATCH_UP_FROM = { threeNaps: t(15), fewerNaps: t(16) };
/** A sleep counts toward a planned nap when it starts this long before it, or during it. */
const MATCH_EARLY = 60;
/** Waking up this much before the planned end counts as waking early. */
const EARLY_WAKE_MINUTES = 15;

type Age = { weeks: number } | { months: number };

/** Parses an ISO date (YYYY-MM-DD) as local midnight. */
function localDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * The date age is counted from: the due date for a baby born early, else the birth date.
 * Returns null when neither is known.
 */
export function ageReference(child: { birthDate: string | null; dueDate?: string | null }) {
  const birth = child.birthDate;
  const due = child.dueDate ?? null;
  if (birth && due && due > birth) return due;
  return birth ?? due;
}

/** The moment (local midnight) a baby counted from `reference` reaches an age. */
function reachesAge(reference: string, age: Age): number {
  const d = localDate(reference);
  if ('weeks' in age) d.setDate(d.getDate() + age.weeks * 7);
  else d.setMonth(d.getMonth() + age.months);
  return d.getTime();
}

export interface StageInfo {
  stage: ScheduleStage;
  /** When the baby entered this stage (local midnight); null for a stage picked by hand. */
  since: number | null;
  /** Picked by hand in settings rather than from the age. */
  manual: boolean;
}

/**
 * The schedule stage for a child at `now`: the stage picked in settings, or else the one
 * for the child's (corrected) age. Null when no stage is picked and the age is unknown.
 */
export function stageFor(
  child: { birthDate: string | null; dueDate?: string | null },
  settings: Pick<Settings, 'scheduleStage'>,
  now: number,
): StageInfo | null {
  const picked = STAGES.find((s) => s.id === settings.scheduleStage);
  if (picked) return { stage: picked, since: null, manual: true };
  const reference = ageReference(child);
  if (!reference) return null;
  let current: StageInfo | null = null;
  for (const s of STAGES) {
    const since = reachesAge(reference, s.from);
    if (since > now) break;
    current = { stage: s, since, manual: false };
  }
  // Before the due date of a baby born early, follow the newborn stage.
  return current ?? { stage: STAGES[0], since: null, manual: false };
}

/** Epoch ms for a schedule time (minutes, 07:00-based) on the local day of `day`. */
export function scheduleTime(
  settings: Pick<Settings, 'dayStartMinute'>,
  day: number,
  minute: number,
): number {
  const d = new Date(startOfLocalDay(day));
  d.setMinutes(minute + settings.dayStartMinute - BASE_DAY_START);
  return d.getTime();
}

export interface PlanSlot extends PlannedNap {
  /** 1-based position among the day's naps. */
  index: number;
  /** Epoch ms for the slot on the planned day. */
  startAt: number;
  endAt: number;
}

export interface DayPlan {
  stage: ScheduleStage;
  naps: PlanSlot[];
  bedtimeAt: number;
}

/** The stage's schedule placed on the local day containing `day`, shifted to the day start. */
export function planDay(
  stage: ScheduleStage,
  settings: Pick<Settings, 'dayStartMinute'>,
  day: number,
): DayPlan {
  const at = (minute: number) => scheduleTime(settings, day, minute);
  return {
    stage,
    naps: stage.naps.map((n, i) => ({
      ...n,
      index: i + 1,
      startAt: at(n.start),
      endAt: at(n.end),
    })),
    bedtimeAt: at(stage.bedtime),
  };
}

/** The planned nap a sleep starting at `start` belongs to, if any. */
export function matchSlot(plan: DayPlan, start: number): PlanSlot | null {
  return (
    plan.naps.find((s) => start >= s.startAt - MATCH_EARLY * MINUTE && start < s.endAt) ?? null
  );
}

/** When a nap that started at `start` should end: its planned slot's end, or capped by the rules. */
export function plannedNapEnd(plan: DayPlan, start: number, latestNapEnd: number): number {
  const slot = matchSlot(plan, start);
  if (slot) return slot.endAt;
  return Math.min(start + MAX_NAP_MINUTES * MINUTE, latestNapEnd);
}

export type SlotStatus = 'done' | 'short' | 'missed' | 'now' | 'sleeping' | 'upcoming';

export interface SlotState extends PlanSlot {
  status: SlotStatus;
  /** Sleep that counted toward this slot, in ms. */
  sleptMs: number;
}

export type SleepAdvice =
  | { kind: 'resettle'; until: number }
  | { kind: 'catch-up'; from: number; to: number }
  | { kind: 'wake-overdue'; since: number };

export interface ScheduleStatus {
  plan: DayPlan;
  stage: StageInfo;
  slots: SlotState[];
  /** The nap the baby is in now (running sleep), with its planned end. */
  current: { slot: PlanSlot | null; endAt: number; startedAt: number } | null;
  /** The next planned nap not yet slept, while awake. */
  next: PlanSlot | null;
  /** Daytime sleep logged so far against the stage's target, in ms. */
  daySleptMs: number;
  /** The next start of the day (wake-up time), for night sleep. */
  morningAt: number;
  advice: SleepAdvice | null;
}

function overlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

/**
 * Where today stands against the schedule: which naps were slept, the nap running now
 * and when it should end, the next nap, and advice when the day went off plan.
 */
export function scheduleStatus(
  entries: Entry[],
  child: { birthDate: string | null; dueDate?: string | null },
  settings: Pick<Settings, 'scheduleStage' | 'dayStartMinute'>,
  now: number,
): ScheduleStatus | null {
  const stage = stageFor(child, settings, now);
  if (!stage) return null;
  const plan = planDay(stage.stage, settings, now);
  const dayStart = scheduleTime(settings, now, BASE_DAY_START);
  const latestNapEnd = scheduleTime(settings, now, LATEST_NAP_END);

  const sleeps = entries.filter(
    (e): e is EntryOf<'sleep'> => e.kind === 'sleep' && e.deletedAt === null,
  );
  const running = sleeps.find((e) => e.end === null) ?? null;
  // Naps: sleeps starting from an hour before the day start until the latest nap end.
  // Sleep starting later is the night, also when the daytime window logged it as a nap.
  const daySleeps = sleeps.filter((e) => e.start >= dayStart - HOUR && e.start < latestNapEnd);

  const slots: SlotState[] = plan.naps.map((slot) => {
    let sleptMs = 0;
    let sleepingNow = false;
    for (const e of daySleeps) {
      if (matchSlot(plan, e.start)?.index !== slot.index) continue;
      sleptMs += (e.end ?? now) - e.start;
      if (e.end === null) sleepingNow = true;
    }
    const planned = slot.endAt - slot.startAt;
    let status: SlotStatus;
    if (sleepingNow) status = 'sleeping';
    else if (sleptMs > 0) status = slot.endAt <= now && sleptMs < planned / 2 ? 'short' : 'done';
    else if (slot.endAt <= now) status = 'missed';
    else if (slot.startAt <= now) status = 'now';
    else status = 'upcoming';
    return { ...slot, status, sleptMs };
  });

  let current: ScheduleStatus['current'] = null;
  if (running && running.data.nap && daySleeps.includes(running)) {
    const slot = matchSlot(plan, running.start);
    current = {
      slot,
      endAt: plannedNapEnd(plan, running.start, latestNapEnd),
      startedAt: running.start,
    };
  }

  const next = running
    ? null
    : (slots.find((s) => s.status === 'now' || s.status === 'upcoming') ?? null);

  let daySleptMs = 0;
  for (const e of daySleeps) {
    daySleptMs += overlap(e.start, e.end ?? now, dayStart - HOUR, latestNapEnd);
  }

  return {
    plan,
    stage,
    slots,
    current,
    next,
    daySleptMs,
    morningAt: now < dayStart ? dayStart : scheduleTime(settings, now + DAY, BASE_DAY_START),
    advice: adviceFor(plan, settings, slots, sleeps, running, current, now),
  };
}

function adviceFor(
  plan: DayPlan,
  settings: Pick<Settings, 'dayStartMinute'>,
  slots: SlotState[],
  sleeps: EntryOf<'sleep'>[],
  running: EntryOf<'sleep'> | null,
  current: ScheduleStatus['current'],
  now: number,
): SleepAdvice | null {
  if (current && now >= current.endAt) return { kind: 'wake-overdue', since: current.endAt };
  if (running) return null;

  // Woke up well before the end of a planned nap that is still on: try to resettle.
  const last = sleeps
    .filter((e) => e.end !== null)
    .reduce<EntryOf<'sleep'> | null>((a, e) => (!a || e.end! > a.end! ? e : a), null);
  if (last?.end != null) {
    const slot = matchSlot(plan, last.start);
    if (slot && now < slot.endAt && slot.endAt - last.end >= EARLY_WAKE_MINUTES * MINUTE) {
      return { kind: 'resettle', until: slot.endAt };
    }
  }

  // The midday nap (the longest) went wrong: catch up late in the afternoon. Only when
  // sleep is being logged today, and no planned nap is left to do that job.
  const main = slots.reduce<SlotState | null>(
    (a, s) => (!a || s.endAt - s.startAt > a.endAt - a.startAt ? s : a),
    null,
  );
  const latestNapEnd = scheduleTime(settings, now, LATEST_NAP_END);
  const dayStart = scheduleTime(settings, now, BASE_DAY_START);
  const loggedToday = sleeps.some((e) => (e.end ?? now) >= dayStart - HOUR);
  const napLeft = slots.some((s) => s !== main && (s.status === 'upcoming' || s.status === 'now'));
  if (
    main &&
    (main.status === 'missed' || main.status === 'short') &&
    loggedToday &&
    !napLeft &&
    now < latestNapEnd
  ) {
    const start = slots.length >= 3 ? CATCH_UP_FROM.threeNaps : CATCH_UP_FROM.fewerNaps;
    const from = Math.max(scheduleTime(settings, now, start), main.endAt);
    return { kind: 'catch-up', from, to: latestNapEnd };
  }
  return null;
}

/** Whether a stage started recently enough to point it out (only for age-based stages). */
export function isNewStage(stage: StageInfo, now: number, withinDays = 3): boolean {
  if (stage.manual || stage.since === null || stage.stage.id === STAGES[0].id) return false;
  return now - stage.since < withinDays * DAY;
}
