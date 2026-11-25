// The repository for code that also runs without the app's screens: widget taps and pushes
// from the sync server. While the app is running (also in the background) they must write
// through the app's own repository: only its subscribers redraw the screens. A second Repo on
// the same database saves the change, but nobody hears of it, so the Today screen kept
// showing a partner's change as missing until something else reloaded it.
import { randomUUID } from 'expo-crypto';
import { openDatabaseAsync } from 'expo-sqlite';

import { Repo } from '@/db/repo';
import { migrate } from '@/db/schema';

import { getAppRepo } from './app-repo';

let ownRepo: Promise<Repo> | null = null;

/** The app's repository when the app is running, else one opened for background work. */
export async function sharedRepo(): Promise<{ repo: Repo; inApp: boolean }> {
  const app = getAppRepo();
  if (app) return { repo: app, inApp: true };
  ownRepo ??= (async () => {
    const db = await openDatabaseAsync('babytracker.db');
    await migrate(db);
    return new Repo(db, { uuid: randomUUID, now: Date.now });
  })().catch((e) => {
    // Try again next time instead of keeping the failure.
    ownRepo = null;
    throw e;
  });
  return { repo: await ownRepo, inApp: false };
}
