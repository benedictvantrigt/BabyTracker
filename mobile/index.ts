// Background push handling must be defined before the app renders (also headless).
import './src/background/push-task';
import 'expo-router/entry';

import { registerWidgetTask } from './src/widget/widget-task';

// Home-screen widget updates and taps (Android), also while the app is closed.
registerWidgetTask();
