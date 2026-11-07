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
  show(timer: TimerNotificationInput): void;
  dismiss(id: string): void;
  activeIds(): string[];
}

/** Android only; `null` on other platforms or in Expo Go. */
export default requireOptionalNativeModule<TimerNotificationModule>('TimerNotification');
