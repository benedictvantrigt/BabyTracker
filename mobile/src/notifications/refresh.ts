import type { Repo } from '@/db/repo';
import { isOnDuty } from '@/domain/duty-days';
import { runningEntries } from '@/domain/entries';
import { computeReminders, reminderWantedHere } from '@/domain/reminders';
import { DAY } from '@/domain/time';
import type { Entry } from '@/domain/types';

import { awakeTimerFor } from './live-timer-content';
import { nightAlarmsReady, scheduleNightAlarms } from './night-alarms';
import { syncNotifications } from './scheduler';

/**
 * Brings this phone's notifications in line with the log: one ongoing notification per
 * running timer, the awake timer between sleeps, and nap/feed reminders scheduled on the
 * phone, unless they are switched off here or the sync server delivers them by push. Only on
 * this phone's duty days: a reminder that falls on another day is left out, and so are the
 * timers while today isn't one. Nap and feed reminders, the sleep timer and the awake timer
 * each switch off per phone. A phone that tracks day sleep only shows no timer for a night
 * sleep (one logged on a partner's phone). Works without the UI (background push).
 */
export async function refreshNotifications(repo: Repo, now = Date.now()): Promise<void> {
  const [settings, children, sync] = await Promise.all([
    repo.getSettings(),
    repo.listChildren(),
    repo.getSyncState(),
  ]);
  const child = children.find((c) => c.id === settings.activeChildId) ?? children[0];
  if (!child) return;
  const entries = await repo.listEntries(child.id, now - 2 * DAY);
  const planned = computeReminders(entries, settings, child, now).filter(
    (r) => reminderWantedHere(r.id, settings) && isOnDuty(settings, r.fireAt),
  );
  // iOS 26+: night feeds ring as AlarmKit alarms (#7), scheduled here also when the other
  // reminders come by push; the pushed copy then shows quietly (#6).
  const alarmKit =
    settings.nightFeedAlarmKit && (await nightAlarmsReady(planned.some((r) => r.alarm)));
  await scheduleNightAlarms(alarmKit ? planned.filter((r) => r.alarm) : []);
  const reminders = sync?.pushActive ? [] : planned.filter((r) => !(alarmKit && r.alarm));
  const onDuty = isOnDuty(settings, now);
  const running = onDuty
    ? runningEntries(entries).filter(
        (e) =>
          e.kind !== 'sleep' || (settings.sleepTimer && (settings.nightSleep || !isNightSleep(e))),
      )
    : [];
  const awake = onDuty ? awakeTimerFor(entries, child, settings, now) : null;
  await syncNotifications(reminders, running, child.name, awake);
}

function isNightSleep(entry: Entry): boolean {
  return entry.kind === 'sleep' && !entry.data.nap;
}
