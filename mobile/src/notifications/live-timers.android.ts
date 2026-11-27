import TimerNotification from '../../modules/timer-notification';

import { TIMER_ACTION_LABEL, timerColor, type LiveTimer } from './live-timer-content';

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
  // A timer the user swiped away stays away until it stops (#51); then its id is forgotten.
  const dismissed = new Set(TimerNotification.dismissedIds?.() ?? []);
  for (const id of dismissed) {
    if (!running.has(id)) TimerNotification.forgetDismissed(id);
  }
  for (const t of timers) {
    if (dismissed.has(t.id)) continue;
    TimerNotification.show({
      id: t.id,
      title: t.title,
      text: t.text,
      start: t.start,
      channelId,
      color: timerColor(t.kind),
      countdownTo: t.countdownTo,
      until: t.until,
      action: t.action,
      actionLabel: t.action && TIMER_ACTION_LABEL[t.action],
    });
  }
  return true;
}

/** Android shows plain notifications when Live Updates are off: see Settings. */
export function liveTimerProblem(): string | null {
  return null;
}

export function subscribeLiveTimerProblem(_listener: () => void): () => void {
  return () => {};
}
