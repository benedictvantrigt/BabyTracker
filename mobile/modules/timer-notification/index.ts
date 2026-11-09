import { requireOptionalNativeModule } from 'expo';

export interface TimerNotificationInput {
  id: string;
  title: string;
  text: string;
  /** When the timer started, in milliseconds since the epoch. */
  start: number;
  channelId: string;
  /** Accent color, `#RRGGBB`. */
  color?: string;
}

interface TimerNotificationModule {
  /** Does nothing for a timer whose notification the user dismissed. */
  show(timer: TimerNotificationInput): void;
  /** Forgets dismissals of timers that are no longer running. */
  forgetDismissed(runningIds: string[]): void;
  dismiss(id: string): void;
  activeIds(): string[];
}

/** Android only; `null` on other platforms or in Expo Go. */
export default requireOptionalNativeModule<TimerNotificationModule>('TimerNotification');
