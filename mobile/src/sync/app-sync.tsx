import { getRandomBytes } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
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
import { AppState } from 'react-native';

import { useAppData } from '@/data/app-data';

import type { SecretStore, SyncEngine } from './engine';
import { createFamily, joinFamily, leaveFamily, loadEngine, type SyncDeps } from './setup';

/** Relay used when starting a family; set at build time (EXPO_PUBLIC_RELAY_URL). */
export const DEFAULT_RELAY_URL = process.env.EXPO_PUBLIC_RELAY_URL ?? '';

const PERIODIC_SYNC_MS = 30_000;
const AFTER_CHANGE_DELAY_MS = 1_500;

const secureStore: SecretStore = {
  get: (key) => SecureStore.getItemAsync(key),
  set: (key, value) => SecureStore.setItemAsync(key, value),
  delete: (key) => SecureStore.deleteItemAsync(key),
};

export interface SyncStatus {
  enabled: boolean;
  syncing: boolean;
  lastSyncAt: number | null;
  error: string | null;
}

interface SyncContextValue {
  status: SyncStatus;
  syncNow(): Promise<void>;
  createFamily(relayUrl: string): Promise<void>;
  joinFamily(code: string): Promise<void>;
  leaveFamily(): Promise<void>;
  createInvite(): Promise<{ code: string; expiresAt: number }>;
  deviceCount(): Promise<number>;
}

const SyncContext = createContext<SyncContextValue | null>(null);

/**
 * Owns this phone's sync engine: syncs shortly after each local change, when the app
 * comes to the foreground and every 30 seconds while it is open.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const { repo } = useAppData();
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
  });

  const runSync = useCallback(async () => {
    const current = engine.current;
    if (!current) return;
    setStatus((s) => ({ ...s, syncing: true }));
    try {
      await current.sync();
      setStatus((s) => ({ ...s, syncing: false, lastSyncAt: Date.now(), error: null }));
    } catch (e) {
      setStatus((s) => ({
        ...s,
        syncing: false,
        error: e instanceof Error ? e.message : String(e),
      }));
    }
  }, []);

  const attach = useCallback(
    (next: SyncEngine | null) => {
      engine.current = next;
      setStatus({ enabled: Boolean(next), syncing: false, lastSyncAt: null, error: null });
      if (next) runSync();
    },
    [runSync],
  );

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
      syncNow: runSync,
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
      deviceCount: async () =>
        engine.current ? (await engine.current.client.devices()).devices.length : 0,
    }),
    [status, runSync, attach, deps],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used inside SyncProvider');
  return ctx;
}
