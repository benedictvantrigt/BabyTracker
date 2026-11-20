// Home-screen widget (Android): what it shows and what its buttons do. Runs as a headless
// JS task when the widget is added, refreshed or tapped, also while the app is closed.
import Constants from 'expo-constants';
import { getRandomBytes, randomUUID } from 'expo-crypto';
import { openDatabaseAsync } from 'expo-sqlite';
import { Platform } from 'react-native';
import {
  registerWidgetTaskHandler,
  requestWidgetUpdate,
  type WidgetInfo,
  type WidgetRepresentation,
  type WidgetTaskHandlerProps,
} from 'react-native-android-widget';

import { getAppRepo } from '@/data/app-repo';
import { Repo } from '@/db/repo';
import { migrate } from '@/db/schema';
import { isNapStart, runningEntries } from '@/domain/entries';
import { sleepTimerAllowed } from '@/domain/night-sleep';
import { DAY, startOfLocalDay } from '@/domain/time';
import { isRepeatTap, widgetSummary } from '@/domain/widget';
import { widgetView, type WidgetLayout } from '@/domain/widget-layout';
import { refreshNotifications } from '@/notifications/refresh';
import { publishReminders } from '@/sync/reminders';
import { secureStore } from '@/sync/secure-store';
import { loadEngine } from '@/sync/setup';

import { SUMMARY_WIDGET, SummaryWidget, WIDGET_ACTION } from './summary-widget';

let ownRepo: Promise<Repo> | null = null;

/** The app's repository when the app is running, else one opened for this task. */
export async function widgetRepo(): Promise<{ repo: Repo; inApp: boolean }> {
  const app = getAppRepo();
  if (app) return { repo: app, inApp: true };
  ownRepo ??= (async () => {
    const db = await openDatabaseAsync('babytracker.db');
    await migrate(db);
    return new Repo(db, { uuid: randomUUID, now: Date.now });
  })();
  return { repo: await ownRepo, inApp: false };
}

function feedingUri(): string {
  const scheme = Constants.expoConfig?.scheme;
  const first = Array.isArray(scheme) ? scheme[0] : scheme;
  return `${first ?? 'napchime'}://entry/feeding`;
}

/**
 * The widget as `info` (one widget on the home screen) should show it: its own layout, or
 * `layout` while its settings screen is open, fitted to its size.
 */
export async function renderSummary(
  repo: Repo,
  info: Pick<WidgetInfo, 'widgetId' | 'width' | 'height'>,
  layout?: WidgetLayout,
  now = Date.now(),
  /** Label of the button just tapped, drawn with a check mark as a quick confirmation. */
  confirmed?: string,
): Promise<WidgetRepresentation> {
  const [settings, children, stored] = await Promise.all([
    repo.getSettings(),
    repo.listChildren(),
    layout ? Promise.resolve(layout) : repo.getWidgetLayout(info.widgetId),
  ]);
  const view = widgetView(stored, info.width, info.height);
  const child = children.find((c) => c.id === settings.activeChildId) ?? children[0];
  // From yesterday's midnight: last night, today's naps and the latest of each kind.
  const entries = child ? await repo.listEntries(child.id, startOfLocalDay(now) - DAY) : [];
  const summary = child ? widgetSummary(child, entries, settings, now) : null;
  const uri = feedingUri();
  return {
    light: (
      <SummaryWidget
        summary={summary}
        feedingUri={uri}
        dark={false}
        view={view}
        confirmed={confirmed}
      />
    ),
    dark: (
      <SummaryWidget summary={summary} feedingUri={uri} dark view={view} confirmed={confirmed} />
    ),
  };
}

// Clicks only come from the widget's own buttons: the library's receiver is not exported,
// so other apps cannot send it WIDGET_CLICK (#42; CI checks the APK's manifest).
// A tap the widget already handled a moment ago (a double tap) changes nothing.
// Returns whether it wrote, and the label of a button to confirm with a check mark.
async function handleClick(
  repo: Repo,
  action?: string,
  data?: Record<string, unknown>,
): Promise<{ wrote: boolean; confirmed?: string }> {
  const [settings, children] = await Promise.all([repo.getSettings(), repo.listChildren()]);
  const child = children.find((c) => c.id === settings.activeChildId) ?? children[0];
  if (!child) return { wrote: false };
  const now = Date.now();
  const entries = await repo.listEntries(child.id, now - DAY);
  if (action === WIDGET_ACTION.toggleSleep) {
    if (isRepeatTap(entries, now)) return { wrote: false };
    const sleeping = runningEntries(entries).find((e) => e.kind === 'sleep');
    if (sleeping) await repo.stopEntry(sleeping.id);
    // Day sleep only on this phone: no sleep timer starts at night.
    else if (!sleepTimerAllowed(settings, now)) return { wrote: false };
    else await repo.startTimer(child.id, 'sleep', { nap: isNapStart(now, settings) });
    // The button itself turns into Wake / Sleep: that is the confirmation.
    return { wrote: true };
  }
  if (action === WIDGET_ACTION.logDiaper) {
    const wet = data?.wet === true;
    const solid = data?.solid === true;
    if (!wet && !solid) return { wrote: false };
    const label = typeof data?.label === 'string' ? data.label : undefined;
    if (isRepeatTap(entries, now, { wet, solid })) return { wrote: false, confirmed: label };
    await repo.addEntry(child.id, { kind: 'diaper', start: now, end: now, data: { wet, solid } });
    return { wrote: true, confirmed: label };
  }
  return { wrote: false };
}

/** How long a tapped button keeps its check mark. */
const CONFIRM_MS = 2_500;

// Taps run one after another, so a second tap sees what the first one saved.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * After a write with the app closed: reminders on this phone, then hand the change and the
 * new reminders to the partner phones. Offline or without sync, the app catches up later.
 */
async function afterBackgroundWrite(repo: Repo) {
  await refreshNotifications(repo).catch(() => {});
  try {
    const engine = await loadEngine({ repo, store: secureStore, random: getRandomBytes });
    if (!engine) return;
    await engine.sync();
    await publishReminders(repo, engine);
  } catch {
    // The outbox keeps the change for the next sync.
  }
}

async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  const { repo, inApp } = await widgetRepo();
  if (props.widgetAction === 'WIDGET_DELETED') {
    await repo.deleteWidgetLayout(props.widgetInfo.widgetId);
    return;
  }
  if (props.widgetAction === 'WIDGET_CLICK') {
    const { wrote, confirmed } = await serial(() =>
      handleClick(repo, props.clickAction, props.clickActionData),
    );
    // Show the result first: reminders and the sync with the relay can take seconds.
    const shownAt = Date.now();
    props.renderWidget(await renderSummary(repo, props.widgetInfo, undefined, shownAt, confirmed));
    // In the app the write already triggers reminders, sync and a widget refresh.
    if (wrote && !inApp) await afterBackgroundWrite(repo);
    if (!confirmed) return;
    await pause(CONFIRM_MS - (Date.now() - shownAt));
  }
  props.renderWidget(await renderSummary(repo, props.widgetInfo));
}

/** Redraws the widgets on the home screen; call after the log or the settings change. */
export async function updateWidgets(repo: Repo): Promise<void> {
  if (Platform.OS !== 'android') return;
  await requestWidgetUpdate({
    widgetName: SUMMARY_WIDGET,
    renderWidget: (info) => renderSummary(repo, info),
  });
}

export function registerWidgetTask(): void {
  if (Platform.OS !== 'android') return;
  registerWidgetTaskHandler(widgetTaskHandler);
}
