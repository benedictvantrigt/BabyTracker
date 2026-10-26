import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useAppData } from '@/data/app-data';

import { refreshNotifications } from './refresh';
import { setupNotificationChannels } from './scheduler';

/** Keeps scheduled reminders and timer notifications in step with the log. Renders nothing. */
export function NotificationSync() {
  const { repo, settings, activeChild } = useAppData();

  useEffect(() => {
    setupNotificationChannels().catch(() => {});
  }, []);

  useEffect(() => {
    if (!activeChild) return;
    let queued: ReturnType<typeof setTimeout> | null = null;

    // Coalesce bursts of writes (e.g. stop + start when switching sides).
    const schedule = () => {
      if (queued) clearTimeout(queued);
      queued = setTimeout(() => {
        queued = null;
        refreshNotifications(repo).catch((e) => console.warn('Notification sync failed', e));
      }, 300);
    };

    schedule();
    const unsubscribe = repo.subscribe(schedule);
    const appState = AppState.addEventListener('change', (s) => s === 'active' && schedule());
    return () => {
      if (queued) clearTimeout(queued);
      unsubscribe();
      appState.remove();
    };
  }, [repo, settings, activeChild]);

  return null;
}
