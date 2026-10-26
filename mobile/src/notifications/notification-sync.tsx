import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useAppData } from '@/data/app-data';
import { runningEntries } from '@/domain/entries';
import { computeReminders } from '@/domain/reminders';
import { DAY } from '@/domain/time';

import { setupNotificationChannels, syncNotifications } from './scheduler';

/** Keeps scheduled reminders and timer notifications in step with the log. Renders nothing. */
export function NotificationSync() {
  const { repo, settings, activeChild } = useAppData();

  useEffect(() => {
    setupNotificationChannels().catch(() => {});
  }, []);

  useEffect(() => {
    if (!activeChild) return;
    let queued: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const sync = async () => {
      const now = Date.now();
      const entries = await repo.listEntries(activeChild.id, now - 2 * DAY);
      if (cancelled) return;
      const reminders = computeReminders(entries, settings, activeChild.name, now);
      await syncNotifications(reminders, runningEntries(entries), activeChild.name);
    };
    // Coalesce bursts of writes (e.g. stop + start when switching sides).
    const schedule = () => {
      if (queued) clearTimeout(queued);
      queued = setTimeout(() => {
        queued = null;
        sync().catch((e) => console.warn('Notification sync failed', e));
      }, 300);
    };

    schedule();
    const unsubscribe = repo.subscribe(schedule);
    const appState = AppState.addEventListener('change', (s) => s === 'active' && schedule());
    return () => {
      cancelled = true;
      if (queued) clearTimeout(queued);
      unsubscribe();
      appState.remove();
    };
  }, [repo, settings, activeChild]);

  return null;
}
