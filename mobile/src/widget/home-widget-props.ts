// What the iPhone home-screen widget shows, and the taps it queues for the app. The widget
// itself (home-widget.ios.tsx) runs in the widget extension and only sees these props.
import { Colors } from '@/constants/theme';
import { entryDurationLabel, entryTitle, runningEntries, summarizeDay } from '@/domain/entries';
import { isUntrackedNight, lastWake, withoutForgottenSleeps } from '@/domain/night-sleep';
import { nextFeedAt } from '@/domain/reminders';
import { formatClock, formatDuration } from '@/domain/time';
import type { Child, Entry, Settings } from '@/domain/types';
import { nextSleepDetail, widgetSummary, type WidgetLine } from '@/domain/widget';

import { WIDGET_ACTION } from './widget-action';

/** The widget kind, as in the expo-widgets entry of app.json. */
export const HOME_WIDGET = 'Summary';

/** The widget's buttons that change the log (Feed opens the app instead). */
export type HomeWidgetTarget = 'sleep' | 'wet' | 'solid' | 'both';

/** A tap on the widget, kept in its props until the app has carried it out. */
export interface WidgetTap {
  id: string;
  target: HomeWidgetTarget;
  /** When it was tapped, in milliseconds since the epoch. */
  at: number;
}

export interface HomeWidgetLine extends WidgetLine {
  /** Start of the running timer of this kind: the widget counts it up by itself. */
  since: number | null;
}

export interface HomeWidgetTints {
  feeding: string;
  sleep: string;
  diaper: string;
  secondary: string;
  background: string;
}

export interface HomeWidgetProps {
  /** Null until a baby is added: the widget then asks to open the app. */
  childName: string | null;
  feeding: HomeWidgetLine;
  sleep: HomeWidgetLine;
  diaper: HomeWidgetLine;
  sleeping: boolean;
  /** Deep link that opens the feeding entry screen. */
  feedingUri: string;
  light: HomeWidgetTints;
  dark: HomeWidgetTints;
  /** Taps the app has not carried out yet. */
  taps: WidgetTap[];
  /** Label of the button just tapped, drawn with a check mark. */
  confirmed: string | null;
  /** End of the last sleep while awake during the day: the small widget counts it up. */
  awakeSince: number | null;
  /** Large widget: today so far, e.g. "6 feeds · 3h 10m sleep · 5 diapers". */
  totals: string;
  /** Large widget: what comes next, e.g. "nap 14:00 · feed 15:30". Empty when nothing. */
  next: string;
  /** Large widget: the latest finished entries, newest first. */
  recent: { at: string; text: string }[];
}

/** A button of the small widget, chosen in "Edit Widget". */
export type SmallButton = 'sleep' | 'wet' | 'solid' | 'both';

/** The widget's settings ("Edit Widget"), as in the expo-widgets entry of app.json. */
export interface HomeWidgetConfig {
  feeding?: boolean;
  sleep?: boolean;
  diaper?: boolean;
  showInfo?: boolean;
  smallFirst?: SmallButton;
  smallSecond?: SmallButton | 'off';
}

function tints(c: (typeof Colors)['light' | 'dark']): HomeWidgetTints {
  return {
    feeding: c.feeding,
    sleep: c.sleep,
    diaper: c.diaper,
    secondary: c.textSecondary,
    background: c.background,
  };
}

const EMPTY_LINE: HomeWidgetLine = { title: '', detail: '', since: null };

export function homeWidgetProps(
  child: Pick<Child, 'name' | 'birthDate' | 'dueDate'> | null,
  entries: Entry[],
  settings: Settings,
  now: number,
  feedingUri: string,
  confirmed: string | null = null,
): HomeWidgetProps {
  const base = {
    feedingUri,
    light: tints(Colors.light),
    dark: tints(Colors.dark),
    taps: [],
    confirmed,
  };
  if (!child) {
    return {
      ...base,
      childName: null,
      feeding: EMPTY_LINE,
      sleep: EMPTY_LINE,
      diaper: EMPTY_LINE,
      sleeping: false,
      awakeSince: null,
      totals: '',
      next: '',
      recent: [],
    };
  }
  const summary = widgetSummary(child, entries, settings, now);
  const shown = withoutForgottenSleeps(entries, settings, now).filter((e) => e.deletedAt === null);
  const running = runningEntries(shown);
  const since = (kind: Entry['kind']) => running.find((e) => e.kind === kind)?.start ?? null;
  return {
    ...base,
    childName: summary.childName,
    feeding: { ...summary.feeding, since: since('feeding') },
    sleep: { ...summary.sleep, since: since('sleep') },
    diaper: { ...summary.diaper, since: null },
    sleeping: summary.sleeping,
    awakeSince:
      summary.sleeping || isUntrackedNight(settings, now) ? null : lastWake(shown, settings, now),
    totals: dayTotals(shown, now),
    next: nextUp(child, shown, settings, now),
    recent: shown
      .filter((e) => e.end !== null && e.start <= now)
      .sort((a, b) => b.start - a.start)
      .slice(0, RECENT)
      .map((e) => ({
        at: formatClock(e.start),
        text: [entryTitle(e), entryDurationLabel(e, now)].filter(Boolean).join(' · '),
      })),
  };
}

/** How many of the latest entries the large widget lists. */
const RECENT = 4;

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function dayTotals(entries: Entry[], now: number): string {
  const day = summarizeDay(entries, now);
  return [
    count(day.feedings, 'feed', 'feeds'),
    `${formatDuration(day.sleepMs)} sleep`,
    count(day.diapers, 'diaper', 'diapers'),
  ].join(' · ');
}

function nextUp(
  child: Pick<Child, 'name' | 'birthDate' | 'dueDate'>,
  entries: Entry[],
  settings: Settings,
  now: number,
): string {
  const sleeping = runningEntries(entries).some((e) => e.kind === 'sleep');
  const sleep =
    sleeping || isUntrackedNight(settings, now)
      ? ''
      : nextSleepDetail(child, entries, settings, now);
  const feedAt = nextFeedAt(entries, settings);
  const feed = feedAt !== null && feedAt > now ? `feed ${formatClock(feedAt)}` : '';
  return [sleep, feed].filter(Boolean).join(' · ');
}

/**
 * A copy without null and undefined values, at any depth. The widget's timeline is kept in
 * UserDefaults, which takes property-list values only: one null anywhere and iOS drops the
 * whole timeline without an error, and the widget stays empty. The widget reads a dropped
 * value as undefined, which it treats like null.
 */
export function withoutNulls<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.filter((v) => v != null).map((v) => withoutNulls(v)) as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) if (v != null) out[key] = withoutNulls(v);
    return out as T;
  }
  return value;
}

/** What a tap asks for, in the terms of the shared tap handling (widget-actions). */
export function tapAction(target: HomeWidgetTarget): {
  action: string;
  data?: Record<string, unknown>;
} {
  switch (target) {
    case 'sleep':
      return { action: WIDGET_ACTION.toggleSleep };
    case 'wet':
      return { action: WIDGET_ACTION.logDiaper, data: { wet: true, solid: false, label: 'Wet' } };
    case 'solid':
      return { action: WIDGET_ACTION.logDiaper, data: { wet: false, solid: true, label: 'Solid' } };
    case 'both':
      return {
        action: WIDGET_ACTION.logDiaper,
        data: { wet: true, solid: true, label: 'Wet + solid' },
      };
  }
}

const TARGETS: readonly string[] = ['sleep', 'wet', 'solid', 'both'];

function isTap(value: unknown): value is WidgetTap {
  if (!value || typeof value !== 'object') return false;
  const t = value as Partial<WidgetTap>;
  return (
    typeof t.id === 'string' &&
    typeof t.at === 'number' &&
    typeof t.target === 'string' &&
    TARGETS.includes(t.target)
  );
}

/**
 * The taps waiting in the widget's timeline, oldest first, each once. A tap lands in the entry
 * that was on screen, so they can be spread over the entries.
 */
export function pendingTaps(timeline: { props: Partial<HomeWidgetProps> }[]): WidgetTap[] {
  const seen = new Map<string, WidgetTap>();
  for (const entry of timeline) {
    const taps = Array.isArray(entry.props?.taps) ? entry.props.taps : [];
    for (const tap of taps) if (isTap(tap) && !seen.has(tap.id)) seen.set(tap.id, tap);
  }
  return [...seen.values()].sort((a, b) => a.at - b.at);
}
