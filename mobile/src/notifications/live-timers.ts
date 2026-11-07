import type { LiveTimer } from './live-timer-content';

/**
 * Shows each running timer as a live, self-updating timer outside the app and removes the rest.
 * Returns false when the platform cannot, so the caller shows plain notifications instead.
 * Platform versions: `live-timers.android.ts`, `live-timers.ios.tsx`.
 */
export async function syncLiveTimers(_timers: LiveTimer[], _channelId: string): Promise<boolean> {
  return false;
}
