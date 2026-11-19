import { requireOptionalNativeModule } from 'expo';

export type AlarmAuthorization = 'authorized' | 'denied' | 'notDetermined' | 'unavailable';

export interface NightAlarmInput {
  id: string;
  title: string;
  /** When it rings, in milliseconds since the epoch. */
  fireAt: number;
}

interface NightAlarmModule {
  /** Whether AlarmKit exists on this iPhone (iOS 26+). */
  isAvailable(): boolean;
  authorizationState(): AlarmAuthorization;
  requestAuthorization(): Promise<AlarmAuthorization>;
  /** Replaces the alarms this module scheduled; returns how many were scheduled. */
  schedule(alarms: NightAlarmInput[]): Promise<number>;
  setHandlesNightFeeds(value: boolean): void;
}

/** iOS only; `null` on Android or in Expo Go. */
export default requireOptionalNativeModule<NightAlarmModule>('NightAlarm');
