import { randomUUID } from 'expo-crypto';
import { useSQLiteContext } from 'expo-sqlite';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { setAppRepo } from '@/data/app-repo';
import { Repo } from '@/db/repo';
import {
  DEFAULT_SETTINGS,
  type Child,
  type Entry,
  type EntryKind,
  type EntryOf,
  type Settings,
} from '@/domain/types';

interface AppData {
  repo: Repo;
  settings: Settings;
  children: Child[];
  activeChild: Child | null;
  loaded: boolean;
}

const AppDataContext = createContext<AppData | null>(null);

export function AppDataProvider({ children: content }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const repo = useMemo(() => new Repo(db, { uuid: randomUUID, now: Date.now }), [db]);
  useEffect(() => {
    setAppRepo(repo);
    return () => setAppRepo(null);
  }, [repo]);
  const [state, setState] = useState<{ settings: Settings; children: Child[]; loaded: boolean }>({
    settings: DEFAULT_SETTINGS,
    children: [],
    loaded: false,
  });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [settings, children] = await Promise.all([repo.getSettings(), repo.listChildren()]);
      if (!cancelled) setState({ settings, children, loaded: true });
    };
    load();
    const unsubscribe = repo.subscribe(load);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [repo]);

  const value = useMemo<AppData>(() => {
    const activeChild =
      state.children.find((c) => c.id === state.settings.activeChildId) ??
      state.children[0] ??
      null;
    return { repo, ...state, activeChild };
  }, [repo, state]);

  return <AppDataContext.Provider value={value}>{content}</AppDataContext.Provider>;
}

export function useAppData(): AppData {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error('useAppData must be used inside AppDataProvider');
  return ctx;
}

/** Entries for the child since `since` (plus running timers), refreshed on every change. */
export function useEntries(
  childId: string | undefined,
  since: number,
): { entries: Entry[]; loaded: boolean } {
  const { repo } = useAppData();
  const [state, setState] = useState<{ entries: Entry[]; loaded: boolean }>({
    entries: [],
    loaded: false,
  });

  useEffect(() => {
    if (!childId) return;
    let cancelled = false;
    const load = async () => {
      const entries = await repo.listEntries(childId, since);
      if (!cancelled) setState({ entries, loaded: true });
    };
    load();
    const unsubscribe = repo.subscribe(load);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [repo, childId, since]);

  return state;
}

/** Current time, re-rendering every `intervalMs`. */
/** A child's most recent entry of a kind, however long ago; follows changes. */
export function useLatestEntry<K extends EntryKind>(
  childId: string | undefined,
  kind: K,
): EntryOf<K> | null {
  const { repo } = useAppData();
  const [entry, setEntry] = useState<EntryOf<K> | null>(null);

  useEffect(() => {
    if (!childId) return;
    let cancelled = false;
    const load = async () => {
      const latest = await repo.latestEntry(childId, kind);
      if (!cancelled) setEntry(latest);
    };
    load();
    const unsubscribe = repo.subscribe(load);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [repo, childId, kind]);

  return entry;
}

export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Runs an async action, reporting failures through `onError` instead of throwing. */
export function useAction(onError: (message: string) => void) {
  return useCallback(
    async (action: () => Promise<unknown>) => {
      try {
        await action();
        return true;
      } catch (e) {
        onError(e instanceof Error ? e.message : String(e));
        return false;
      }
    },
    [onError],
  );
}
