import type { Repo } from '@/db/repo';

// The repository of the running app, so background code in the same JS runtime (e.g. a
// widget tap while the app is open in the background) writes through it: screens,
// reminders, sync and the widget then refresh as for any other change made in the app.
let appRepo: Repo | null = null;

export function setAppRepo(repo: Repo | null): void {
  appRepo = repo;
}

export function getAppRepo(): Repo | null {
  return appRepo;
}

// The running app's sync round, for the same background code: on Android the app's own
// "sync shortly after a change" timer does not run while the app is in the background, so a
// widget tap runs the round itself.
let appSync: (() => Promise<void>) | null = null;

export function setAppSync(sync: (() => Promise<void>) | null): void {
  appSync = sync;
}

export function getAppSync(): (() => Promise<void>) | null {
  return appSync;
}
