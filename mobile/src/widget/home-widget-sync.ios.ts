// Keeps the iPhone home-screen widget (home-widget.ios.tsx) up to date and carries out the
// taps it queued. A tap's intent runs in the app's process: it wakes the app in the background
// if needed, and the WidgetWake module keeps it awake until the tap is saved and synced.
import { addUserInteractionListener } from 'expo-widgets';
import { AppState } from 'react-native';

import type { Repo } from '@/db/repo';
import { DAY, MINUTE, startOfLocalDay } from '@/domain/time';

import WidgetWake from '../../modules/widget-wake';
import HomeWidget from './home-widget.ios';
import {
  HOME_WIDGET,
  homeWidgetProps,
  pendingTaps,
  tapAction,
  withoutNulls,
} from './home-widget-props';
import { afterWidgetWrite, feedingUri, handleClick, serial, widgetRepo } from './widget-actions';

/** How long a tapped button keeps its check mark. */
const CONFIRM_MS = 2_500;
/**
 * The widget can't compute anything itself, so it gets what to show for the coming hours:
 * "awake since", the next nap and feed stay right without the app running.
 */
const STEP_MS = 15 * MINUTE;
const STEPS = 12;
/** A tap that waited longer than this (the app could not run) is dropped, not logged late. */
const MAX_TAP_AGE_MS = 6 * 60 * MINUTE;

/** Taps this app process already carried out: their entries are written. */
const handled = new Set<string>();

async function render(repo: Repo, confirmed: string | null = null): Promise<void> {
  const [settings, children] = await Promise.all([repo.getSettings(), repo.listChildren()]);
  const child = children.find((c) => c.id === settings.activeChildId) ?? children[0] ?? null;
  const now = Date.now();
  const entries = child ? await repo.listEntries(child.id, startOfLocalDay(now) - DAY) : [];
  const uri = feedingUri();
  // Keep taps that came in meanwhile: they are carried out next.
  const waiting = pendingTaps(await HomeWidget.getTimeline().catch(() => [])).filter(
    (t) => !handled.has(t.id),
  );
  const at = (time: number, shown: string | null) => ({
    date: new Date(time),
    props: withoutNulls({
      ...homeWidgetProps(child, entries, settings, time, uri, shown),
      taps: waiting,
    }),
  });
  const timeline = [at(now, confirmed)];
  if (confirmed) timeline.push(at(now + CONFIRM_MS, null));
  for (let i = 1; i <= STEPS; i++) timeline.push(at(now + i * STEP_MS, null));
  HomeWidget.updateTimeline(timeline);
}

/** Redraws the widget; call after the log or the settings change. */
export function updateHomeWidget(repo: Repo): Promise<void> {
  return serial(() => render(repo));
}

let draining = 0;

/**
 * Carries out the taps waiting in the widget, oldest first, at the time they were made, then
 * redraws it and syncs. Lets the app sleep again when done.
 */
async function drainTaps(): Promise<void> {
  draining++;
  try {
    const result = await serial(async () => {
      const taps = pendingTaps(await HomeWidget.getTimeline()).filter((t) => !handled.has(t.id));
      if (!taps.length) return null;
      const { repo, inApp } = await widgetRepo();
      let wrote = false;
      let confirmed: string | null = null;
      for (const tap of taps) {
        handled.add(tap.id);
        const now = Date.now();
        if (now - tap.at > MAX_TAP_AGE_MS) continue;
        const { action, data } = tapAction(tap.target);
        const r = await handleClick(repo, action, data, Math.min(tap.at, now)).catch(() => null);
        wrote ||= r?.wrote ?? false;
        confirmed = r?.confirmed ?? null;
      }
      // Show the result first: reminders and the sync with the relay can take seconds.
      await render(repo, confirmed);
      return { repo, inApp, wrote };
    });
    if (result?.wrote) await afterWidgetWrite(result.repo, result.inApp);
  } finally {
    // Another tap may have come in meanwhile: the last drain lets go.
    if (--draining === 0) WidgetWake?.release();
  }
}

let registered = false;

/** Call once at startup, before the app renders: also runs when a tap woke the app. */
export function registerHomeWidget(): void {
  if (registered) return;
  registered = true;
  const drain = () => drainTaps().catch((e) => console.warn('Widget taps failed', e));
  addUserInteractionListener((event) => {
    if (event.source === HOME_WIDGET) drain();
  });
  AppState.addEventListener('change', (state) => state === 'active' && drain());
  // Woken by a tap, or taps left from a time the app could not run.
  drain();
}
