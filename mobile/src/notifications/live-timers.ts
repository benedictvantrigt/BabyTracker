import type { LiveTimer } from './live-timer-content';

/**
 * Shows each running timer as a live, self-updating timer outside the app and removes the rest.
 * Returns false when the platform cannot, so the caller shows plain notifications instead.
 * Platform versions: `live-timers.android.ts`, `live-timers.ios.tsx`.
 */
export async function syncLiveTimers(_timers: LiveTimer[], _channelId: string): Promise<boolean> {
  return false;
}

/**
 * Why the last attempt to show live timers failed, as the system said it; null when it worked
 * or was not tried. Shown in Settings, so a refusal can be seen and fixed (#49).
 */
export function liveTimerProblem(): string | null {
  return null;
}

export function subscribeLiveTimerProblem(_listener: () => void): () => void {
  return () => {};
}
