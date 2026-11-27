import { formatClock } from '@/domain/time';

/**
 * What happened the last time this phone updated its lock-screen timers, shown in Settings on
 * iPhone (#49): whether iOS took the Live Activity, how many it shows, or why the update failed.
 */
let step: string | null = null;
let live: string | null = null;
let failure: string | null = null;
let report = '';
const listeners = new Set<() => void>();

function emit() {
  report = [step, live, failure].filter(Boolean).join('\n');
  listeners.forEach((l) => l());
}

export function reportLiveTimers(text: string, now = Date.now()): void {
  live = `${formatClock(now)}: ${text}`;
  emit();
}

/** The step the notification update is busy with; null when done. Shows a step that hangs. */
export function reportTimerStep(text: string | null, now = Date.now()): void {
  step = text == null ? null : `${formatClock(now)}: busy with ${text}`;
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

/** Rejects when `promise` has not settled within `ms`: iOS does not always answer. */
export function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${what} did not finish within ${ms / 1000} s`)),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function errorText(e: unknown): string {
  const text = e instanceof Error ? e.message : String(e);
  return text.trim() || 'no reason given';
}
