import { DurableObject } from 'cloudflare:workers';

import { sha256Hex, verifyRequest } from './auth';

/** Invites are single use and short lived; the code also carries the family key. */
const INVITE_TTL_MS = 15 * 60_000;
const MAX_BODY_BYTES = 1024 * 1024;
const MAX_CHANGE_BYTES = 32 * 1024;
const MAX_CHANGES_PER_PUSH = 200;
const MAX_PULL = 500;
/** Rough abuse guard: a busy family logs a few thousand changes a month. */
const MAX_CHANGES_STORED = 500_000;

type Json = Record<string, unknown>;

function json(body: Json, status = 200): Response {
  return Response.json(body, { status });
}

function error(code: string, status: number): Response {
  return json({ error: code }, status);
}

/**
 * One family: its devices, pending invites and the encrypted change log.
 * The change log is append-only; each device pulls everything after its last seq.
 */
export class Family extends DurableObject {
  private sql = this.ctx.storage.sql;

  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        revoked_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS invites (
        hash TEXT PRIMARY KEY,
        created_by TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        used_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS changes (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        device TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);
  }

  async fetch(request: Request): Promise<Response> {
    const now = Date.now();
    const contentLength = Number(request.headers.get('content-length') ?? 0);
    if (contentLength > MAX_BODY_BYTES) return error('too_large', 413);

    const signed = await verifyRequest(request, now);
    if (!signed) return error('bad_signature', 401);
    if (signed.body.byteLength > MAX_BODY_BYTES) return error('too_large', 413);

    const url = new URL(request.url);
    const sub = url.pathname.replace(/^\/v1\/families\/[^/]+/, '') || '/';
    let body: Json = {};
    if (signed.body.byteLength > 0) {
      try {
        body = JSON.parse(new TextDecoder().decode(signed.body));
      } catch {
        return error('bad_json', 400);
      }
    }
    const route = `${request.method} ${sub}`;

    // Routes open to a device that is not (yet) a member.
    if (route === 'POST /') return this.create(signed.deviceId, now);
    if (route === 'POST /join') return this.join(signed.deviceId, body, now);

    if (!this.isMember(signed.deviceId)) return error('not_a_member', 403);
    if (route === 'POST /invites') return this.createInvite(signed.deviceId, body, now);
    if (route === 'POST /changes') return this.push(signed.deviceId, body, now);
    if (route === 'GET /changes') return this.pull(url);
    if (route === 'GET /devices') return this.listDevices();
    const revoke = /^DELETE \/devices\/([A-Za-z0-9_-]+)$/.exec(route);
    if (revoke) return this.revoke(revoke[1], now);
    return error('not_found', 404);
  }

  private isMember(deviceId: string): boolean {
    return (
      this.sql
        .exec('SELECT 1 FROM devices WHERE id = ? AND revoked_at IS NULL', deviceId)
        .toArray().length > 0
    );
  }

  private create(deviceId: string, now: number): Response {
    const existing = this.sql.exec('SELECT COUNT(*) AS n FROM devices').one().n as number;
    if (existing > 0) return error('family_exists', 409);
    this.sql.exec('INSERT INTO devices (id, created_at) VALUES (?, ?)', deviceId, now);
    return json({ ok: true }, 201);
  }

  private createInvite(deviceId: string, body: Json, now: number): Response {
    const hash = body.hash;
    if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash)) return error('bad_invite', 400);
    this.sql.exec('DELETE FROM invites WHERE expires_at < ?', now);
    this.sql.exec(
      'INSERT OR REPLACE INTO invites (hash, created_by, expires_at) VALUES (?, ?, ?)',
      hash,
      deviceId,
      now + INVITE_TTL_MS,
    );
    return json({ expiresAt: now + INVITE_TTL_MS }, 201);
  }

  private join(deviceId: string, body: Json, now: number): Response {
    if (this.isMember(deviceId)) return json({ ok: true });
    const invite = body.invite;
    if (typeof invite !== 'string' || invite.length < 16) return error('bad_invite', 400);
    const hash = sha256Hex(invite);
    const row = this.sql
      .exec('SELECT expires_at, used_at FROM invites WHERE hash = ?', hash)
      .toArray()[0];
    if (!row || row.used_at !== null || (row.expires_at as number) < now) {
      return error('invite_invalid', 403);
    }
    this.sql.exec('UPDATE invites SET used_at = ? WHERE hash = ?', now, hash);
    this.sql.exec(
      'INSERT INTO devices (id, created_at) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET revoked_at = NULL',
      deviceId,
      now,
    );
    return json({ ok: true }, 201);
  }

  private push(deviceId: string, body: Json, now: number): Response {
    const changes = body.changes;
    if (!Array.isArray(changes) || changes.length === 0 || changes.length > MAX_CHANGES_PER_PUSH) {
      return error('bad_changes', 400);
    }
    for (const c of changes) {
      if (typeof c !== 'string' || c.length === 0 || c.length > MAX_CHANGE_BYTES) {
        return error('bad_changes', 400);
      }
    }
    const stored = this.sql.exec('SELECT COUNT(*) AS n FROM changes').one().n as number;
    if (stored + changes.length > MAX_CHANGES_STORED) return error('quota_exceeded', 507);
    for (const c of changes) {
      this.sql.exec(
        'INSERT INTO changes (device, body, created_at) VALUES (?, ?, ?)',
        deviceId,
        c,
        now,
      );
    }
    const lastSeq = this.sql.exec('SELECT MAX(seq) AS s FROM changes').one().s as number;
    return json({ lastSeq });
  }

  private pull(url: URL): Response {
    const after = Math.max(0, Number(url.searchParams.get('after') ?? 0) || 0);
    const limit = Math.min(MAX_PULL, Math.max(1, Number(url.searchParams.get('limit') ?? MAX_PULL) || MAX_PULL));
    const rows = this.sql
      .exec(
        'SELECT seq, device, body FROM changes WHERE seq > ? ORDER BY seq LIMIT ?',
        after,
        limit + 1,
      )
      .toArray();
    const more = rows.length > limit;
    return json({ changes: rows.slice(0, limit), more });
  }

  private listDevices(): Response {
    const devices = this.sql
      .exec('SELECT id, created_at AS createdAt FROM devices WHERE revoked_at IS NULL ORDER BY created_at')
      .toArray();
    return json({ devices });
  }

  private revoke(id: string, now: number): Response {
    this.sql.exec('UPDATE devices SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL', now, id);
    return json({ ok: true });
  }
}
