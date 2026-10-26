import type { Db } from './db';

/**
 * Ordered migrations; index + 1 is the schema version stored in PRAGMA user_version.
 * Never edit a released migration — append a new one.
 */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE children (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    birth_date TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  );
  CREATE TABLE entries (
    id TEXT PRIMARY KEY NOT NULL,
    child_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    start INTEGER NOT NULL,
    "end" INTEGER,
    data TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  );
  CREATE INDEX entries_child_start ON entries (child_id, start);
  CREATE INDEX entries_running ON entries (child_id) WHERE "end" IS NULL AND deleted_at IS NULL;
  CREATE TABLE settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  `,
  `
  CREATE TABLE outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    body TEXT NOT NULL
  );
  CREATE TABLE sync_state (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export async function migrate(db: Db): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version', []);
  const current = row?.user_version ?? 0;
  for (let v = current; v < MIGRATIONS.length; v++) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATIONS[v]);
      await db.execAsync(`PRAGMA user_version = ${v + 1}`);
    });
  }
}
