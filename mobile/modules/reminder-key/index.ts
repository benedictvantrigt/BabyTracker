import { requireOptionalNativeModule } from 'expo';

interface ReminderKeyModule {
  /** Stores the family key (base64url) for the notification service extension; null clears it. */
  set(familyId: string | null, key: string | null): void;
}

/** iOS only; `null` on Android or in Expo Go. */
export default requireOptionalNativeModule<ReminderKeyModule>('ReminderKey');
