export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** "13:05" in local time. */
export function formatClock(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "1h 05m", "42m", "<1m", or "0m" for nothing. */
export function formatDuration(ms: number): string {
  if (ms <= 0) return '0m';
  const totalMinutes = Math.floor(ms / MINUTE);
  if (totalMinutes < 1) return '<1m';
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h}h ${pad(m)}m` : `${m}m`;
}

/** "1:05:09" — for live running timers. */
export function formatStopwatch(ms: number): string {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function formatAgo(ms: number, now: number): string {
  return `${formatDuration(now - ms)} ago`;
}

export function startOfLocalDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Local minutes after midnight for a timestamp. */
export function minuteOfDay(ms: number): number {
  const d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes();
}

/** Whether a timestamp falls in [dayStartMinute, dayEndMinute) local time. */
export function isDaytime(ms: number, dayStartMinute: number, dayEndMinute: number): boolean {
  const m = minuteOfDay(ms);
  return m >= dayStartMinute && m < dayEndMinute;
}

export function formatMinuteOfDay(minute: number): string {
  return `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Today", "Yesterday" or "Mon 3 Nov". */
export function formatDayLabel(dayStart: number, now: number): string {
  const today = startOfLocalDay(now);
  if (dayStart === today) return 'Today';
  if (dayStart === startOfLocalDay(today - 1)) return 'Yesterday';
  const d = new Date(dayStart);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "3 Nov 2026". */
export function formatDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;

/** "5 weeks 3 days": a unit count plus the remaining days, if any. */
const withDays = (n: number, unit: string, days: number) =>
  days > 0 ? `${plural(n, unit)} ${plural(days, 'day')}` : plural(n, unit);

/** Whole local days from one local midnight to another (23- or 25-hour days round). */
const daysBetween = (from: number, to: number) => Math.round((to - from) / DAY);

/**
 * Local midnight `months` months after a date, kept inside the target month: one month
 * after 31 January is 28 (or 29) February.
 */
function addMonths(y: number, monthIndex: number, day: number, months: number): number {
  const lastDay = new Date(y, monthIndex + months + 1, 0).getDate();
  return new Date(y, monthIndex + months, Math.min(day, lastDay)).getTime();
}

/**
 * Age from an ISO birth date: "3 days" up to 2 weeks, "5 weeks 3 days" up to 13 weeks,
 * then "4 months 12 days".
 */
export function formatAge(birthDate: string, now: number): string {
  const [y, mo, d] = birthDate.split('-').map(Number);
  const born = new Date(y, mo - 1, d).getTime();
  const today = startOfLocalDay(now);
  const days = daysBetween(born, today);
  if (days < 0) return '';
  if (days < 14) return plural(days, 'day');
  if (days < 7 * 13) return withDays(Math.floor(days / 7), 'week', days % 7);
  const nowDate = new Date(today);
  let months = (nowDate.getFullYear() - y) * 12 + (nowDate.getMonth() - (mo - 1));
  if (addMonths(y, mo - 1, d, months) > today) months -= 1;
  return withDays(months, 'month', daysBetween(addMonths(y, mo - 1, d, months), today));
}

export function toIsoDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
