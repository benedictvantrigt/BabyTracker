/// <reference types="node" />
// Test and tooling only: the app itself uses expo-sqlite. Not imported by app code.
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

import type { Db } from './db';

/** Adapts Node's built-in SQLite (in memory, or a file) to the app's Db interface. */
export function nodeDb(path = ':memory:'): Db {
  const db = new DatabaseSync(path);
  return {
    execAsync: async (sql) => {
      db.exec(sql);
    },
    runAsync: async (sql, params) => db.prepare(sql).run(...(params as SQLInputValue[])),
    getFirstAsync: async <T>(sql: string, params: unknown[]) =>
      (db.prepare(sql).get(...(params as SQLInputValue[])) ?? null) as T | null,
    getAllAsync: async <T>(sql: string, params: unknown[]) =>
      db.prepare(sql).all(...(params as SQLInputValue[])) as T[],
    withTransactionAsync: async (task) => {
      db.exec('BEGIN');
      try {
        await task();
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
}
