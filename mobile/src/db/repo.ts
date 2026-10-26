import { validateEntry } from '@/domain/entries';
import {
  DEFAULT_SETTINGS,
  type Child,
  type Entry,
  type EntryInput,
  type EntryKind,
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
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

interface ChildRow {
  id: string;
  name: string;
  birth_date: string | null;
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

const ENTRY_COLUMNS =
  'id, child_id, kind, start, "end", data, notes, created_at, updated_at, deleted_at';

export class ValidationError extends Error {}

export interface RepoDeps {
  uuid: () => string;
  now: () => number;
}

/**
 * All reads and writes go through here. Writes notify subscribers so screens and
 * the notification scheduler refresh; Phase 2 sync will hook in at the same place.
 */
export class Repo {
  private listeners = new Set<() => void>();

  constructor(
    private readonly db: Db,
    private readonly deps: RepoDeps,
  ) {}

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private changed(): void {
    for (const l of this.listeners) l();
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
    });
    this.changed();
    return child;
  }

  async updateChild(id: string, name: string, birthDate: string | null): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) throw new ValidationError('Name is required.');
    await this.db.runAsync(
      'UPDATE children SET name = ?, birth_date = ?, updated_at = ? WHERE id = ?',
      [trimmed, birthDate, this.deps.now(), id],
    );
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
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    } as Entry;
    await this.db.runAsync(
      `INSERT INTO entries (${ENTRY_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.id,
        entry.childId,
        entry.kind,
        entry.start,
        entry.end,
        JSON.stringify(entry.data),
        entry.notes,
        now,
        now,
        null,
      ] satisfies SqlValue[],
    );
    this.changed();
    return entry;
  }

  async updateEntry(id: string, input: EntryInput): Promise<void> {
    const now = this.deps.now();
    const error = validateEntry(input, now);
    if (error) throw new ValidationError(error);
    await this.db.runAsync(
      'UPDATE entries SET kind = ?, start = ?, "end" = ?, data = ?, notes = ?, updated_at = ? WHERE id = ?',
      [
        input.kind,
        input.start,
        input.end,
        JSON.stringify(input.data),
        input.notes?.trim() ?? '',
        now,
        id,
      ],
    );
    this.changed();
  }

  /**
   * Starts a running timer (an entry without end). A running timer of the same kind
   * is stopped first, so switching breast sides is a single tap.
   */
  async startTimer<K extends 'feeding' | 'sleep'>(
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
      await this.db.runAsync('UPDATE entries SET "end" = ?, updated_at = ? WHERE id = ?', [
        Math.max(now, r.start),
        now,
        r.id,
      ]);
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
    await this.db.runAsync(
      'UPDATE entries SET "end" = ?, updated_at = ? WHERE id = ? AND "end" IS NULL',
      [stopAt, now, id],
    );
    this.changed();
    return true;
  }

  /** Soft delete, so the deletion can sync later. */
  async deleteEntry(id: string): Promise<void> {
    const now = this.deps.now();
    await this.db.runAsync('UPDATE entries SET deleted_at = ?, updated_at = ? WHERE id = ?', [
      now,
      now,
      id,
    ]);
    this.changed();
  }

  async restoreEntry(id: string): Promise<void> {
    await this.db.runAsync('UPDATE entries SET deleted_at = NULL, updated_at = ? WHERE id = ?', [
      this.deps.now(),
      id,
    ]);
    this.changed();
  }

  // Settings

  async getSettings(): Promise<Settings> {
    const rows = await this.db.getAllAsync<{ key: string; value: string }>(
      'SELECT key, value FROM settings',
      [],
    );
    const settings: Settings = { ...DEFAULT_SETTINGS };
    for (const { key, value } of rows) {
      if (key in DEFAULT_SETTINGS)
        (settings as unknown as Record<string, unknown>)[key] = JSON.parse(value);
    }
    return settings;
  }

  async updateSettings(patch: Partial<Settings>): Promise<void> {
    await this.db.withTransactionAsync(async () => {
      for (const [key, value] of Object.entries(patch)) {
        if (key in DEFAULT_SETTINGS && value !== undefined)
          await this.writeSetting(key as keyof Settings, value);
      }
    });
    this.changed();
  }

  private async writeSetting(key: keyof Settings, value: unknown): Promise<void> {
    await this.db.runAsync(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [key, JSON.stringify(value)],
    );
  }
}
