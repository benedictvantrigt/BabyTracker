import type { Repo } from '@/db/repo';

import { RelayClient, RelayError } from './client';
import type { RandomBytes } from './crypto';
import {
  SyncEngine,
  clearSecrets,
  loadSecrets,
  randomId,
  saveSecrets,
  type SecretStore,
} from './engine';
import { decodeInvite } from './invite';

export interface SyncDeps {
  repo: Repo;
  store: SecretStore;
  random: RandomBytes;
  fetch?: typeof fetch;
}

/** The engine for this phone, or null when sync is not set up. */
export async function loadEngine({ repo, store, random, fetch }: SyncDeps) {
  const [state, secrets] = await Promise.all([repo.getSyncState(), loadSecrets(store)]);
  if (state && !secrets) {
    // Restored from a backup: the keystore secrets are not backed up, so this phone has
    // to join again. Stop queueing changes nobody will upload.
    await repo.stopSync();
  }
  if (!state || !secrets) return null;
  const client = new RelayClient(state.relayUrl, state.familyId, secrets.deviceSecret, fetch);
  return new SyncEngine(repo, client, secrets.familyKey, secrets.deviceSecret, store, random);
}

/** Starts sharing from this phone: everything logged so far is uploaded, encrypted. */
export async function createFamily(deps: SyncDeps, relayUrl: string): Promise<SyncEngine> {
  const { repo, store, random } = deps;
  const familyId = randomId(random);
  const familyKey = { key: random(32), epoch: 0 };
  const deviceSecret = random(32);
  const client = new RelayClient(relayUrl, familyId, deviceSecret, deps.fetch);
  await client.createFamily();
  await saveSecrets(store, familyKey, deviceSecret);
  await repo.startSync({ familyId, relayUrl: relayUrl.replace(/\/+$/, ''), lastSeq: 0 }, false);
  const engine = new SyncEngine(repo, client, familyKey, deviceSecret, store, random);
  await engine.sync();
  return engine;
}

/**
 * Joins a partner's family with their invite code. This phone's own log is replaced
 * by the family's.
 */
export async function joinFamily(deps: SyncDeps, code: string): Promise<SyncEngine> {
  const { repo, store, random } = deps;
  const invite = decodeInvite(code);
  const deviceSecret = random(32);
  const client = new RelayClient(invite.relayUrl, invite.familyId, deviceSecret, deps.fetch);
  await client.join(invite.inviteSecret);
  const familyKey = { key: invite.familyKey, epoch: invite.keyEpoch };
  await saveSecrets(store, familyKey, deviceSecret);
  await repo.startSync(
    { familyId: invite.familyId, relayUrl: invite.relayUrl.replace(/\/+$/, ''), lastSeq: 0 },
    true,
  );
  const engine = new SyncEngine(repo, client, familyKey, deviceSecret, store, random);
  await engine.sync();
  return engine;
}

/** Stops syncing on this phone and removes it from the family. The local log stays. */
export async function leaveFamily(deps: SyncDeps): Promise<void> {
  const engine = await loadEngine(deps);
  if (engine) {
    await engine.client.revoke(engine.client.deviceId).catch(() => {});
  }
  await endSyncHere(deps);
}

/**
 * Deletes the family from the sync server: its phones, the encrypted log and reminders.
 * Every phone keeps its own log; the other phones stop syncing when they next connect.
 */
export async function deleteFamily(deps: SyncDeps): Promise<void> {
  const engine = await loadEngine(deps);
  if (engine) await engine.client.deleteFamily();
  await endSyncHere(deps);
}

/** Forgets the family on this phone only, e.g. after it was removed. The log stays. */
export async function endSyncHere(deps: SyncDeps): Promise<void> {
  await deps.repo.stopSync();
  await clearSecrets(deps.store);
}

/** The relay no longer knows this phone: removed by a partner, or the family was deleted. */
export function isRemovedError(e: unknown): boolean {
  return e instanceof RelayError && e.status === 403 && e.code === 'not_a_member';
}
