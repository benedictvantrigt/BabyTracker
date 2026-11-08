import type { Repo, SyncChange } from '@/db/repo';
import { ENTRY_KINDS, LIVE_TIMER_KINDS } from '@/domain/entries';
import type { EntryKind } from '@/domain/types';

import { RelayClient, RelayError, type RelayDevice } from './client';
import {
  b64url,
  isDeviceId,
  open,
  safetyCode,
  seal,
  sealContext,
  sha256Hex,
  unwrapKey,
  wrapKey,
  type RandomBytes,
} from './crypto';
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
  /**
   * Announced in the encrypted log by a phone of the family. False for a phone only the
   * sync server lists: it never gets the family key from this phone (#41).
   */
  trusted: boolean;
}

/** The sync server handed over a family key from a phone this phone does not trust. */
export class UntrustedKeyError extends Error {
  constructor() {
    super(
      'The sync server offered a new encryption key from a phone that is not in your family. ' +
        'This phone keeps using the current key.',
    );
  }
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
  if (type === 'member') {
    return (
      isDeviceId(row.id) &&
      (row.addedBy === null || isDeviceId(row.addedBy)) &&
      (row.removedAt === null || typeof row.removedAt === 'number')
    );
  }
  if (type === 'entry') {
    return (
      typeof row.childId === 'string' &&
      typeof row.kind === 'string' &&
      ENTRY_KINDS.includes(row.kind as EntryKind) &&
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
    // Only sleep and feeding timers show outside the app.
    if (change.type !== 'entry' || !LIVE_TIMER_KINDS.includes(change.row.kind)) return false;
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

  private changeContext(): string {
    return sealContext.change(this.client.familyId, this.familyKey.epoch);
  }

  /**
   * The phones this phone trusts. A family set up before 0.7 has no list yet: then this
   * phone trusts the phones the relay lists once (trust on first use; compare the safety
   * codes to check) and announces them.
   */
  private async trustedIds(): Promise<Set<string>> {
    let members = await this.repo.listMembers();
    if (members.length === 0) {
      const { devices } = await this.client.devices();
      const ids = new Set([this.client.deviceId, ...devices.map((d) => d.id)]);
      for (const id of ids) if (isDeviceId(id)) await this.repo.addMember(id, null);
      members = await this.repo.listMembers();
    }
    return new Set(members.filter((m) => m.removedAt === null).map((m) => m.id));
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
    await this.trustedIds();
    let pushed = 0;
    for (;;) {
      const batch = await this.repo.outboxBatch(PUSH_BATCH);
      if (batch.length === 0) break;
      const nudge = batch.some((b) => touchesTimer(b.body)) ? 'high' : 'normal';
      const send = () =>
        this.client.push(
          batch.map((b) => seal(this.familyKey.key, b.body, this.random, this.changeContext())),
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
      // This phone's own changes come back too. They are not skipped on the relay's word
      // (`device`); applying them again changes nothing (last write wins).
      const decoded: SyncChange[] = [];
      for (const c of changes) {
        try {
          const value = JSON.parse(
            open(this.familyKey.key, c.body, this.changeContext(), { legacy: true }),
          );
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

  /**
   * Fetches the family key another phone rotated to and stores it. Only a key wrapped by a
   * phone this phone trusts is taken: the relay cannot hand over a key of its own (#41).
   */
  private async refreshKey(): Promise<void> {
    const { epoch, wrap } = await this.client.key();
    if (epoch <= this.familyKey.epoch) return;
    if (!wrap || wrap.epoch !== epoch) throw new Error('The new family key is not available.');
    const trusted = await this.trustedIds();
    if (!trusted.has(wrap.from) || wrap.from === this.client.deviceId) {
      throw new UntrustedKeyError();
    }
    const context = sealContext.wrap(this.client.familyId, epoch, this.client.deviceId);
    const key = unwrapKey(this.deviceSecret, wrap.from, wrap.body, context);
    await saveFamilyKey(this.store, { key, epoch });
    this.familyKey = { key, epoch };
  }

  /** Seals a reminder text with the family key, for the relay to push. */
  sealReminder(plaintext: string): string {
    return seal(this.familyKey.key, plaintext, this.random, this.reminderContext());
  }

  openReminder(sealed: string): string {
    return open(this.familyKey.key, sealed, this.reminderContext(), { legacy: true });
  }

  private reminderContext(): string {
    return sealContext.reminder(this.client.familyId);
  }

  /** Seals a phone's name (this phone's by default) for the relay's device list. */
  sealLabel(name: string, deviceId = this.client.deviceId, key = this.familyKey.key): string {
    return seal(key, name, this.random, sealContext.label(this.client.familyId, deviceId));
  }

  /** Opens a change as pulled from the relay. */
  openChange(sealed: string): string {
    return open(this.familyKey.key, sealed, this.changeContext());
  }

  /** A code to compare with the other phones: equal when they trust the same phones. */
  async safetyCode(): Promise<string> {
    return safetyCode(this.client.familyId, [...(await this.trustedIds())]);
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
      inviterId: this.client.deviceId,
    });
    return { code, expiresAt };
  }

  /** The family's phones, with the names that could be read. */
  async devices(): Promise<FamilyDevice[]> {
    const [{ devices }, trusted] = await Promise.all([this.client.devices(), this.trustedIds()]);
    return devices.map((d) => {
      const isTrusted = trusted.has(d.id);
      return {
        id: d.id,
        name: isTrusted ? this.readLabel(d) : null,
        createdAt: d.createdAt,
        lastSeenAt: d.lastSeenAt ?? null,
        thisPhone: d.id === this.client.deviceId,
        trusted: isTrusted,
      };
    });
  }

  private readLabel(d: RelayDevice): string | null {
    if (!d.label) return null;
    try {
      const context = sealContext.label(this.client.familyId, d.id);
      return open(this.familyKey.key, d.label, context, { legacy: true });
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
      const [{ devices }, trusted] = await Promise.all([
        this.client.devices(),
        this.trustedIds(),
      ]);
      // The new key only goes to phones this phone trusts (#41); phones only the relay
      // lists are removed along with `deviceId`.
      const others = devices.filter((d) => d.id !== deviceId);
      const remaining = others.filter((d) => trusted.has(d.id));
      const untrusted = others.filter((d) => !trusted.has(d.id)).map((d) => d.id);
      const next: FamilyKey = { key: this.random(32), epoch: this.familyKey.epoch + 1 };
      const wraps: Record<string, string> = {};
      const labels: Record<string, string> = {};
      for (const d of remaining) {
        const context = sealContext.wrap(this.client.familyId, next.epoch, d.id);
        wraps[d.id] = wrapKey(this.deviceSecret, d.id, next.key, this.random, context);
        const name = this.readLabel(d);
        if (name !== null) labels[d.id] = this.sealLabel(name, d.id, next.key);
      }
      try {
        await this.client.rotate({
          epoch: next.epoch,
          basis: state.lastSeq,
          remove: [deviceId, ...untrusted],
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
      // Before the snapshot, so it carries the removal under the new key.
      await this.repo.removeMember(deviceId);
      for (const id of untrusted) await this.repo.removeMember(id);
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
