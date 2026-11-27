// The button on a lock-screen timer (#97): Android runs it as a headless JS task from the
// notification's action, iOS from the Live Activity's button (home-widget-sync.ios.ts). Both
// can run while the app is closed or in the background.
import { updateWidgets } from '@/widget/widget-task';
import { afterWidgetWrite, serial, widgetRepo } from '@/widget/widget-actions';

import { isTimerAction } from './live-timer-content';
import { handleTimerAction } from './timer-action-handler';

/** Name of the Android headless task (TimerActionService in modules/timer-notification). */
export const TIMER_ACTION_TASK = 'NapchimeTimerAction';

/**
 * Carries out a timer button tapped at `at`: saves the change, then refreshes the lock-screen
 * timers, the home-screen widgets and syncs to the partner phones. Returns whether it wrote.
 */
export async function runTimerAction(action: unknown, at = Date.now()): Promise<boolean> {
  if (!isTimerAction(action)) return false;
  const { repo, inApp, wrote } = await serial(async () => {
    const { repo, inApp } = await widgetRepo();
    const wrote = await handleTimerAction(repo, action, Math.min(at, Date.now()));
    return { repo, inApp, wrote };
  });
  // Also without a write: the timer may show a state a partner already changed.
  await afterWidgetWrite(repo, inApp).catch(() => {});
  await updateWidgets(repo).catch(() => {});
  return wrote;
}
