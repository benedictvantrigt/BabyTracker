import { AppState } from 'react-native';

import NightAlarm from '../../modules/night-alarm';

import type { Reminder } from '@/domain/reminders';

/**
 * Whether this iPhone can ring night feeds as AlarmKit alarms (iOS 26+, #7). Asks for
 * permission the first time a night feed alarm is planned, only while the app is open.
 */
export async function nightAlarmsReady(wanted: boolean): Promise<boolean> {
  if (!NightAlarm || !NightAlarm.isAvailable()) return false;
  let state = NightAlarm.authorizationState();
  if (wanted && state === 'notDetermined' && AppState.currentState === 'active') {
    state = await NightAlarm.requestAuthorization().catch(() => 'denied' as const);
  }
  return state === 'authorized';
}

/** Replaces the scheduled night feed alarms; an empty list cancels them. */
export async function scheduleNightAlarms(reminders: Reminder[]): Promise<void> {
  if (!NightAlarm || !NightAlarm.isAvailable()) return;
  await NightAlarm.schedule(
    reminders.map((r) => ({ id: r.id, title: r.title, fireAt: r.fireAt })),
  ).catch(() => 0);
}
