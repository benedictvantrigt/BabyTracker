import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { useAppData } from '@/data/app-data';

import { updateWidgets } from './widget-task';

/** Keeps the home-screen widget in step with the log while the app runs. Renders nothing. */
export function WidgetSync() {
  const { repo } = useAppData();

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    let queued: ReturnType<typeof setTimeout> | null = null;
    // Coalesce bursts of writes, like the notification refresh does.
    const schedule = () => {
      if (queued) clearTimeout(queued);
      queued = setTimeout(() => {
        queued = null;
        updateWidgets(repo).catch((e) => console.warn('Widget update failed', e));
      }, 500);
    };
    schedule();
    const unsubscribe = repo.subscribe(schedule);
    // Leaving the app: the widget shows the latest state on the home screen.
    const appState = AppState.addEventListener('change', (s) => s !== 'active' && schedule());
    return () => {
      if (queued) clearTimeout(queued);
      unsubscribe();
      appState.remove();
    };
  }, [repo]);

  return null;
}
