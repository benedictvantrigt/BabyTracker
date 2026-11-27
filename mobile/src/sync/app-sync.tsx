import { getRandomBytes } from 'expo-crypto';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import Constants from 'expo-constants';
import { Alert, AppState, Platform } from 'react-native';

import ReminderKey from '../../modules/reminder-key';

import { useAppData } from '@/data/app-data';
import { setAppSync } from '@/data/app-repo';
import { liveStartToken, subscribeLiveStartToken } from '@/notifications/live-start';

import type { FamilyDevice, SyncEngine } from './engine';
import type { ReminderFilter } from './client';
import { currentTimeZone, publishReminders, reminderFilterFor } from './reminders';
import { secureStore } from './secure-store';
import {
  createFamily,
  deleteFamily,
  endSyncHere,
  isRemovedError,
  joinFamily,
  leaveFamily,
  loadEngine,
  type SyncDeps,
} from './setup';

/** Relay used when starting a family; set at build time (EXPO_PUBLIC_RELAY_URL). */
export const DEFAULT_RELAY_URL = process.env.EXPO_PUBLIC_RELAY_URL ?? '';

const PERIODIC_SYNC_MS = 30_000;
const AFTER_CHANGE_DELAY_MS = 1_500;

export interface SyncStatus {
  enabled: boolean;
  syncing: boolean;
  lastSyncAt: number | null;
  error: string | null;
  /** The sync server delivers this phone's reminders by push. */
  push: boolean;
}

interface SyncContextValue {
  status: SyncStatus;
  syncNow(): Promise<void>;
  createFamily(relayUrl: string): Promise<void>;
  joinFamily(code: string): Promise<void>;
  leaveFamily(): Promise<void>;
  createInvite(): Promise<{ code: string; expiresAt: number }>;
  devices(): Promise<FamilyDevice[]>;
  /** Equal on every phone that trusts the same phones; for the parents to compare. */
  safetyCode(): Promise<string | null>;
  /** Removes another phone and gives the others a new family key. */
  removeDevice(deviceId: string): Promise<void>;
  /** Deletes the family from the sync server; every phone keeps its own log. */
  deleteFamily(): Promise<void>;
}

const SyncContext = createContext<SyncContextValue | null>(null);

/**
 * This phone's push token, or null when the build cannot receive the relay's pushes. Android:
 * the FCM token (null without Firebase config). iPhone: the APNs token, prefixed "apns:", only
 * in builds with the notification service extension that decrypts pushed reminders (#6);
 * without it the iPhone keeps scheduling its reminders itself.
 */
async function devicePushToken(): Promise<string | null> {
  try {
    return relayPushToken(await Notifications.getDevicePushTokenAsync());
  } catch {
    return null;
  }
}

/** The token as the relay takes it, or null when this build cannot receive its pushes. */
export function relayPushToken(token: Notifications.DevicePushToken): string | null {
  if (typeof token.data !== 'string') return null;
  if (token.type === 'android') return token.data;
  if (token.type === 'ios' && iosNotificationService()) return `apns:${token.data}`;
  return null;
}

function iosNotificationService(): boolean {
  return Constants.expoConfig?.extra?.iosNotificationService === true;
}

/** Hands the reminder key to the iOS notification extension; null clears it (#6). */
function shareReminderKey(engine: SyncEngine | null) {
  if (Platform.OS !== 'ios' || !ReminderKey) return;
  try {
    const shared = engine?.reminderKey();
    ReminderKey.set(shared?.familyId ?? null, shared?.key ?? null);
  } catch {
    // The next sync round tries again.
  }
}

/** This phone's name as shown to the other phones (sealed on the sync server). */
function deviceName(): string {
  return Device.deviceName ?? Device.modelName ?? 'Phone';
}

/**
 * Owns this phone's sync engine: syncs shortly after each local change, when the app
 * comes to the foreground and every 30 seconds while it is open. After a round that
 * changed anything it hands the family's reminders to the sync server, which pushes
 * them to every phone when due.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const { repo, settings } = useAppData();
  const deps = useMemo<SyncDeps>(
    () => ({ repo, store: secureStore, random: getRandomBytes }),
    [repo],
  );
  const engine = useRef<SyncEngine | null>(null);
  const [status, setStatus] = useState<SyncStatus>({
    enabled: false,
    syncing: false,
    lastSyncAt: null,
    error: null,
    push: false,
  });
  // Publish reminders after the first round too, e.g. after the rules changed elsewhere.
  const mustPublish = useRef(true);

  const runSync = useCallback(async () => {
    const current = engine.current;
    if (!current) return;
    setStatus((s) => ({ ...s, syncing: true }));
    try {
      const { pushed, pulled } = await current.sync();
      shareReminderKey(current);
      if (pushed > 0 || pulled > 0 || mustPublish.current) {
        mustPublish.current = false;
        await publishReminders(repo, current);
      }
      setStatus((s) => ({ ...s, syncing: false, lastSyncAt: Date.now(), error: null }));
    } catch (e) {
      if (isRemovedError(e) && engine.current === current) {
        // Removed by a partner, or the family was deleted: stop here, keep the log.
        engine.current = null;
        shareReminderKey(null);
        await endSyncHere(deps);
        setStatus({ enabled: false, syncing: false, lastSyncAt: null, error: null, push: false });
        Alert.alert(
          'Sync stopped',
          'This phone is no longer part of the family: it was removed on another phone, or the family was deleted. Everything logged so far stays on this phone.',
        );
        return;
      }
      setStatus((s) => ({
        ...s,
        syncing: false,
        error: e instanceof Error ? e.message : String(e),
      }));
    }
  }, [repo, deps]);

  // For a widget tap while the app is in the background (see widget-task).
  useEffect(() => {
    setAppSync(runSync);
    return () => setAppSync(null);
  }, [runSync]);

  const attach = useCallback(
    (next: SyncEngine | null) => {
      engine.current = next;
      if (!next) shareReminderKey(null);
      mustPublish.current = true;
      setStatus({
        enabled: Boolean(next),
        syncing: false,
        lastSyncAt: null,
        error: null,
        push: false,
      });
      if (next) runSync();
    },
    [runSync],
  );

  // Register this phone for pushes (reminders and "partner changed something" nudges).
  // The relay pushes only the reminders this phone wants (kinds, duty days); the push task
  // checks again. A string, so the registration below reruns only when it changes.
  const remindersHere = settings.napRemindersHere || settings.feedRemindersHere;
  const filterKey = JSON.stringify(reminderFilterFor(settings, currentTimeZone()));
  // What was last sent, so the same registration goes out once. On iOS, fetching the token
  // fires the token listener again: without this the two kept triggering each other and
  // sent hundreds of registrations a second while the app was open.
  const registered = useRef<string | null>(null);
  // iPhone: the Live Activity push-to-start token (#98), so a partner's timer can start here.
  const [startToken, setStartToken] = useState(liveStartToken);
  useEffect(() => subscribeLiveStartToken(setStartToken), []);
  useEffect(() => {
    if (!status.enabled) return;
    let cancelled = false;
    const register = async (known?: string | null) => {
      const current = engine.current;
      if (!current) return;
      const token = known !== undefined ? known : await devicePushToken();
      const key = JSON.stringify([
        current.client.familyId,
        current.client.deviceId,
        token,
        remindersHere,
        filterKey,
        startToken,
      ]);
      if (cancelled || registered.current === key) return;
      registered.current = key;
      try {
        const { push } = await current.client.updateDevice(
          token,
          remindersHere,
          current.sealLabel(deviceName()),
          JSON.parse(filterKey) as ReminderFilter,
          startToken ?? undefined,
        );
        const active = Boolean(token) && push;
        await repo.setPushActive(active);
        if (!cancelled) setStatus((s) => ({ ...s, push: active }));
      } catch {
        // Offline: keep the previous state; the next start retries.
        if (registered.current === key) registered.current = null;
      }
    };
    register();
    const subscription = Notifications.addPushTokenListener((t) => register(relayPushToken(t)));
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [status.enabled, remindersHere, filterKey, startToken, repo]);

  useEffect(() => {
    loadEngine(deps).then(attach, () => attach(null));
  }, [deps, attach]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = repo.subscribe(({ remote }) => {
      if (remote || !engine.current) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(runSync, AFTER_CHANGE_DELAY_MS);
    });
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') runSync();
    }, PERIODIC_SYNC_MS);
    const appState = AppState.addEventListener('change', (s) => s === 'active' && runSync());
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
      clearInterval(interval);
      appState.remove();
    };
  }, [repo, runSync]);

  const value = useMemo<SyncContextValue>(
    () => ({
      status,
      syncNow: async () => {
        await runSync();
        // Also shows what a sync in the background already pulled.
        repo.reread();
      },
      createFamily: async (relayUrl) => attach(await createFamily(deps, relayUrl)),
      joinFamily: async (code) => attach(await joinFamily(deps, code)),
      leaveFamily: async () => {
        await leaveFamily(deps);
        attach(null);
      },
      createInvite: async () => {
        if (!engine.current) throw new Error('Sync is not set up.');
        return engine.current.createInvite();
      },
      devices: async () => (engine.current ? engine.current.devices() : []),
      safetyCode: async () => (engine.current ? engine.current.safetyCode() : null),
      removeDevice: async (deviceId) => {
        if (!engine.current) throw new Error('Sync is not set up.');
        await engine.current.removeDevice(deviceId);
        mustPublish.current = true;
        await runSync();
      },
      deleteFamily: async () => {
        await deleteFamily(deps);
        attach(null);
      },
    }),
    [status, runSync, attach, deps, repo],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used inside SyncProvider');
  return ctx;
}
