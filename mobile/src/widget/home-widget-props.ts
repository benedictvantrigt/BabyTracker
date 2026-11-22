// What the iPhone home-screen widget shows, and the taps it queues for the app. The widget
// itself (home-widget.ios.tsx) runs in the widget extension and only sees these props.
import { Colors } from '@/constants/theme';
import { runningEntries } from '@/domain/entries';
import type { Child, Entry, Settings } from '@/domain/types';
import { widgetSummary, type WidgetLine } from '@/domain/widget';

import { WIDGET_ACTION } from './widget-action';

/** The widget kind, as in the expo-widgets entry of app.json. */
export const HOME_WIDGET = 'Summary';

/** The widget's buttons that change the log (Feed opens the app instead). */
export type HomeWidgetTarget = 'sleep' | 'wet' | 'solid';

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
}

/** The widget's settings ("Edit Widget"), as in the expo-widgets entry of app.json. */
export interface HomeWidgetConfig {
  feeding?: boolean;
  sleep?: boolean;
  diaper?: boolean;
  showInfo?: boolean;
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
    };
  }
  const summary = widgetSummary(child, entries, settings, now);
  const running = runningEntries(entries);
  const since = (kind: Entry['kind']) => running.find((e) => e.kind === kind)?.start ?? null;
  return {
    ...base,
    childName: summary.childName,
    feeding: { ...summary.feeding, since: since('feeding') },
    sleep: { ...summary.sleep, since: since('sleep') },
    diaper: { ...summary.diaper, since: null },
    sleeping: summary.sleeping,
  };
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
  }
}

const TARGETS: readonly string[] = ['sleep', 'wet', 'solid'];

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
