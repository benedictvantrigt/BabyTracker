import type { Repo, SyncChange } from '@/db/repo';

import { RelayClient } from './client';
import { b64url, open, seal, sha256Hex, type RandomBytes } from './crypto';
import { encodeInvite } from './invite';

const PUSH_BATCH = 100;

/** Where a phone keeps its sync secrets: the OS keystore in the app, a file in tests. */
export interface SecretStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

const FAMILY_KEY = 'sync.familyKey';
const DEVICE_SECRET = 'sync.deviceSecret';

export interface SyncResult {
  pushed: number;
  pulled: number;
}

function isSyncChange(value: unknown): value is SyncChange {
  if (!value || typeof value !== 'object') return false;
  const { type, row } = value as { type?: unknown; row?: Record<string, unknown> };
  if (!row || typeof row.id !== 'string' || typeof row.updatedAt !== 'number') return false;
  if (type === 'child') return typeof row.name === 'string';
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

/**
 * Pushes this phone's outbox to the relay, encrypted with the family key, then pulls and
 * applies everything other phones pushed since the last sync.
 */
export class SyncEngine {
  private running: Promise<SyncResult> | null = null;

  constructor(
    private readonly repo: Repo,
    readonly client: RelayClient,
    private readonly familyKey: Uint8Array,
    private readonly random: RandomBytes,
  ) {}

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
      await this.client.push(batch.map((b) => seal(this.familyKey, b.body, this.random)));
      await this.repo.ackOutbox(batch[batch.length - 1].id);
      pushed += batch.length;
    }

    let pulled = 0;
    for (;;) {
      const state = await this.repo.getSyncState();
      if (!state) break;
      const { changes, more } = await this.client.pull(state.lastSeq);
      if (changes.length === 0) break;
      const decoded: SyncChange[] = [];
      for (const c of changes) {
        if (c.device === this.client.deviceId) continue;
        try {
          const value = JSON.parse(open(this.familyKey, c.body));
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

  /** A single-use invite code (valid 15 minutes) for a partner's phone. */
  async createInvite(): Promise<{ code: string; expiresAt: number }> {
    const state = await this.repo.getSyncState();
    if (!state) throw new Error('Sync is not set up.');
    const inviteSecret = randomId(this.random);
    const { expiresAt } = await this.client.createInvite(sha256Hex(inviteSecret));
    const code = encodeInvite({
      relayUrl: state.relayUrl,
      familyId: state.familyId,
      familyKey: this.familyKey,
      inviteSecret,
    });
    return { code, expiresAt };
  }
}

/** Random base64url id; 16 bytes give 22 characters. */
export function randomId(random: RandomBytes, bytes = 16): string {
  return b64url.encode(random(bytes));
}

export async function loadSecrets(
  store: SecretStore,
): Promise<{ familyKey: Uint8Array; deviceSecret: Uint8Array } | null> {
  const [k, d] = await Promise.all([store.get(FAMILY_KEY), store.get(DEVICE_SECRET)]);
  if (!k || !d) return null;
  return { familyKey: b64url.decode(k), deviceSecret: b64url.decode(d) };
}

export async function saveSecrets(
  store: SecretStore,
  familyKey: Uint8Array,
  deviceSecret: Uint8Array,
): Promise<void> {
  await store.set(FAMILY_KEY, b64url.encode(familyKey));
  await store.set(DEVICE_SECRET, b64url.encode(deviceSecret));
}

export async function clearSecrets(store: SecretStore): Promise<void> {
  await Promise.all([store.delete(FAMILY_KEY), store.delete(DEVICE_SECRET)]);
}
