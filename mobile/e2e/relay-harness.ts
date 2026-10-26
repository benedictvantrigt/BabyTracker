/// <reference types="node" />
// Starts the relay locally (wrangler dev) for integration tests and the E2E partner.
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const RELAY_DIR = resolve(__dirname, '../../relay');

export interface LocalRelay {
  url: string;
  stop(): Promise<void>;
}

/** `vars` become Worker environment variables (e.g. a test FCM service account). */
export async function startRelay(
  port: number,
  vars: Record<string, string> = {},
): Promise<LocalRelay> {
  const state = mkdtempSync(join(tmpdir(), 'relay-state-'));
  const envFile = join(state, 'test.env');
  writeFileSync(
    envFile,
    Object.entries(vars)
      // Single quotes: no escape processing, so JSON values pass through unchanged.
      .map(([k, v]) => `${k}='${v}'`)
      .join('\n'),
  );
  const child: ChildProcess = spawn(
    'npx',
    [
      'wrangler',
      'dev',
      '--port',
      String(port),
      '--ip',
      '127.0.0.1',
      '--persist-to',
      state,
      '--env-file',
      envFile,
    ],
    {
      cwd: RELAY_DIR,
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    },
  );
  let output = '';
  child.stdout?.on('data', (d) => (output += d));
  child.stderr?.on('data', (d) => (output += d));
  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      if ((await fetch(`${url}/health`)).ok) break;
    } catch {
      // not up yet
    }
    if (Date.now() > deadline || child.exitCode !== null) {
      child.kill();
      throw new Error(`relay did not start:\n${output}`);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return {
    url,
    stop: async () => {
      if (child.pid) process.kill(-child.pid, 'SIGTERM');
      await new Promise((r) => setTimeout(r, 500));
    },
  };
}
