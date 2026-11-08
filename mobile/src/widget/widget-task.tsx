// Home-screen widget (Android): what it shows and what its buttons do. Runs as a headless
// JS task when the widget is added, refreshed or tapped, also while the app is closed.
import Constants from 'expo-constants';
import { getRandomBytes, randomUUID } from 'expo-crypto';
import { openDatabaseAsync } from 'expo-sqlite';
import { Platform } from 'react-native';
import {
  registerWidgetTaskHandler,
  requestWidgetUpdate,
  type WidgetRepresentation,
  type WidgetTaskHandlerProps,
} from 'react-native-android-widget';

import { getAppRepo } from '@/data/app-repo';
import { Repo } from '@/db/repo';
import { migrate } from '@/db/schema';
import { isNapStart, runningEntries } from '@/domain/entries';
import { DAY, startOfLocalDay } from '@/domain/time';
import { widgetSummary } from '@/domain/widget';
import { refreshNotifications } from '@/notifications/refresh';
import { publishReminders } from '@/sync/reminders';
import { secureStore } from '@/sync/secure-store';
import { loadEngine } from '@/sync/setup';

import { SUMMARY_WIDGET, SummaryWidget, WIDGET_ACTION } from './summary-widget';

let ownRepo: Promise<Repo> | null = null;

/** The app's repository when the app is running, else one opened for this task. */
async function widgetRepo(): Promise<{ repo: Repo; inApp: boolean }> {
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
  return `${first ?? 'babytracker'}://entry/feeding`;
}

async function renderSummary(repo: Repo, now = Date.now()): Promise<WidgetRepresentation> {
  const [settings, children] = await Promise.all([repo.getSettings(), repo.listChildren()]);
  const child = children.find((c) => c.id === settings.activeChildId) ?? children[0];
  // From yesterday's midnight: last night, today's naps and the latest of each kind.
  const entries = child ? await repo.listEntries(child.id, startOfLocalDay(now) - DAY) : [];
  const summary = child ? widgetSummary(child, entries, settings, now) : null;
  const uri = feedingUri();
  return {
    light: <SummaryWidget summary={summary} feedingUri={uri} dark={false} />,
    dark: <SummaryWidget summary={summary} feedingUri={uri} dark />,
  };
}

// Clicks only come from the widget's own buttons: the library's receiver is not exported,
// so other apps cannot send it WIDGET_CLICK (#42; CI checks the APK's manifest).
async function handleClick(repo: Repo, action?: string, data?: Record<string, unknown>) {
  const [settings, children] = await Promise.all([repo.getSettings(), repo.listChildren()]);
  const child = children.find((c) => c.id === settings.activeChildId) ?? children[0];
  if (!child) return false;
  const now = Date.now();
  if (action === WIDGET_ACTION.toggleSleep) {
    const entries = await repo.listEntries(child.id, now - DAY);
    const sleeping = runningEntries(entries).find((e) => e.kind === 'sleep');
    if (sleeping) await repo.stopEntry(sleeping.id);
    else await repo.startTimer(child.id, 'sleep', { nap: isNapStart(now, settings) });
    return true;
  }
  if (action === WIDGET_ACTION.logDiaper) {
    const wet = data?.wet === true;
    const solid = data?.solid === true;
    if (!wet && !solid) return false;
    await repo.addEntry(child.id, { kind: 'diaper', start: now, end: now, data: { wet, solid } });
    return true;
  }
  return false;
}

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
  if (props.widgetAction === 'WIDGET_DELETED') return;
  const { repo, inApp } = await widgetRepo();
  if (props.widgetAction === 'WIDGET_CLICK') {
    const wrote = await handleClick(repo, props.clickAction, props.clickActionData);
    // In the app the write already triggers reminders, sync and a widget refresh.
    if (wrote && !inApp) await afterBackgroundWrite(repo);
  }
  props.renderWidget(await renderSummary(repo));
}

/** Redraws the widgets on the home screen; call after the log or the settings change. */
export async function updateWidgets(repo: Repo): Promise<void> {
  if (Platform.OS !== 'android') return;
  await requestWidgetUpdate({
    widgetName: SUMMARY_WIDGET,
    renderWidget: () => renderSummary(repo),
  });
}

export function registerWidgetTask(): void {
  if (Platform.OS !== 'android') return;
  registerWidgetTaskHandler(widgetTaskHandler);
}
