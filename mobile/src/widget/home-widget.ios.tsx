// The iPhone home-screen widget (#16). It runs in the widget extension, not the app: the
// function may only use its props, its environment and the Expo UI components and modifiers,
// nothing else from this file or the app (expo-widgets bundles it on its own).
//
// Sleep, Wet and Solid queue a tap in the widget's props and redraw at once. The tap's intent
// runs in the app's process (patched in scripts/patch-expo-widgets.js), which wakes the app in
// the background to write the entry and sync it: see home-widget-sync.ios.ts. Feed opens the
// feeding screen, like on Android.
import { Button, HStack, Link, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  buttonStyle,
  containerBackground,
  controlSize,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  monospacedDigit,
  padding,
  tint,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

import type { HomeWidgetConfig, HomeWidgetProps, HomeWidgetTarget } from './home-widget-props';

type Row = 'feeding' | 'sleep' | 'diaper';

const HomeWidget = (props: HomeWidgetProps, environment: WidgetEnvironment<HomeWidgetConfig>) => {
  'widget';
  // No timeline yet (the widget gallery, or the app has not run since it was installed).
  if (!props || !props.light || !props.dark) {
    const dark = environment.colorScheme === 'dark';
    return (
      <Text
        modifiers={[
          font({ size: 14 }),
          foregroundStyle(dark ? '#B8B8C0' : '#5C5C66'),
          containerBackground(dark ? '#1C1B22' : '#FFFFFF', 'widget'),
        ]}>
        Open Napchime to set up the widget
      </Text>
    );
  }
  const c = environment.colorScheme === 'dark' ? props.dark : props.light;
  const background = containerBackground(c.background, 'widget');

  if (!props.childName) {
    return (
      <Text modifiers={[font({ size: 14 }), foregroundStyle(c.secondary), background]}>
        Open Napchime to add your baby
      </Text>
    );
  }

  const config: HomeWidgetConfig = environment.configuration ?? {};
  const all: Row[] = ['feeding', 'sleep', 'diaper'];
  const chosen = all.filter((r) => config[r] !== false);
  const rows = chosen.length ? chosen : all;
  const small = environment.widgetFamily === 'systemSmall';
  const large = environment.widgetFamily === 'systemLarge';

  // A tap: queue it for the app and show the result straight away.
  const press = (target: HomeWidgetTarget, label: string) => () => ({
    taps: [
      ...(props.taps ?? []),
      { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, target, at: Date.now() },
    ],
    sleeping: target === 'sleep' ? !props.sleeping : props.sleeping,
    // Not null: the props go back into UserDefaults, which drops anything with a null.
    confirmed: target === 'sleep' ? '' : label,
  });

  const label = (text: string, fill: boolean) => (
    <Text
      modifiers={[
        font({ size: fill ? 15 : 13, weight: 'semibold' }),
        lineLimit(1),
        ...(fill ? [frame({ maxWidth: 1000, maxHeight: 1000 })] : []),
      ]}>
      {text}
    </Text>
  );

  const button = (row: Row, text: string, target: HomeWidgetTarget | null, fill: boolean) => {
    const done = props.confirmed === text;
    const modifiers = [
      buttonStyle(done ? 'borderedProminent' : 'bordered'),
      tint(c[row]),
      controlSize(fill ? 'large' : 'small'),
    ];
    if (target === null) {
      return (
        <Link key={text} destination={props.feedingUri} modifiers={modifiers}>
          {label(text, fill)}
        </Link>
      );
    }
    return (
      <Button key={text} target={target} onPress={press(target, text)} modifiers={modifiers}>
        {label(done ? `✓ ${text}` : text, fill)}
      </Button>
    );
  };

  const buttons = (row: Row, fill: boolean) => {
    switch (row) {
      case 'feeding':
        return [button(row, 'Feed', null, fill)];
      case 'sleep':
        return [button(row, props.sleeping ? 'Wake' : 'Sleep', 'sleep', fill)];
      case 'diaper':
        return [button(row, 'Wet', 'wet', fill), button(row, 'Solid', 'solid', fill)];
    }
  };

  // Small: buttons only. Links don't work in a small widget, so Feed is left out there,
  // unless it is the only row: then the whole widget opens the feeding screen.
  if (small) {
    const smallRows = rows.filter((r) => r !== 'feeding');
    if (!smallRows.length) {
      return (
        <VStack modifiers={[widgetURL(props.feedingUri), background]}>
          <Text modifiers={[font({ size: 22, weight: 'semibold' }), foregroundStyle(c.feeding)]}>
            Feed
          </Text>
          <Text modifiers={[font({ size: 12 }), foregroundStyle(c.secondary), lineLimit(2)]}>
            {props.feeding.title}
          </Text>
        </VStack>
      );
    }
    return (
      <VStack spacing={6} modifiers={[background]}>
        {smallRows.map((row) => (
          <HStack key={row} spacing={6}>
            {buttons(row, true)}
          </HStack>
        ))}
      </VStack>
    );
  }

  if (config.showInfo === false) {
    return (
      <VStack spacing={8} modifiers={[background]}>
        {rows.map((row) => (
          <HStack key={row} spacing={8}>
            {buttons(row, true)}
          </HStack>
        ))}
      </VStack>
    );
  }

  const info = (row: Row) => {
    const line = props[row];
    const title = [
      <Text
        key="title"
        modifiers={[font({ size: 14, weight: 'semibold' }), foregroundStyle(c[row]), lineLimit(1)]}>
        {line.title}
      </Text>,
    ];
    if (line.since != null) {
      // Counts up by itself, also when the app is not running.
      title.push(
        <Text
          key="timer"
          date={new Date(line.since)}
          dateStyle="timer"
          modifiers={[
            font({ size: 14, weight: 'semibold' }),
            monospacedDigit(),
            foregroundStyle(c[row]),
            frame({ width: 60, alignment: 'leading' }),
          ]}
        />,
      );
    }
    const lines = [
      <HStack key="title" spacing={6}>
        {title}
      </HStack>,
    ];
    if (line.detail) {
      lines.push(
        <Text
          key="detail"
          modifiers={[font({ size: 12 }), foregroundStyle(c.secondary), lineLimit(1)]}>
          {line.detail}
        </Text>,
      );
    }
    return (
      <VStack alignment="leading" spacing={1}>
        {lines}
      </VStack>
    );
  };

  const content = rows.map((row) => (
    <HStack key={row} spacing={8}>
      {info(row)}
      <Spacer />
      {buttons(row, false)}
    </HStack>
  ));
  if (large) {
    content.unshift(
      <Text key="name" modifiers={[font({ size: 17, weight: 'bold' }), padding({ bottom: 4 })]}>
        {props.childName}
      </Text>,
    );
  }
  return (
    <VStack alignment="leading" spacing={large ? 14 : 8} modifiers={[background]}>
      {content}
    </VStack>
  );
};

export default createWidget<HomeWidgetProps, HomeWidgetConfig>('Summary', HomeWidget);
