import { HStack, Image, type ImageProps, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  font,
  foregroundStyle,
  frame,
  monospacedDigit,
  padding,
} from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity } from 'expo-widgets';

import { formatClock } from '@/domain/time';

import { timerColor, type LiveTimer } from './live-timer-content';
import { errorText, reportLiveTimers, withTimeout } from './timer-report';

/** How long to wait for iOS to update or end a Live Activity. */
const ANSWER_MS = 5000;

type TimerActivityProps = {
  title: string;
  subtitle: string;
  /**
   * The timer's reference time, in milliseconds since the epoch: the start of a running timer
   * (counting up), or the nap time for the awake timer (counting down, then up once passed).
   */
  start: number;
  icon: NonNullable<ImageProps['systemName']>;
  tint: string;
};

const ICON: Record<LiveTimer['kind'], TimerActivityProps['icon']> = {
  feeding: 'waterbottle.fill',
  sleep: 'moon.zzz.fill',
  awake: 'sun.max.fill',
  reflux: 'figure.stand',
};

// Runs inside the widget extension, not the app: it may only use its props and the Expo UI
// components and modifiers, which the extension provides under these names.
const TimerActivity = createLiveActivity<TimerActivityProps>('TimerActivity', (props) => {
  'widget';
  const started = new Date(props.start);
  const timer = (size: number) => (
    <Text
      date={started}
      dateStyle="timer"
      modifiers={[font({ size, weight: 'semibold' }), monospacedDigit()]}
    />
  );
  const icon = (size: number) => <Image systemName={props.icon} size={size} color={props.tint} />;
  return {
    banner: (
      <HStack spacing={12} modifiers={[padding({ all: 16 })]}>
        {icon(28)}
        <VStack alignment="leading" spacing={2}>
          <Text modifiers={[font({ textStyle: 'headline' })]}>{props.title}</Text>
          <Text
            modifiers={[
              font({ textStyle: 'subheadline' }),
              foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
            ]}>
            {props.subtitle}
          </Text>
        </VStack>
        <Spacer />
        {timer(34)}
      </HStack>
    ),
    compactLeading: icon(16),
    compactTrailing: (
      <Text
        date={started}
        dateStyle="timer"
        modifiers={[monospacedDigit(), frame({ width: 56, alignment: 'trailing' })]}
      />
    ),
    minimal: icon(14),
    expandedLeading: (
      <HStack spacing={8}>
        {icon(22)}
        <Text modifiers={[font({ textStyle: 'headline' })]}>{props.title}</Text>
      </HStack>
    ),
    expandedTrailing: timer(28),
    expandedBottom: (
      <Text
        modifiers={[
          font({ textStyle: 'subheadline' }),
          foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
        ]}>
        {props.subtitle}
      </Text>
    ),
  };
});

function propsFor(t: LiveTimer): TimerActivityProps {
  return {
    title: t.title,
    subtitle: t.countdownTo != null ? t.text : `Started ${formatClock(t.start)}`,
    // SwiftUI's timer style counts down to a future date and up from a past one.
    start: t.countdownTo ?? t.start,
    icon: ICON[t.kind],
    tint: timerColor(t.kind),
  };
}

let shown = '';
let problem: string | null = null;

export function liveTimerProblem(): string | null {
  return problem;
}

const listeners = new Set<() => void>();

/** For Settings: the refusal often arrives after the screen drew, as the app comes to the front. */
export function subscribeLiveTimerProblem(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setProblem(next: string | null) {
  if (next === problem) return;
  problem = next;
  listeners.forEach((l) => l());
}

/**
 * Live Activities on the lock screen and in the Dynamic Island, one per running timer and one for
 * the awake timer. The timer text counts on its own, so an activity only changes when a timer
 * starts or stops. Activities
 * are interchangeable: existing ones are updated to the current timers, extra ones end.
 */
export async function syncLiveTimers(timers: LiveTimer[], _channelId: string): Promise<boolean> {
  try {
    const sorted = timers.slice().sort((a, b) => a.start - b.start);
    const wanted = sorted.map(propsFor);
    const activities = TimerActivity.getInstances();
    const signature = JSON.stringify(wanted);
    if (signature === shown && activities.length === wanted.length) {
      reportLiveTimers(
        `${count(wanted.length, 'timer')}, unchanged; iOS shows ${count(activities.length, 'Live Activity')}`,
      );
      return true;
    }

    reportLiveTimers(
      `updating ${count(wanted.length, 'timer')}; iOS had ${count(activities.length, 'Live Activity')}`,
    );
    let replaced = 0;
    for (let i = 0; i < Math.max(activities.length, wanted.length); i++) {
      const activity = activities[i];
      const props = wanted[i];
      // The awake timer goes stale at the end of the day if the app has not removed it.
      const until = sorted[i]?.until;
      const stale = until != null ? new Date(until) : undefined;
      if (activity && props) {
        try {
          const update = activity.update(props, stale);
          await withTimeout(update, ANSWER_MS, 'Updating the Live Activity');
        } catch {
          // One iOS no longer answers for: replace it.
          await withTimeout(activity.end('immediate'), ANSWER_MS, 'Ending').catch(() => {});
          TimerActivity.start(props, undefined, stale);
          replaced++;
        }
      } else if (activity) {
        await withTimeout(activity.end('immediate'), ANSWER_MS, 'Ending the Live Activity');
      } else if (props) {
        TimerActivity.start(props, undefined, stale);
      }
    }
    shown = signature;
    reportLiveTimers(
      `${count(wanted.length, 'timer')}; iOS shows ` +
        count(TimerActivity.getInstances().length, 'Live Activity') +
        (replaced ? `; replaced ${replaced} that did not answer` : ''),
    );
    // Keep a refusal visible after the timer stopped, until one shows.
    if (wanted.length) setProblem(null);
    return true;
  } catch (e) {
    // Live Activities switched off in Settings, or not supported: plain notifications instead.
    shown = '';
    setProblem(errorText(e));
    reportLiveTimers(`iOS refused the Live Activity: ${errorText(e)}`);
    return false;
  }
}

function count(n: number, noun: string): string {
  const plural = noun.endsWith('y') ? `${noun.slice(0, -1)}ies` : `${noun}s`;
  return `${n} ${n === 1 ? noun : plural}`;
}
