import { normalizeDashboard } from '@/domain/dashboard';
import { normalizeTags, tagsByUse } from '@/domain/tags';
import { validateEntry } from '@/domain/entries';
import {
  DEFAULT_SETTINGS,
  SHARED_SETTINGS,
  type SharedSettings,
  type Child,
  type Entry,
  type EntryInput,
  type EntryKind,
  type EntryOf,
  type Settings,
} from '@/domain/types';

import type { Db, SqlValue } from './db';

interface EntryRow {
  id: string;
  child_id: string;
  kind: EntryKind;
  start: number;
  end: number | null;
  data: string;
  notes: string;
  tags: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

interface ChildRow {
  id: string;
  name: string;
  birth_date: string | null;
  due_date: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

function toEntry(row: EntryRow): Entry {
  return {
    id: row.id,
    childId: row.child_id,
    kind: row.kind,
    start: row.start,
    end: row.end,
    data: JSON.parse(row.data),
    notes: row.notes,
    tags: normalizeTags(parseJson(row.tags)),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  } as Entry;
}

function toChild(row: ChildRow): Child {
  return {
    id: row.id,
    name: row.name,
    birthDate: row.birth_date,
    dueDate: row.due_date ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

interface MemberRow {
  id: string;
  added_by: string | null;
  updated_at: number;
  removed_at: number | null;
}

/**
 * A phone this phone trusts as part of the family (#41), by device id. The list travels in
 * the encrypted log, so the relay cannot add a phone to it; only the family key's holders
 * can. A removed phone stays removed.
 */
export interface Member {
  id: string;
  /** The phone that invited it; null for the phone that created the family. */
  addedBy: string | null;
  updatedAt: number;
  removedAt: number | null;
}

function toMember(row: MemberRow): Member {
  return {
    id: row.id,
    addedBy: row.added_by,
    updatedAt: row.updated_at,
    removedAt: row.removed_at,
  };
}

const ENTRY_COLUMNS =
  'id, child_id, kind, start, "end", data, notes, tags, created_at, updated_at, deleted_at';

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export class ValidationError extends Error {}

export interface RepoDeps {
  uuid: () => string;
  now: () => number;
}

/** A synced record: the full row, merged on the other phone by last write wins. */
export type SyncChange =
  | { type: 'child'; row: Child }
  | { type: 'entry'; row: Entry }
  | { type: 'member'; row: Member }
  | { type: 'settings'; row: { id: 'family'; updatedAt: number; values: SharedSettings } };

export interface SyncState {
  familyId: string;
  relayUrl: string;
  /** Highest relay sequence number applied locally. */
  lastSeq: number;
  /**
   * The relay delivers this phone's reminders by push (FCM token registered and the relay
   * has push configured), so the phone does not schedule them itself.
   */
  pushActive?: boolean;
}

const SHARED_UPDATED_AT = 'sharedSettingsUpdatedAt';
/** Settings key of the Today-screen layout up to 0.5 (visible card ids in order). */
const LEGACY_DASHBOARD_KEY = 'dashboardCards';

export type ChangeListener = (event: { remote: boolean }) => void;

/**
 * All reads and writes go through here. Writes notify subscribers so screens and
 * the notification scheduler refresh. While sync is set up, every local write also
 * queues the changed row in the outbox for the sync engine.
 */
export class Repo {
  private listeners = new Set<ChangeListener>();

  constructor(
    private readonly db: Db,
    private readonly deps: RepoDeps,
  ) {}

  subscribe(listener: ChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private changed(remote = false): void {
    for (const l of this.listeners) l({ remote });
  }

  // Children

  async listChildren(): Promise<Child[]> {
    const rows = await this.db.getAllAsync<ChildRow>(
      'SELECT * FROM children WHERE deleted_at IS NULL ORDER BY created_at',
      [],
    );
    return rows.map(toChild);
  }

  async addChild(name: string, birthDate: string | null): Promise<Child> {
    const trimmed = name.trim();
    if (!trimmed) throw new ValidationError('Name is required.');
    const now = this.deps.now();
    const child: Child = {
      id: this.deps.uuid(),
      name: trimmed,
      birthDate,
      dueDate: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync(
        'INSERT INTO children (id, name, birth_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        [child.id, child.name, child.birthDate, now, now],
      );
      const settings = await this.getSettings();
      if (!settings.activeChildId) await this.writeSetting('activeChildId', child.id);
      await this.enqueue({ type: 'child', row: child });
    });
    this.changed();
    return child;
  }

  async updateChild(
    id: string,
    fields: Pick<Child, 'name' | 'birthDate' | 'dueDate'>,
  ): Promise<void> {
    const trimmed = fields.name.trim();
    if (!trimmed) throw new ValidationError('Name is required.');
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync(
        'UPDATE children SET name = ?, birth_date = ?, due_date = ?, updated_at = ? WHERE id = ?',
        [trimmed, fields.birthDate, fields.dueDate, this.deps.now(), id],
      );
      await this.enqueueChild(id);
    });
    this.changed();
  }

  // Entries

  /** Entries that started at or after `since`, plus any still running, newest first. */
  async listEntries(childId: string, since: number): Promise<Entry[]> {
    const rows = await this.db.getAllAsync<EntryRow>(
      `SELECT ${ENTRY_COLUMNS} FROM entries
       WHERE child_id = ? AND deleted_at IS NULL AND (start >= ? OR "end" IS NULL)
       ORDER BY start DESC`,
      [childId, since],
    );
    return rows.map(toEntry);
  }

  /** A child's most recent entry of a kind (by start), however long ago. */
  async latestEntry<K extends EntryKind>(childId: string, kind: K): Promise<EntryOf<K> | null> {
    const row = await this.db.getFirstAsync<EntryRow>(
      `SELECT ${ENTRY_COLUMNS} FROM entries
       WHERE child_id = ? AND kind = ? AND deleted_at IS NULL
       ORDER BY start DESC LIMIT 1`,
      [childId, kind],
    );
    return row ? (toEntry(row) as EntryOf<K>) : null;
  }

  /** Tags used on a child's entries, most used first; from the latest 500 tagged entries. */
  async listTags(childId: string): Promise<string[]> {
    const rows = await this.db.getAllAsync<{ tags: string; start: number }>(
      `SELECT tags, start FROM entries
       WHERE child_id = ? AND deleted_at IS NULL AND tags != '[]'
       ORDER BY start DESC LIMIT 500`,
      [childId],
    );
    return tagsByUse(rows.map((r) => ({ start: r.start, tags: normalizeTags(parseJson(r.tags)) })));
  }

  async getEntry(id: string): Promise<Entry | null> {
    const row = await this.db.getFirstAsync<EntryRow>(
      `SELECT ${ENTRY_COLUMNS} FROM entries WHERE id = ?`,
      [id],
    );
    return row ? toEntry(row) : null;
  }

  async addEntry(childId: string, input: EntryInput): Promise<Entry> {
    const now = this.deps.now();
    const error = validateEntry(input, now);
    if (error) throw new ValidationError(error);
    const entry = {
      id: this.deps.uuid(),
      childId,
      kind: input.kind,
      start: input.start,
      end: input.end,
      data: input.data,
      notes: input.notes?.trim() ?? '',
      tags: normalizeTags(input.tags),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    } as Entry;
    await this.db.withTransactionAsync(async () => {
      await this.writeEntryRow(entry);
      await this.enqueue({ type: 'entry', row: entry });
    });
    this.changed();
    return entry;
  }

  async updateEntry(id: string, input: EntryInput): Promise<void> {
    const now = this.deps.now();
    const error = validateEntry(input, now);
    if (error) throw new ValidationError(error);
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync(
        'UPDATE entries SET kind = ?, start = ?, "end" = ?, data = ?, notes = ?, tags = COALESCE(?, tags), updated_at = ? WHERE id = ?',
        [
          input.kind,
          input.start,
          input.end,
          JSON.stringify(input.data),
          input.notes?.trim() ?? '',
          input.tags === undefined ? null : JSON.stringify(normalizeTags(input.tags)),
          now,
          id,
        ],
      );
      await this.enqueueEntry(id);
    });
    this.changed();
  }

  /**
   * Starts a running timer (an entry without end). A running timer of the same kind
   * is stopped first, so switching breast sides is a single tap.
   */
  async startTimer<K extends 'feeding' | 'sleep' | 'tummy'>(
    childId: string,
    kind: K,
    data: EntryInput<K>['data'],
  ): Promise<Entry> {
    const now = this.deps.now();
    const running = await this.db.getAllAsync<{ id: string; start: number }>(
      'SELECT id, start FROM entries WHERE child_id = ? AND kind = ? AND "end" IS NULL AND deleted_at IS NULL',
      [childId, kind],
    );
    for (const r of running) {
      await this.db.withTransactionAsync(async () => {
        await this.db.runAsync('UPDATE entries SET "end" = ?, updated_at = ? WHERE id = ?', [
          Math.max(now, r.start),
          now,
          r.id,
        ]);
        await this.enqueueEntry(r.id);
      });
    }
    return this.addEntry(childId, { kind, start: now, end: null, data } as EntryInput);
  }

  /** Stops a running timer. Returns false if it was not running (e.g. already stopped). */
  async stopEntry(id: string, end?: number): Promise<boolean> {
    const now = this.deps.now();
    const stopAt = end ?? now;
    const entry = await this.getEntry(id);
    if (!entry || entry.end !== null || entry.deletedAt !== null) return false;
    if (stopAt < entry.start) throw new ValidationError('End time is before the start time.');
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync(
        'UPDATE entries SET "end" = ?, updated_at = ? WHERE id = ? AND "end" IS NULL',
        [stopAt, now, id],
      );
      await this.enqueueEntry(id);
    });
    this.changed();
    return true;
  }

  /** Soft delete, so the deletion can sync later. */
  async deleteEntry(id: string): Promise<void> {
    const now = this.deps.now();
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync('UPDATE entries SET deleted_at = ?, updated_at = ? WHERE id = ?', [
        now,
        now,
        id,
      ]);
      await this.enqueueEntry(id);
    });
    this.changed();
  }

  async restoreEntry(id: string): Promise<void> {
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync('UPDATE entries SET deleted_at = NULL, updated_at = ? WHERE id = ?', [
        this.deps.now(),
        id,
      ]);
      await this.enqueueEntry(id);
    });
    this.changed();
  }

  // Settings

  async getSettings(): Promise<Settings> {
    const rows = await this.db.getAllAsync<{ key: string; value: string }>(
      'SELECT key, value FROM settings',
      [],
    );
    const settings: Settings = { ...DEFAULT_SETTINGS };
    let legacyDashboard: unknown;
    for (const { key, value } of rows) {
      if (key in DEFAULT_SETTINGS)
        (settings as unknown as Record<string, unknown>)[key] = JSON.parse(value);
      else if (key === LEGACY_DASHBOARD_KEY) legacyDashboard = JSON.parse(value);
    }
    // Up to 0.5 the layout was `dashboardCards`, the visible cards in order.
    const storedLayout = rows.some((r) => r.key === 'dashboardLayout');
    settings.dashboardLayout = normalizeDashboard(
      storedLayout ? settings.dashboardLayout : (legacyDashboard ?? settings.dashboardLayout),
    );
    return settings;
  }

  async updateSettings(patch: Partial<Settings>): Promise<void> {
    await this.db.withTransactionAsync(async () => {
      for (const [key, value] of Object.entries(patch)) {
        if (key in DEFAULT_SETTINGS && value !== undefined)
          await this.writeSetting(key as keyof Settings, value);
      }
      if (SHARED_SETTINGS.some((k) => k in patch)) {
        const updatedAt = this.deps.now();
        await this.writeRawSetting(SHARED_UPDATED_AT, updatedAt);
        await this.enqueueSharedSettings(updatedAt);
      }
    });
    this.changed();
  }

  private async writeRawSetting(key: string, value: unknown): Promise<void> {
    await this.db.runAsync(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [key, JSON.stringify(value)],
    );
  }

  /** When the shared reminder rules last changed; -1 when never set on this phone. */
  private async sharedUpdatedAt(): Promise<number> {
    const row = await this.db.getFirstAsync<{ value: string }>(
      'SELECT value FROM settings WHERE key = ?',
      [SHARED_UPDATED_AT],
    );
    return row ? JSON.parse(row.value) : -1;
  }

  private async enqueueSharedSettings(updatedAt: number): Promise<void> {
    const settings = await this.getSettings();
    const values = Object.fromEntries(
      SHARED_SETTINGS.map((k) => [k, settings[k]]),
    ) as SharedSettings;
    await this.enqueue({ type: 'settings', row: { id: 'family', updatedAt, values } });
  }

  private async writeSetting(key: keyof Settings, value: unknown): Promise<void> {
    await this.db.runAsync(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [key, JSON.stringify(value)],
    );
  }

  // Sync

  private async writeEntryRow(e: Entry): Promise<void> {
    await this.db.runAsync(
      `INSERT OR REPLACE INTO entries (${ENTRY_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        e.id,
        e.childId,
        e.kind,
        e.start,
        e.end,
        JSON.stringify(e.data),
        e.notes,
        // Rows from versions before tags have none.
        JSON.stringify(normalizeTags(e.tags)),
        e.createdAt,
        e.updatedAt,
        e.deletedAt,
      ] satisfies SqlValue[],
    );
  }

  private async writeChildRow(c: Child): Promise<void> {
    await this.db.runAsync(
      `INSERT OR REPLACE INTO children
         (id, name, birth_date, due_date, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [c.id, c.name, c.birthDate, c.dueDate ?? null, c.createdAt, c.updatedAt, c.deletedAt],
    );
  }

  /** Queues a change for upload; a no-op unless sync is set up. */
  private async enqueue(change: SyncChange): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO outbox (body) SELECT ? WHERE EXISTS (SELECT 1 FROM sync_state WHERE key = 'familyId')`,
      [JSON.stringify(change)],
    );
  }

  private async enqueueEntry(id: string): Promise<void> {
    const row = await this.getEntry(id);
    if (row) await this.enqueue({ type: 'entry', row });
  }

  private async enqueueChild(id: string): Promise<void> {
    const row = await this.db.getFirstAsync<ChildRow>('SELECT * FROM children WHERE id = ?', [id]);
    if (row) await this.enqueue({ type: 'child', row: toChild(row) });
  }

  async getSyncState(): Promise<SyncState | null> {
    const rows = await this.db.getAllAsync<{ key: string; value: string }>(
      'SELECT key, value FROM sync_state',
      [],
    );
    const map = Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)]));
    if (typeof map.familyId !== 'string') return null;
    return {
      familyId: map.familyId,
      relayUrl: map.relayUrl,
      lastSeq: map.lastSeq ?? 0,
      pushActive: map.pushActive === true,
    };
  }

  /** Records whether the relay now delivers this phone's reminders. */
  async setPushActive(active: boolean): Promise<void> {
    const state = await this.getSyncState();
    if (!state || state.pushActive === active) return;
    await this.writeSyncState({ pushActive: active });
    this.changed();
  }

  private async writeSyncState(state: Partial<SyncState>): Promise<void> {
    for (const [key, value] of Object.entries(state)) {
      await this.db.runAsync(
        'INSERT INTO sync_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        [key, JSON.stringify(value)],
      );
    }
  }

  /**
   * Turns sync on. With `replaceLocalData` (joining a partner) this phone's own log is
   * wiped so it mirrors the family; otherwise (creating the family) everything already
   * logged is queued for upload.
   */
  async startSync(
    state: SyncState,
    replaceLocalData: boolean,
    members: Pick<Member, 'id' | 'addedBy'>[] = [],
  ): Promise<void> {
    await this.db.withTransactionAsync(async () => {
      await this.db.execAsync('DELETE FROM outbox; DELETE FROM sync_state; DELETE FROM members;');
      if (replaceLocalData) {
        await this.db.execAsync('DELETE FROM entries; DELETE FROM children;');
        await this.db.runAsync('DELETE FROM settings WHERE key IN (?, ?)', [
          'activeChildId',
          SHARED_UPDATED_AT,
        ]);
      }
      await this.writeSyncState(state);
      for (const m of members) await this.saveMember({ ...m, removedAt: null });
      if (!replaceLocalData) await this.enqueueEverything();
    });
    this.changed(true);
  }

  // Family members (#41)

  async listMembers(): Promise<Member[]> {
    const rows = await this.db.getAllAsync<MemberRow>('SELECT * FROM members ORDER BY id', []);
    return rows.map(toMember);
  }

  /** Trusts `id` from now on and tells the other phones; no change when already known. */
  async addMember(id: string, addedBy: string | null): Promise<void> {
    await this.db.withTransactionAsync(async () => {
      const row = await this.memberRow(id);
      if (!row) await this.saveMember({ id, addedBy, removedAt: null });
    });
  }

  /** Stops trusting `id` for good and tells the other phones. */
  async removeMember(id: string): Promise<void> {
    await this.db.withTransactionAsync(async () => {
      const row = await this.memberRow(id);
      if (row?.removed_at != null) return;
      await this.saveMember({ id, addedBy: row?.added_by ?? null, removedAt: this.deps.now() });
    });
  }

  private memberRow(id: string): Promise<MemberRow | null> {
    return this.db.getFirstAsync<MemberRow>('SELECT * FROM members WHERE id = ?', [id]);
  }

  private async saveMember(m: Pick<Member, 'id' | 'addedBy' | 'removedAt'>): Promise<void> {
    const member: Member = { ...m, updatedAt: this.deps.now() };
    await this.writeMemberRow(member);
    await this.enqueue({ type: 'member', row: member });
  }

  private async writeMemberRow(m: Member): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO members (id, added_by, updated_at, removed_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET added_by = excluded.added_by,
         updated_at = excluded.updated_at, removed_at = excluded.removed_at`,
      [m.id, m.addedBy, m.updatedAt, m.removedAt],
    );
  }

  /**
   * Queues every child, entry (deleted ones too) and the shared settings for upload: a
   * snapshot for phones that join after the relay dropped older changes, or after a new
   * family key. Rows keep their `updatedAt`, so phones that have them ignore the copies.
   */
  async enqueueSnapshot(): Promise<void> {
    await this.db.withTransactionAsync(() => this.enqueueEverything());
  }

  private async enqueueEverything(): Promise<void> {
    const children = await this.db.getAllAsync<ChildRow>('SELECT * FROM children', []);
    for (const c of children) await this.enqueue({ type: 'child', row: toChild(c) });
    const entries = await this.db.getAllAsync<EntryRow>(
      `SELECT ${ENTRY_COLUMNS} FROM entries ORDER BY start`,
      [],
    );
    for (const e of entries) await this.enqueue({ type: 'entry', row: toEntry(e) });
    await this.enqueueSharedSettings(Math.max(0, await this.sharedUpdatedAt()));
    for (const m of await this.listMembers()) await this.enqueue({ type: 'member', row: m });
  }

  /** Turns sync off on this phone; the local log stays. */
  async stopSync(): Promise<void> {
    await this.db.execAsync('DELETE FROM outbox; DELETE FROM sync_state; DELETE FROM members;');
    this.changed();
  }

  async outboxBatch(limit: number): Promise<{ id: number; body: string }[]> {
    return this.db.getAllAsync('SELECT id, body FROM outbox ORDER BY id LIMIT ?', [limit]);
  }

  async outboxSize(): Promise<number> {
    const row = await this.db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM outbox', []);
    return row?.n ?? 0;
  }

  async ackOutbox(upToId: number): Promise<void> {
    await this.db.runAsync('DELETE FROM outbox WHERE id <= ?', [upToId]);
  }

  /**
   * Applies changes from the relay: per row, the most recent `updatedAt` wins, with a
   * deterministic tie-break so both phones settle on the same row.
   */
  async applyRemote(changes: SyncChange[], lastSeq: number): Promise<number> {
    let applied = 0;
    await this.db.withTransactionAsync(async () => {
      for (const change of changes) {
        if (change.type === 'entry') {
          const current = await this.getEntry(change.row.id);
          if (wins(change.row, current)) {
            await this.writeEntryRow(change.row);
            applied += 1;
          }
        } else if (change.type === 'child') {
          const row = await this.db.getFirstAsync<ChildRow>('SELECT * FROM children WHERE id = ?', [
            change.row.id,
          ]);
          if (wins(change.row, row ? toChild(row) : null)) {
            await this.writeChildRow(change.row);
            applied += 1;
          }
        } else if (change.type === 'member') {
              const row = await this.memberRow(change.row.id);
          const current = row ? toMember(row) : null;
          // Removal is final: a copy from before it never brings the phone back.
          if (current?.removedAt != null) continue;
          if (change.row.removedAt != null || wins(change.row, current)) {
            await this.writeMemberRow(change.row);
            applied += 1;
          }
        } else if (change.row.updatedAt > (await this.sharedUpdatedAt())) {
          for (const key of SHARED_SETTINGS) {
            const value = change.row.values[key];
            if (typeof value === typeof DEFAULT_SETTINGS[key]) await this.writeSetting(key, value);
          }
          await this.writeRawSetting(SHARED_UPDATED_AT, change.row.updatedAt);
          applied += 1;
        }
      }
      await this.writeSyncState({ lastSeq });
    });
    if (applied > 0) this.changed(true);
    return applied;
  }
}

function wins(incoming: { updatedAt: number }, current: { updatedAt: number } | null): boolean {
  if (!current) return true;
  if (incoming.updatedAt !== current.updatedAt) return incoming.updatedAt > current.updatedAt;
  return JSON.stringify(incoming) > JSON.stringify(current);
}
