import * as Notifications from 'expo-notifications';
import { AndroidAudioContentType, AndroidAudioUsage, AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';

import { KIND_LABEL, entryTitle } from '@/domain/entries';
import type { Reminder } from '@/domain/reminders';
import { formatClock } from '@/domain/time';
import type { Entry } from '@/domain/types';

const CHANNEL_REMINDERS = 'reminders';
const CHANNEL_ALARMS = 'alarms';
const CHANNEL_TIMERS = 'timers';

const REMINDER_PREFIX = 'reminder-';
const TIMER_PREFIX = 'timer-';

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    // Timer notifications mirror what is already on screen; don't pop them up.
    const isTimer = notification.request.identifier.startsWith(TIMER_PREFIX);
    return {
      shouldShowBanner: !isTimer,
      shouldShowList: true,
      shouldPlaySound: !isTimer,
      shouldSetBadge: false,
    };
  },
});

export async function setupNotificationChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_REMINDERS, {
    name: 'Reminders',
    description: 'Nap and daytime feeding reminders',
    importance: AndroidImportance.HIGH,
  });
  await Notifications.setNotificationChannelAsync(CHANNEL_ALARMS, {
    name: 'Night feeding alarm',
    description: 'Wakes you when a night feed is due',
    importance: AndroidImportance.MAX,
    vibrationPattern: [0, 600, 400, 600, 400, 600],
    bypassDnd: true,
    audioAttributes: {
      usage: AndroidAudioUsage.ALARM,
      contentType: AndroidAudioContentType.SONIFICATION,
    },
  });
  await Notifications.setNotificationChannelAsync(CHANNEL_TIMERS, {
    name: 'Running timers',
    description: 'Ongoing sleep and feeding timers',
    importance: AndroidImportance.LOW,
    sound: null,
  });
}

export interface PermissionState {
  notifications: boolean;
  /** Android 12+: exact alarms need a user-granted permission (denied by default on Android 14+). */
  exactAlarms: boolean;
}

export async function getPermissionState(): Promise<PermissionState> {
  const notifications = (await Notifications.getPermissionsAsync()).granted;
  let exactAlarms = true;
  if (Platform.OS === 'android') {
    exactAlarms = (await Notifications.getExactAlarmPermissionsAsync()).granted;
  }
  return { notifications, exactAlarms };
}

export async function requestNotificationPermission(): Promise<boolean> {
  return (await Notifications.requestPermissionsAsync()).granted;
}

/** Opens the system screen for "Alarms & reminders"; resolves when the user returns. */
export async function requestExactAlarmPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  return (await Notifications.requestExactAlarmPermissionsAsync()).granted;
}

/**
 * Replaces all pending reminders with `reminders` and shows one ongoing
 * notification per running timer. Idempotent; call after every change.
 */
export async function syncNotifications(
  reminders: Reminder[],
  running: Entry[],
  childName: string,
): Promise<void> {
  if (!(await Notifications.getPermissionsAsync()).granted) return;

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => n.identifier.startsWith(REMINDER_PREFIX))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
  for (const r of reminders) {
    await Notifications.scheduleNotificationAsync({
      identifier: REMINDER_PREFIX + r.id,
      content: {
        title: r.title,
        body: r.body,
        priority: r.alarm
          ? Notifications.AndroidNotificationPriority.MAX
          : Notifications.AndroidNotificationPriority.HIGH,
        interruptionLevel: r.alarm ? 'timeSensitive' : 'active',
        data: { reminder: r.id },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: r.fireAt,
        channelId: r.alarm ? CHANNEL_ALARMS : CHANNEL_REMINDERS,
        delivery: r.alarm ? 'alarmClock' : 'bestEffort',
      },
    });
  }

  const runningIds = new Set(running.map((e) => TIMER_PREFIX + e.id));
  const presented = await Notifications.getPresentedNotificationsAsync();
  const presentedIds = new Set(presented.map((n) => n.request.identifier));
  await Promise.all(
    [...presentedIds]
      .filter((id) => id.startsWith(TIMER_PREFIX) && !runningIds.has(id))
      .map((id) => Notifications.dismissNotificationAsync(id)),
  );
  for (const e of running) {
    const identifier = TIMER_PREFIX + e.id;
    if (presentedIds.has(identifier)) continue;
    const what = e.kind === 'sleep' ? `${childName} is asleep` : entryTitle(e);
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: what,
        body: `${KIND_LABEL[e.kind]} timer running since ${formatClock(e.start)}`,
        sticky: true,
        autoDismiss: false,
        sound: false,
        priority: Notifications.AndroidNotificationPriority.LOW,
        data: { entryId: e.id },
      },
      trigger: { channelId: CHANNEL_TIMERS },
    });
  }
}
