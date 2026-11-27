import type { Repo } from '@/db/repo';
import { isNapStart, runningEntries } from '@/domain/entries';
import { sleepTimerAllowed, withoutForgottenSleeps } from '@/domain/night-sleep';
import { DAY } from '@/domain/time';
import { isRepeatTap } from '@/domain/widget';

import type { TimerAction } from './live-timer-content';

/**
 * Carries out the button on a lock-screen timer (#97), made at `now`. Unlike the widget's
 * Sleep / Wake toggle it does only what the button said: a partner may have changed the sleep
 * since the timer was drawn. Returns whether it wrote.
 */
export async function handleTimerAction(
  repo: Repo,
  action: TimerAction,
  now = Date.now(),
): Promise<boolean> {
  const [settings, children] = await Promise.all([repo.getSettings(), repo.listChildren()]);
  const child = children.find((c) => c.id === settings.activeChildId) ?? children[0];
  if (!child) return false;
  const entries = await repo.listEntries(child.id, now - DAY);
  if (isRepeatTap(entries, now)) return false;
  const running = runningEntries(withoutForgottenSleeps(entries, settings, now));
  const sleeping = running.find((e) => e.kind === 'sleep');
  if (action === 'wake') {
    if (!sleeping) return false;
    await repo.stopEntry(sleeping.id, now);
    return true;
  }
  if (action === 'sleep') {
    if (sleeping || !sleepTimerAllowed(settings, now)) return false;
    await repo.startTimer(child.id, 'sleep', { nap: isNapStart(now, settings) }, now);
    return true;
  }
  const feeds = running.filter((e) => e.kind === 'feeding');
  for (const feed of feeds) await repo.stopEntry(feed.id, now);
  return feeds.length > 0;
}
