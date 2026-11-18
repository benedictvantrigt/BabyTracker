// Background push handling must be defined before the app renders (also headless).
import './src/background/push-task';
import 'expo-router/entry';

import { registerWidgetConfiguration } from './src/widget/widget-configuration';
import { registerWidgetTask } from './src/widget/widget-task';

// Home-screen widget updates and taps (Android), also while the app is closed.
registerWidgetTask();
// The widget's settings screen: when it is added, and from its long-press menu.
registerWidgetConfiguration();
