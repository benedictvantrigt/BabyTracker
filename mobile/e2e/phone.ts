/// <reference types="node" />
// A simulated phone for sync tests: the app's Repo and sync code on Node's SQLite.
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { nodeDb } from '../src/db/node-db';
import { Repo } from '../src/db/repo';
import { migrate } from '../src/db/schema';
import type { SecretStore } from '../src/sync/engine';
import type { SyncDeps } from '../src/sync/setup';

export const random = (n: number) => new Uint8Array(randomBytes(n));

/** Secrets in memory, or in a JSON file so separate processes can act as the same phone. */
export function secretStore(file?: string): SecretStore {
  const data: Record<string, string> =
    file && existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  const save = () => file && writeFileSync(file, JSON.stringify(data));
  return {
    get: async (k) => data[k] ?? null,
    set: async (k, v) => {
      data[k] = v;
      save();
    },
    delete: async (k) => {
      delete data[k];
      save();
    },
  };
}

export interface Phone extends SyncDeps {
  /** Moves this phone's clock, for last-write-wins tests. */
  advance(ms: number): void;
}

export async function phone(opts: { dbFile?: string; secretsFile?: string } = {}): Promise<Phone> {
  const db = nodeDb(opts.dbFile);
  await migrate(db);
  let offset = 0;
  const repo = new Repo(db, { uuid: randomUUID, now: () => Date.now() + offset });
  return {
    repo,
    store: secretStore(opts.secretsFile),
    random,
    advance: (ms) => (offset += ms),
  };
}
