import { formatClock } from '@/domain/time';

/**
 * What happened the last time this phone updated its lock-screen timers, shown in Settings on
 * iPhone (#49): whether iOS took the Live Activity, how many it shows, or why the update failed.
 */
let live: string | null = null;
let failure: string | null = null;
let report = '';
const listeners = new Set<() => void>();

function emit() {
  report = [live, failure].filter(Boolean).join('\n');
  listeners.forEach((l) => l());
}

export function reportLiveTimers(text: string, now = Date.now()): void {
  live = `${formatClock(now)}: ${text}`;
  emit();
}

/** A step of the notification update failed; null once it works again. */
export function reportTimerFailure(text: string | null, now = Date.now()): void {
  failure = text == null ? null : `${formatClock(now)}: ${text}`;
  emit();
}

export function timerReport(): string {
  return report;
}

export function subscribeTimerReport(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function errorText(e: unknown): string {
  const text = e instanceof Error ? e.message : String(e);
  return text.trim() || 'no reason given';
}
