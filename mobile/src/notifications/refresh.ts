import type { Repo } from '@/db/repo';
import { isOnDuty } from '@/domain/duty-days';
import { runningEntries } from '@/domain/entries';
import { computeReminders, reminderWantedHere } from '@/domain/reminders';
import { forgottenSleeps, napCutoff } from '@/domain/night-sleep';
import { refluxReminder, refluxWindow } from '@/domain/reflux';
import { DAY } from '@/domain/time';
import type { Entry } from '@/domain/types';

import { awakeTimerFor, refluxTimerFor, sleepPlanText, type LiveTimer } from './live-timer-content';
import { nightAlarmsAuthorized, nightAlarmsReady, scheduleNightAlarms } from './night-alarms';
import { syncNotifications } from './scheduler';
import { errorText, reportTimerFailure, reportTimerStep, withTimeout } from './timer-report';

/**
 * Brings this phone's notifications in line with the log: one ongoing notification per
 * running timer, the awake timer between sleeps, and nap/feed reminders scheduled on the
 * phone, unless they are switched off here or the sync server delivers them by push. Only on
 * this phone's duty days: a reminder that falls on another day is left out, and so are the
 * timers while today isn't one. Nap and feed reminders, the sleep timer and the awake timer
 * each switch off per phone. A phone that tracks day sleep only shows no timer for a night
 * sleep (one logged on a partner's phone), and removes a sleep timer left running past the
 * day end there (`forgottenSleeps`). Works without the UI (background push).
 */
export async function refreshNotifications(repo: Repo, now = Date.now()): Promise<void> {
  try {
    await refresh(repo, now);
  } catch (e) {
    reportTimerFailure(`Updating notifications failed: ${errorText(e)}`);
    throw e;
  } finally {
    reportTimerStep(null);
  }
}

async function refresh(repo: Repo, now: number): Promise<void> {
  reportTimerStep('reading the log');
  const [settings, children, sync] = await Promise.all([
    repo.getSettings(),
    repo.listChildren(),
    repo.getSyncState(),
  ]);
  const child = children.find((c) => c.id === settings.activeChildId) ?? children[0];
  if (!child) return;
  let entries = await repo.listEntries(child.id, now - 2 * DAY);
  // Day sleep only: a sleep still running at the day end was never stopped. Remove it.
  const forgotten = forgottenSleeps(entries, settings, now);
  for (const e of forgotten) await repo.deleteEntry(e.id);
  if (forgotten.length) entries = entries.filter((e) => !forgotten.includes(e));
  const planned = computeReminders(entries, settings, child, now).filter(
    (r) => reminderWantedHere(r.id, settings) && isOnDuty(settings, r.fireAt),
  );
  // iOS 26+: night feeds ring as AlarmKit alarms (#7), scheduled here also when the other
  // reminders come by push; the pushed copy then shows quietly (#6). The alarms come after
  // the timers: asking for permission waits for the user, and iOS may not answer at all.
  const alarmKit = settings.nightFeedAlarmKit && nightAlarmsAuthorized();
  // The reflux reminder is never pushed by the relay: each phone schedules it itself (#93).
  const reflux = refluxWindow(entries, settings, now);
  const refluxNote = reflux && refluxReminder(reflux, child.name);
  const local =
    refluxNote && reminderWantedHere(refluxNote.id, settings) && isOnDuty(settings, refluxNote.fireAt)
      ? [refluxNote]
      : [];
  const remindersFor = (alarms: boolean) => [
    ...(sync?.pushActive ? [] : planned.filter((r) => !(alarms && r.alarm))),
    ...local,
  ];
  const onDuty = isOnDuty(settings, now);
  const running = onDuty
    ? runningEntries(entries).filter(
        (e) =>
          e.kind !== 'sleep' || (settings.sleepTimer && (settings.nightSleep || !isNightSleep(e))),
      )
    : [];
  const awake = onDuty ? awakeTimerFor(entries, child, settings, now) : null;
  const others = [awake, onDuty && reflux ? refluxTimerFor(reflux, child.name) : null].filter(
    (t): t is LiveTimer => t !== null,
  );
  const sleepPlan = sleepPlanText(entries, child, settings, now);
  // The lock-screen sleep timer goes at the day end even if the app does not run then.
  const runningSleep = running.find((e) => e.kind === 'sleep');
  const sleepUntil = runningSleep ? napCutoff(settings, runningSleep.start) : null;
  const notify = (alarms: boolean) =>
    syncNotifications(remindersFor(alarms), running, child.name, others, sleepPlan, sleepUntil);
  reportTimerStep('the lock-screen timers and reminders');
  await notify(alarmKit);

  reportTimerStep('the night-feed alarms');
  try {
    const wanted = planned.some((r) => r.alarm);
    const ready =
      settings.nightFeedAlarmKit &&
      (await withTimeout(nightAlarmsReady(wanted), 120_000, 'Asking for alarms'));
    await withTimeout(
      scheduleNightAlarms(ready ? planned.filter((r) => r.alarm) : []),
      15_000,
      'Setting the night-feed alarms',
    );
    // Just allowed: the night feeds now ring as alarms, not as notifications as well.
    if (ready !== alarmKit) await notify(ready);
    reportTimerFailure(null);
  } catch (e) {
    reportTimerFailure(`Night-feed alarms: ${errorText(e)}`);
  }
}

function isNightSleep(entry: Entry): boolean {
  return entry.kind === 'sleep' && !entry.data.nap;
}
