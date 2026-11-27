// Background push handling must be defined before the app renders (also headless).
import './src/background/push-task';
import 'expo-router/entry';

import { AppRegistry } from 'react-native';

import { TIMER_ACTION_TASK, runTimerAction } from './src/notifications/timer-action';
import { registerHomeWidget } from './src/widget/home-widget-sync';
import { registerWidgetConfiguration } from './src/widget/widget-configuration';
import { registerWidgetTask } from './src/widget/widget-task';

// Home-screen widget updates and taps (Android), also while the app is closed.
registerWidgetTask();
// The widget's settings screen: when it is added, and from its long-press menu.
registerWidgetConfiguration();
// iPhone home-screen widget: taps it queued, also when one woke the app in the background.
registerHomeWidget();
// The Wake / Sleep / Stop button on a lock-screen timer (Android), also while the app is closed.
AppRegistry.registerHeadlessTask(TIMER_ACTION_TASK, () => async (data: { action?: string }) => {
  await runTimerAction(data?.action);
});
