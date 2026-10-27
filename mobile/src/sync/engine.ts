import type { Repo, SyncChange } from '@/db/repo';

import { RelayClient, RelayError, type RelayDevice } from './client';
import { b64url, open, seal, sha256Hex, unwrapKey, wrapKey, type RandomBytes } from './crypto';
import { encodeInvite } from './invite';

const PUSH_BATCH = 100;

/** Where a phone keeps its sync secrets: the OS keystore in the app, a file in tests. */
export interface SecretStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

const FAMILY_KEY = 'sync.familyKey';
const KEY_EPOCH = 'sync.keyEpoch';
const DEVICE_SECRET = 'sync.deviceSecret';

/** The family key and its epoch; a new epoch starts when a phone is removed. */
export interface FamilyKey {
  key: Uint8Array;
  epoch: number;
}

/** A phone in the family, with its name when it could be read. */
export interface FamilyDevice {
  id: string;
  name: string | null;
  createdAt: number;
  lastSeenAt: number | null;
  thisPhone: boolean;
}

export interface SyncResult {
  pushed: number;
  pulled: number;
}

function isSyncChange(value: unknown): value is SyncChange {
  if (!value || typeof value !== 'object') return false;
  const { type, row } = value as { type?: unknown; row?: Record<string, unknown> };
  if (!row || typeof row.id !== 'string' || typeof row.updatedAt !== 'number') return false;
  if (type === 'child') return typeof row.name === 'string';
  if (type === 'settings') return row.id === 'family' && typeof row.values === 'object';
  if (type === 'entry') {
    return (
      typeof row.childId === 'string' &&
      (row.kind === 'feeding' || row.kind === 'sleep' || row.kind === 'diaper') &&
      typeof row.start === 'number' &&
      typeof row.data === 'object'
    );
  }
  return false;
}

/** A running timer started, stopped or edited: the partner's ongoing notification changes. */
function touchesTimer(body: string): boolean {
  try {
    const change = JSON.parse(body) as SyncChange;
    if (change.type !== 'entry' || change.row.kind === 'diaper') return false;
    // Running, or stopped in the last couple of minutes.
    return change.row.end === null || change.row.updatedAt - change.row.end < 2 * 60_000;
  } catch {
    return false;
  }
}

/**
 * Pushes this phone's outbox to the relay, encrypted with the family key, then pulls and
 * applies everything other phones pushed since the last sync.
 */
export class SyncEngine {
  private running: Promise<SyncResult> | null = null;
  private familyKey: FamilyKey;

  constructor(
    private readonly repo: Repo,
    readonly client: RelayClient,
    familyKey: FamilyKey,
    private readonly deviceSecret: Uint8Array,
    private readonly store: SecretStore,
    private readonly random: RandomBytes,
  ) {
    this.familyKey = familyKey;
  }

  get epoch(): number {
    return this.familyKey.epoch;
  }

  /** One full round; concurrent calls share the round in progress. */
  sync(): Promise<SyncResult> {
    if (!this.running) {
      this.running = this.round().finally(() => {
        this.running = null;
      });
    }
    return this.running;
  }

  private async round(): Promise<SyncResult> {
    let pushed = 0;
    for (;;) {
      const batch = await this.repo.outboxBatch(PUSH_BATCH);
      if (batch.length === 0) break;
      const nudge = batch.some((b) => touchesTimer(b.body)) ? 'high' : 'normal';
      const send = () =>
        this.client.push(
          batch.map((b) => seal(this.familyKey.key, b.body, this.random)),
          this.familyKey.epoch,
          nudge,
        );
      try {
        await send();
      } catch (e) {
        // Another phone rotated the family key: fetch it and seal again.
        if (!(e instanceof RelayError && e.code === 'stale_key')) throw e;
        await this.refreshKey();
        await send();
      }
      await this.repo.ackOutbox(batch[batch.length - 1].id);
      pushed += batch.length;
    }

    let pulled = 0;
    for (;;) {
      const state = await this.repo.getSyncState();
      if (!state) break;
      const { changes, more, epoch } = await this.client.pull(state.lastSeq);
      if (epoch !== undefined && epoch > this.familyKey.epoch) await this.refreshKey();
      if (changes.length === 0) break;
      const decoded: SyncChange[] = [];
      for (const c of changes) {
        if (c.device === this.client.deviceId) continue;
        try {
          const value = JSON.parse(open(this.familyKey.key, c.body));
          if (isSyncChange(value)) decoded.push(value);
        } catch {
          // Not readable with our key (corrupt or foreign); skip rather than block sync.
        }
      }
      pulled += await this.repo.applyRemote(decoded, changes[changes.length - 1].seq);
      if (!more) break;
    }
    return { pushed, pulled };
  }

  /** Fetches the family key another phone rotated to and stores it. */
  private async refreshKey(): Promise<void> {
    const { epoch, wrap } = await this.client.key();
    if (epoch <= this.familyKey.epoch) return;
    if (!wrap || wrap.epoch !== epoch) throw new Error('The new family key is not available.');
    const key = unwrapKey(this.deviceSecret, wrap.from, wrap.body);
    await saveFamilyKey(this.store, { key, epoch });
    this.familyKey = { key, epoch };
  }

  /** The family key, for sealing reminder texts and device names, and opening them. */
  seal(plaintext: string): string {
    return seal(this.familyKey.key, plaintext, this.random);
  }

  open(sealed: string): string {
    return open(this.familyKey.key, sealed);
  }

  /**
   * A single-use invite code (valid 15 minutes) for a partner's phone. The relay drops
   * changes every phone has received, so this phone uploads a snapshot for the new one;
   * the open invite keeps the relay from dropping it before the partner joins.
   */
  async createInvite(): Promise<{ code: string; expiresAt: number }> {
    const state = await this.repo.getSyncState();
    if (!state) throw new Error('Sync is not set up.');
    await this.sync();
    const inviteSecret = randomId(this.random);
    const { expiresAt } = await this.client.createInvite(sha256Hex(inviteSecret));
    await this.repo.enqueueSnapshot();
    await this.sync();
    const code = encodeInvite({
      relayUrl: state.relayUrl,
      familyId: state.familyId,
      familyKey: this.familyKey.key,
      keyEpoch: this.familyKey.epoch,
      inviteSecret,
    });
    return { code, expiresAt };
  }

  /** The family's phones, with the names that could be read. */
  async devices(): Promise<FamilyDevice[]> {
    const { devices } = await this.client.devices();
    return devices.map((d) => ({
      id: d.id,
      name: this.readLabel(d),
      createdAt: d.createdAt,
      lastSeenAt: d.lastSeenAt ?? null,
      thisPhone: d.id === this.client.deviceId,
    }));
  }

  private readLabel(d: RelayDevice): string | null {
    if (!d.label) return null;
    try {
      return this.open(d.label);
    } catch {
      return null;
    }
  }

  /**
   * Removes another phone: a new family key goes to every remaining phone, wrapped so
   * only it can open it, and the relay drops everything sealed with the old key. This
   * phone then uploads a snapshot with the new key. The removed phone keeps what it
   * already had but can read nothing new.
   */
  async removeDevice(deviceId: string): Promise<void> {
    if (deviceId === this.client.deviceId) throw new Error('Use “Stop syncing” for this phone.');
    for (let attempt = 0; ; attempt++) {
      await this.sync();
      const state = await this.repo.getSyncState();
      if (!state) throw new Error('Sync is not set up.');
      const { devices } = await this.client.devices();
      const remaining = devices.filter((d) => d.id !== deviceId);
      const next: FamilyKey = { key: this.random(32), epoch: this.familyKey.epoch + 1 };
      const wraps: Record<string, string> = {};
      const labels: Record<string, string> = {};
      for (const d of remaining) {
        wraps[d.id] = wrapKey(this.deviceSecret, d.id, next.key, this.random);
        const name = this.readLabel(d);
        if (name !== null) labels[d.id] = seal(next.key, name, this.random);
      }
      try {
        await this.client.rotate({
          epoch: next.epoch,
          basis: state.lastSeq,
          remove: [deviceId],
          wraps,
          labels,
        });
      } catch (e) {
        // Someone pushed or rotated in between: catch up and try once more.
        const retry =
          e instanceof RelayError && (e.code === 'not_up_to_date' || e.code === 'stale_key');
        if (!retry || attempt > 0) throw e;
        if (e.code === 'stale_key') await this.refreshKey();
        continue;
      }
      await saveFamilyKey(this.store, next);
      this.familyKey = next;
      await this.repo.enqueueSnapshot();
      await this.sync();
      return;
    }
  }
}

/** Random base64url id; 16 bytes give 22 characters. */
export function randomId(random: RandomBytes, bytes = 16): string {
  return b64url.encode(random(bytes));
}

export async function loadSecrets(
  store: SecretStore,
): Promise<{ familyKey: FamilyKey; deviceSecret: Uint8Array } | null> {
  const [k, e, d] = await Promise.all([
    store.get(FAMILY_KEY),
    store.get(KEY_EPOCH),
    store.get(DEVICE_SECRET),
  ]);
  if (!k || !d) return null;
  return {
    familyKey: { key: b64url.decode(k), epoch: Number(e ?? 0) || 0 },
    deviceSecret: b64url.decode(d),
  };
}

export async function saveSecrets(
  store: SecretStore,
  familyKey: FamilyKey,
  deviceSecret: Uint8Array,
): Promise<void> {
  await saveFamilyKey(store, familyKey);
  await store.set(DEVICE_SECRET, b64url.encode(deviceSecret));
}

async function saveFamilyKey(store: SecretStore, familyKey: FamilyKey): Promise<void> {
  await store.set(FAMILY_KEY, b64url.encode(familyKey.key));
  await store.set(KEY_EPOCH, String(familyKey.epoch));
}

export async function clearSecrets(store: SecretStore): Promise<void> {
  await Promise.all([
    store.delete(FAMILY_KEY),
    store.delete(KEY_EPOCH),
    store.delete(DEVICE_SECRET),
  ]);
}
