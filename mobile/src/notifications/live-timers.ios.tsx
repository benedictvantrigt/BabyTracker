import { HStack, Image, type ImageProps, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  font,
  foregroundStyle,
  frame,
  monospacedDigit,
  padding,
} from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity } from 'expo-widgets';

import { Colors } from '@/constants/theme';
import { formatClock } from '@/domain/time';

import type { LiveTimer } from './live-timer-content';

type TimerActivityProps = {
  title: string;
  subtitle: string;
  /** When the timer started, in milliseconds since the epoch. */
  start: number;
  icon: NonNullable<ImageProps['systemName']>;
  tint: string;
};

const ICON: Record<LiveTimer['kind'], TimerActivityProps['icon']> = {
  feeding: 'waterbottle.fill',
  sleep: 'moon.zzz.fill',
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
    subtitle: `Started ${formatClock(t.start)}`,
    start: t.start,
    icon: ICON[t.kind],
    tint: Colors.light[t.kind],
  };
}

let shown = '';

/**
 * Live Activities on the lock screen and in the Dynamic Island, one per running timer. The timer
 * text counts up on its own, so an activity only changes when a timer starts or stops. Activities
 * are interchangeable: existing ones are updated to the current timers, extra ones end.
 */
export async function syncLiveTimers(timers: LiveTimer[], _channelId: string): Promise<boolean> {
  try {
    const wanted = timers
      .slice()
      .sort((a, b) => a.start - b.start)
      .map(propsFor);
    const activities = TimerActivity.getInstances();
    const signature = JSON.stringify(wanted);
    if (signature === shown && activities.length === wanted.length) return true;

    for (let i = 0; i < Math.max(activities.length, wanted.length); i++) {
      const activity = activities[i];
      const props = wanted[i];
      if (activity && props) await activity.update(props);
      else if (activity) await activity.end('immediate');
      else if (props) TimerActivity.start(props);
    }
    shown = signature;
    return true;
  } catch {
    // Live Activities switched off in Settings, or not supported: plain notifications instead.
    shown = '';
    return false;
  }
}
