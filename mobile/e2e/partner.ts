/// <reference types="node" />
// Plays the partner's phone in the emulator test, against the relay on the test machine.
//
//   tsx e2e/partner.ts create <dir> <relayUrl>   start a family with "Micky" and a feed,
//                                                 write an invite code to <dir>/invite.txt
//   tsx e2e/partner.ts check <dir>               sync and verify the app's diaper arrived
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { createFamily, loadEngine } from '../src/sync/setup';
import { phone } from './phone';

async function partner(dir: string) {
  mkdirSync(dir, { recursive: true });
  return phone({ dbFile: join(dir, 'partner.db'), secretsFile: join(dir, 'secrets.json') });
}

async function create(dir: string, relayUrl: string) {
  const p = await partner(dir);
  const child = await p.repo.addChild('Micky', '2026-09-01');
  const start = Date.now() - 40 * 60_000;
  await p.repo.addEntry(child.id, {
    kind: 'feeding',
    start,
    end: start + 15 * 60_000,
    data: { type: 'breast_milk', method: 'left' },
    notes: 'from partner',
  });
  const engine = await createFamily(p, relayUrl);
  const { code } = await engine.createInvite();
  writeFileSync(join(dir, 'invite.txt'), code);
  console.log(`family ${engine.client.familyId} created; invite written`);
}

async function check(dir: string) {
  const p = await partner(dir);
  const engine = await loadEngine(p);
  if (!engine) throw new Error('partner has no family');
  await engine.sync();
  const [child] = await p.repo.listChildren();
  const entries = await p.repo.listEntries(child.id, 0);
  const diaper = entries.find((e) => e.kind === 'diaper');
  const devices = (await engine.client.devices()).devices.length;
  const result = {
    devices,
    entries: entries.map((e) => `${e.kind}${e.deletedAt ? ' (deleted)' : ''}`),
    diaperFromApp: Boolean(diaper && diaper.kind === 'diaper' && diaper.data.wet),
  };
  writeFileSync(join(dir, 'check.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  if (!result.diaperFromApp || devices !== 2) process.exit(1);
}

async function main() {
  const [command, dir, relayUrl] = process.argv.slice(2);
  if (command === 'create' && dir && relayUrl) return create(dir, relayUrl);
  if (command === 'check' && dir) return check(dir);
  console.error('usage: partner.ts create <dir> <relayUrl> | check <dir>');
  process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
