import TimerNotification from '../../modules/timer-notification';

import { Colors } from '@/constants/theme';

import type { LiveTimer } from './live-timer-content';

/**
 * Ongoing notifications with a chronometer that counts up (running timers) or down to the next
 * nap (awake timer); Live Updates on Android 16+.
 */
export async function syncLiveTimers(timers: LiveTimer[], channelId: string): Promise<boolean> {
  if (!TimerNotification) return false;
  const running = new Set(timers.map((t) => t.id));
  for (const id of TimerNotification.activeIds()) {
    if (!running.has(id)) TimerNotification.dismiss(id);
  }
  for (const t of timers) {
    TimerNotification.show({
      id: t.id,
      title: t.title,
      text: t.text,
      start: t.start,
      channelId,
      color: Colors.light[t.kind === 'awake' ? 'sleep' : t.kind],
      countdownTo: t.countdownTo,
      until: t.until,
    });
  }
  return true;
}
