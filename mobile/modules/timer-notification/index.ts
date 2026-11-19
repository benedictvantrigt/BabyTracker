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
  /** For a countdown: the time it counts down to, in milliseconds since the epoch. */
  countdownTo?: number;
  /** When the notification removes itself if not updated, in milliseconds since the epoch. */
  until?: number;
}

interface TimerNotificationModule {
  show(timer: TimerNotificationInput): void;
  dismiss(id: string): void;
  activeIds(): string[];
  /** Timer ids the user swiped away; `show` posts nothing for them. */
  dismissedIds(): string[];
  /** Forgets a swiped-away timer once it stopped. */
  forgetDismissed(id: string): void;
  /** Whether Live Updates are allowed (Android 16+); `null` on older Android versions. */
  canPostPromoted(): boolean | null;
  /** Opens the system setting for Live Updates. */
  openPromotedSettings(): void;
}

/** Android only; `null` on other platforms or in Expo Go. */
export default requireOptionalNativeModule<TimerNotificationModule>('TimerNotification');
