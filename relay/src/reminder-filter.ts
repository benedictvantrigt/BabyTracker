/**
 * Which due reminders a phone wants pushed (#6 follow-up). A pushed reminder on an iPhone is
 * an alert that iOS shows without running the app, so the phone cannot drop one it does not
 * want: the relay leaves it out instead. Android checks again on the phone.
 *
 * The relay only sees a reminder's tag (`nap-0`, `feed-1`: reminder id, then child index)
 * and its time; the text stays sealed.
 */
export interface ReminderFilter {
  /** Reminder ids this phone shows: some of nap, wake, bed and feed. */
  ids: string[];
  /** Days of the week the phone is on duty, 0 is Sunday. */
  dutyDays: number[];
  /** A duty day runs from this minute after local midnight to the same minute next day. */
  dayStartMinute: number;
  /** The phone's IANA time zone. Without a usable one the duty days are not applied. */
  timeZone: string | null;
}

const ID = /^[a-z]{1,16}$/;

/** The filter a phone sent, or null for none (send it everything) or when it is unusable. */
export function parseReminderFilter(value: unknown): ReminderFilter | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  const ids = v.ids;
  const days = v.dutyDays;
  const start = v.dayStartMinute;
  if (!Array.isArray(ids) || ids.length > 16 || !ids.every((i) => typeof i === 'string' && ID.test(i)))
    return null;
  if (!Array.isArray(days) || !days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6))
    return null;
  if (!Number.isInteger(start) || (start as number) < 0 || (start as number) >= 24 * 60) return null;
  const zone = typeof v.timeZone === 'string' && validZone(v.timeZone) ? v.timeZone : null;
  return {
    ids: [...new Set(ids as string[])],
    dutyDays: [...new Set(days as number[])],
    dayStartMinute: start as number,
    timeZone: zone,
  };
}

function validZone(zone: string): boolean {
  if (zone.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * The duty day `ms` falls on in `timeZone`: before the day start it still belongs to the
 * day before, as on the phone (`dutyWeekday`).
 */
export function dutyWeekdayIn(ms: number, timeZone: string, dayStartMinute: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(new Date(ms));
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const day = WEEKDAYS.indexOf(part('weekday'));
  const minute = (Number(part('hour')) % 24) * 60 + Number(part('minute'));
  return minute < dayStartMinute ? (day + 6) % 7 : day;
}

/** Whether a phone with `filter` wants the reminder with `tag`, due at `fireAt`. */
export function wantsReminder(filter: ReminderFilter | null, tag: string, fireAt: number): boolean {
  if (!filter) return true;
  if (!filter.ids.includes(tag.split('-')[0])) return false;
  if (!filter.timeZone) return true;
  return filter.dutyDays.includes(dutyWeekdayIn(fireAt, filter.timeZone, filter.dayStartMinute));
}
