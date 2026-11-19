import { AppState } from 'react-native';

import NightAlarm from '../../modules/night-alarm';

import type { Reminder } from '@/domain/reminders';

/**
 * The E2E simulator build turns the automatic prompt off: it can appear at any moment and
 * would cover the screen the test is driving. Turning the setting on still asks.
 */
const AUTO_PROMPT = process.env.EXPO_PUBLIC_ALARMKIT_AUTO_PROMPT !== '0';

/** Asks for AlarmKit permission now (the Settings switch); true when allowed. */
export async function requestNightAlarms(): Promise<boolean> {
  if (!NightAlarm || !NightAlarm.isAvailable()) return false;
  const state = await NightAlarm.requestAuthorization().catch(() => 'denied' as const);
  return state === 'authorized';
}

/**
 * Whether this iPhone can ring night feeds as AlarmKit alarms (iOS 26+, #7). Asks for
 * permission the first time a night feed alarm is planned, only while the app is open.
 */
export async function nightAlarmsReady(wanted: boolean): Promise<boolean> {
  if (!NightAlarm || !NightAlarm.isAvailable()) return false;
  let state = NightAlarm.authorizationState();
  if (wanted && AUTO_PROMPT && state === 'notDetermined' && AppState.currentState === 'active') {
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
