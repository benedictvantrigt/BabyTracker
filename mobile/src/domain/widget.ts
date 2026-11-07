import { diaperLabel, feedingLabel, lastCompletedSleep, latest, runningEntries } from './entries';
import { nextFeedAt, nextNapAt } from './reminders';
import { scheduleStatus } from './sleep-schedule';
import { formatClock } from './time';
import type { Child, Entry, Settings } from './types';

/** One line of the widget: a headline and a smaller detail. */
export interface WidgetLine {
  title: string;
  detail: string;
}

/**
 * What the home-screen widget shows. A widget is a picture that refreshes only now and
 * then, so it shows clock times ("since 13:05") rather than durations that would go stale.
 */
export interface WidgetSummary {
  childName: string;
  feeding: WidgetLine;
  sleep: WidgetLine;
  diaper: WidgetLine;
  /** Whether the baby is asleep now: the sleep button then stops the sleep. */
  sleeping: boolean;
}

type WidgetChild = Pick<Child, 'name' | 'birthDate' | 'dueDate'>;

export function widgetSummary(
  child: WidgetChild,
  entries: Entry[],
  settings: Settings,
  now: number,
): WidgetSummary {
  const running = runningEntries(entries);
  const runningFeed = running.find((e) => e.kind === 'feeding');
  const runningSleep = running.find((e) => e.kind === 'sleep');

  const lastFeed = latest(entries, 'feeding');
  const feedAt = nextFeedAt(entries, settings);
  const feeding: WidgetLine = runningFeed
    ? {
        title: `Feeding since ${formatClock(runningFeed.start)}`,
        detail: runningFeed.kind === 'feeding' ? feedingLabel(runningFeed.data) : '',
      }
    : lastFeed
      ? {
          title: `Fed ${formatClock(lastFeed.start)}`,
          detail: feedAt ? `${feedingLabel(lastFeed.data)} · next ${formatClock(feedAt)}` : '',
        }
      : { title: 'No feed yet', detail: '' };

  let sleep: WidgetLine;
  if (runningSleep) {
    sleep = { title: `Asleep since ${formatClock(runningSleep.start)}`, detail: '' };
    const schedule = settings.sleepSchedule ? scheduleStatus(entries, child, settings, now) : null;
    if (schedule?.current) sleep.detail = `until ${formatClock(schedule.current.endAt)}`;
  } else {
    const lastSleep = lastCompletedSleep(entries);
    sleep = {
      title: lastSleep?.end != null ? `Awake since ${formatClock(lastSleep.end)}` : 'No sleep yet',
      detail: nextSleepDetail(child, entries, settings, now),
    };
  }

  const lastDiaper = latest(entries, 'diaper');
  const diaper: WidgetLine = lastDiaper
    ? {
        title: `Diaper ${formatClock(lastDiaper.start)}`,
        detail: lastDiaper.kind === 'diaper' ? diaperLabel(lastDiaper.data) : '',
      }
    : { title: 'No diaper yet', detail: '' };

  return { childName: child.name, feeding, sleep, diaper, sleeping: Boolean(runningSleep) };
}

/** "nap 14:00" or "bed 19:00" from the schedule, or the awake-window nap time without it. */
function nextSleepDetail(
  child: WidgetChild,
  entries: Entry[],
  settings: Settings,
  now: number,
): string {
  if (settings.sleepSchedule) {
    const schedule = scheduleStatus(entries, child, settings, now);
    if (schedule) {
      if (schedule.next) return `nap ${formatClock(schedule.next.startAt)}`;
      if (schedule.plan.bedtimeAt > now) return `bed ${formatClock(schedule.plan.bedtimeAt)}`;
      return '';
    }
  }
  const napAt = nextNapAt(entries, settings);
  return napAt ? `nap ${formatClock(napAt)}` : '';
}
