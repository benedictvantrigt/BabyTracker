import { requireOptionalNativeModule } from 'expo';

interface WidgetRefreshModule {
  /**
   * Redraws the home-screen widgets at these times (milliseconds since the epoch), also with
   * the app closed and the phone in Doze. Replaces the times set before.
   */
  schedule(times: number[]): void;
}

/** Android only; `null` on other platforms or in Expo Go. */
export default requireOptionalNativeModule<WidgetRefreshModule>('WidgetRefresh');
