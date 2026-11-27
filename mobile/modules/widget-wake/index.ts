import { requireOptionalNativeModule } from 'expo';

interface WidgetWakeModule {
  /** The widget taps are carried out: the app may be suspended again. */
  release(): void;
  /** Live Activity button taps kept since the last call, oldest first; taking removes them. */
  takeLiveTaps(): { target?: string; at?: number }[];
}

/**
 * Keeps the app running in the background while it carries out a home-screen widget tap
 * (iOS). `null` on Android or in Expo Go.
 */
export default requireOptionalNativeModule<WidgetWakeModule>('WidgetWake');
