// What the home-screen widget's buttons do, on Android (the widget task) and on iOS (taps the
// widget queued for the app). Both can run while the app is closed or in the background.
import Constants from 'expo-constants';
import { getRandomBytes } from 'expo-crypto';

import { getAppSync } from '@/data/app-repo';
import { sharedRepo } from '@/data/shared-repo';
import type { Repo } from '@/db/repo';
import { isNapStart, runningEntries } from '@/domain/entries';
import { sleepTimerAllowed, withoutForgottenSleeps } from '@/domain/night-sleep';
import { DAY } from '@/domain/time';
import { isRepeatTap } from '@/domain/widget';
import { refreshNotifications } from '@/notifications/refresh';
import { publishReminders } from '@/sync/reminders';
import { secureStore } from '@/sync/secure-store';
import { loadEngine } from '@/sync/setup';

import { WIDGET_ACTION } from './widget-action';

/** The app's repository when the app is running, else one opened for this task. */
export const widgetRepo = sharedRepo;

/** Deep link that opens the feeding entry screen. */
export function feedingUri(): string {
  const scheme = Constants.expoConfig?.scheme;
  const first = Array.isArray(scheme) ? scheme[0] : scheme;
  return `${first ?? 'napchime'}://entry/feeding`;
}

/**
 * Carries out a widget tap made at `now`. A tap the widget already handled a moment ago (a
 * double tap) changes nothing. Returns whether it wrote, and the label of a button to confirm
 * with a check mark.
 */
export async function handleClick(
  repo: Repo,
  action?: string,
  data?: Record<string, unknown>,
  now = Date.now(),
): Promise<{ wrote: boolean; confirmed?: string }> {
  const [settings, children] = await Promise.all([repo.getSettings(), repo.listChildren()]);
  const child = children.find((c) => c.id === settings.activeChildId) ?? children[0];
  if (!child) return { wrote: false };
  const entries = await repo.listEntries(child.id, now - DAY);
  if (action === WIDGET_ACTION.toggleSleep) {
    if (isRepeatTap(entries, now)) return { wrote: false };
    // A sleep left running past the day end does not count: refreshing removes it.
    const sleeping = runningEntries(withoutForgottenSleeps(entries, settings, now)).find((e) => e.kind === 'sleep');
    if (sleeping) await repo.stopEntry(sleeping.id, now);
    // Day sleep only on this phone: no sleep timer starts at night.
    else if (!sleepTimerAllowed(settings, now)) return { wrote: false };
    else await repo.startTimer(child.id, 'sleep', { nap: isNapStart(now, settings) }, now);
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

// Taps run one after another, so a second tap sees what the first one saved.
let queue: Promise<unknown> = Promise.resolve();
export function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
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

/**
 * After a write through the app running in the background. The app refreshes the lock-screen
 * timers and syncs shortly after each change, but on a timer, and the system runs no JS timers
 * for an app in the background (Android: only while a widget task runs; iOS: only while the
 * widget tap keeps it awake): the live timer still said "awake" until the app was opened. So
 * the tap does both itself and waits for them.
 */
async function afterInAppWrite(repo: Repo) {
  await refreshNotifications(repo).catch(() => {});
  await getAppSync()?.().catch(() => {});
}

/** Reminders, live timers and sync after a widget tap wrote something. */
export function afterWidgetWrite(repo: Repo, inApp: boolean): Promise<void> {
  return inApp ? afterInAppWrite(repo) : afterBackgroundWrite(repo);
}
