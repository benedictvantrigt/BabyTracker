import { DurableObject } from 'cloudflare:workers';

import { sha256Hex, verifyRequest } from './auth';
import { fcmConfigured, sendPushes, type FcmEnv, type PushMessage } from './fcm';

/** Invites are single use and short lived; the code also carries the family key. */
const INVITE_TTL_MS = 15 * 60_000;
const MAX_BODY_BYTES = 1024 * 1024;
const MAX_CHANGE_BYTES = 32 * 1024;
const MAX_CHANGES_PER_PUSH = 200;
const MAX_PULL = 500;
/** Rough abuse guard: a busy family logs a few thousand changes a month. */
const MAX_CHANGES_STORED = 500_000;
const MAX_REMINDERS = 10;
const MAX_REMINDER_BYTES = 4 * 1024;
/** Reminders further out than this are refused; the phones refresh them on every change. */
const MAX_REMINDER_AHEAD_MS = 2 * 24 * 60 * 60_000;
/** A reminder delivered later than this after its time is dropped by FCM. */
const REMINDER_TTL_SECONDS = 30 * 60;
const SYNC_NUDGE_TTL_SECONDS = 60 * 60;
/** Sealed per-device data: device labels and wrapped family keys. */
const MAX_SEALED_BYTES = 1024;

type Json = Record<string, unknown>;

function json(body: Json, status = 200): Response {
  return Response.json(body, { status });
}

function error(code: string, status: number): Response {
  return json({ error: code }, status);
}

/**
 * One family: its devices, pending invites, the encrypted change log and the family's
 * pending reminders. Each device pulls everything after its last seq; changes every
 * device has received are deleted (a phone that invites someone uploads a snapshot, and
 * nothing is deleted while an invite is open). Reminders fire from a Durable Object
 * alarm as push messages.
 *
 * The family key has an epoch. Removing a phone starts a new epoch: the remover sends the
 * new key wrapped for each remaining device (the relay cannot unwrap it), the old log is
 * dropped and the remover uploads a snapshot sealed with the new key.
 */
export class Family extends DurableObject<FcmEnv> {
  private sql = this.ctx.storage.sql;

  constructor(ctx: DurableObjectState, env: FcmEnv) {
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
      CREATE TABLE IF NOT EXISTS reminders (
        tag TEXT PRIMARY KEY,
        fire_at INTEGER NOT NULL,
        body TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS key_wraps (
        device TEXT PRIMARY KEY,
        epoch INTEGER NOT NULL,
        from_device TEXT NOT NULL,
        body TEXT NOT NULL
      );
    `);
    const columns = this.sql.exec('PRAGMA table_info(devices)').toArray().map((c) => c.name);
    if (!columns.includes('push_token')) {
      this.sql.exec('ALTER TABLE devices ADD COLUMN push_token TEXT');
      this.sql.exec('ALTER TABLE devices ADD COLUMN reminders INTEGER NOT NULL DEFAULT 1');
    }
    if (!columns.includes('acked_seq')) {
      this.sql.exec('ALTER TABLE devices ADD COLUMN acked_seq INTEGER NOT NULL DEFAULT 0');
      this.sql.exec('ALTER TABLE devices ADD COLUMN last_seen_at INTEGER');
      this.sql.exec('ALTER TABLE devices ADD COLUMN label TEXT');
      this.sql.exec('ALTER TABLE changes ADD COLUMN epoch INTEGER NOT NULL DEFAULT 0');
    }
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
    this.sql.exec('UPDATE devices SET last_seen_at = ? WHERE id = ?', now, signed.deviceId);
    if (route === 'POST /invites') return this.createInvite(signed.deviceId, body, now);
    if (route === 'POST /changes') return this.push(signed.deviceId, body, now);
    if (route === 'GET /changes') return this.pull(signed.deviceId, url, now);
    if (route === 'GET /key') return this.key(signed.deviceId);
    if (route === 'POST /rotate') return this.rotate(signed.deviceId, body, now);
    if (route === 'DELETE /') return this.deleteFamily();
    if (route === 'GET /devices') return this.listDevices();
    if (route === 'PUT /device') return this.updateDevice(signed.deviceId, body);
    if (route === 'PUT /reminders') return this.setReminders(body, now);
    const revoke = /^DELETE \/devices\/([A-Za-z0-9_-]+)$/.exec(route);
    if (revoke) {
      // A phone can only leave by itself; removing another phone rotates the key.
      if (revoke[1] !== signed.deviceId) return error('use_rotate', 403);
      return this.revoke(revoke[1], now);
    }
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
      'INSERT INTO devices (id, created_at) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET revoked_at = NULL, acked_seq = 0',
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
    // Changes sealed with an older family key are refused; the phone fetches the new key.
    const epoch = this.epoch();
    if ((typeof body.epoch === 'number' ? body.epoch : 0) !== epoch) {
      return json({ error: 'stale_key', epoch }, 409);
    }
    const stored = this.sql.exec('SELECT COUNT(*) AS n FROM changes').one().n as number;
    if (stored + changes.length > MAX_CHANGES_STORED) return error('quota_exceeded', 507);
    for (const c of changes) {
      this.sql.exec(
        'INSERT INTO changes (device, body, created_at, epoch) VALUES (?, ?, ?, ?)',
        deviceId,
        c,
        now,
        epoch,
      );
    }
    const lastSeq = this.sql.exec('SELECT MAX(seq) AS s FROM changes').one().s as number;
    this.setMeta('last_seq', lastSeq);
    // Wake the other phones so they pull. High priority only when the sender says the
    // change shows or clears a notification there (a running timer); Android throttles
    // high-priority messages that show nothing.
    const nudge = body.nudge === 'high' ? 'HIGH' : body.nudge === 'none' ? null : 'NORMAL';
    if (nudge) this.ctx.waitUntil(this.nudge(deviceId, nudge));
    return json({ lastSeq });
  }

  /**
   * Changes after `after`. Pulling from `after` also tells the relay this device has
   * everything up to it, so changes all devices have can be deleted.
   */
  private pull(deviceId: string, url: URL, now: number): Response {
    const after = Math.max(0, Number(url.searchParams.get('after') ?? 0) || 0);
    const limit = Math.min(MAX_PULL, Math.max(1, Number(url.searchParams.get('limit') ?? MAX_PULL) || MAX_PULL));
    this.sql.exec(
      'UPDATE devices SET acked_seq = MAX(acked_seq, ?) WHERE id = ?',
      Math.min(after, this.maxSeq()),
      deviceId,
    );
    this.compact(now);
    const rows = this.sql
      .exec(
        'SELECT seq, device, body FROM changes WHERE seq > ? ORDER BY seq LIMIT ?',
        after,
        limit + 1,
      )
      .toArray();
    const more = rows.length > limit;
    return json({ changes: rows.slice(0, limit), more, epoch: this.epoch() });
  }

  /** Deletes changes every device has received, unless an invite is open. */
  private compact(now: number): void {
    const open = this.sql
      .exec('SELECT COUNT(*) AS n FROM invites WHERE used_at IS NULL AND expires_at >= ?', now)
      .one().n as number;
    if (open > 0) return;
    const floor = this.sql
      .exec('SELECT MIN(acked_seq) AS f FROM devices WHERE revoked_at IS NULL')
      .one().f as number | null;
    if (floor) this.sql.exec('DELETE FROM changes WHERE seq <= ?', floor);
  }

  /** The highest seq ever stored; kept in meta because compaction deletes the rows. */
  private maxSeq(): number {
    const stored = this.getMeta('last_seq');
    if (stored !== null) return stored;
    return (this.sql.exec('SELECT MAX(seq) AS s FROM changes').one().s as number | null) ?? 0;
  }

  private epoch(): number {
    return this.getMeta('key_epoch') ?? 0;
  }

  private getMeta(key: string): number | null {
    const row = this.sql.exec('SELECT value FROM meta WHERE key = ?', key).toArray()[0];
    return (row?.value as number | undefined) ?? null;
  }

  private setMeta(key: string, value: number): void {
    this.sql.exec(
      'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      key,
      value,
    );
  }

  /** The current family key, wrapped for this device by the phone that last rotated it. */
  private key(deviceId: string): Response {
    const wrap = this.sql
      .exec('SELECT epoch, from_device, body FROM key_wraps WHERE device = ?', deviceId)
      .toArray()[0];
    return json({
      epoch: this.epoch(),
      wrap: wrap ? { epoch: wrap.epoch, from: wrap.from_device, body: wrap.body } : null,
    });
  }

  /**
   * Removes devices and starts a new key epoch. The sender must have pulled the whole log
   * (`basis`), because the log is dropped; it then uploads a snapshot with the new key.
   * Every remaining device, the sender included, needs a wrapped key.
   */
  private async rotate(deviceId: string, body: Json, now: number): Promise<Response> {
    const { epoch, basis, remove, wraps, labels } = body as {
      epoch: unknown;
      basis: unknown;
      remove: unknown;
      wraps: unknown;
      labels: unknown;
    };
    const current = this.epoch();
    if (epoch !== current + 1) return json({ error: 'stale_key', epoch: current }, 409);
    if (typeof basis !== 'number' || basis < this.maxSeq()) return error('not_up_to_date', 409);
    if (!Array.isArray(remove) || !remove.every((d) => typeof d === 'string')) {
      return error('bad_rotate', 400);
    }
    if (remove.includes(deviceId)) return error('bad_rotate', 400);
    const isSealed = (v: unknown) => typeof v === 'string' && v.length > 0 && v.length <= MAX_SEALED_BYTES;
    if (!wraps || typeof wraps !== 'object') return error('bad_rotate', 400);
    const wrapMap = wraps as Record<string, unknown>;
    const labelMap = (labels && typeof labels === 'object' ? labels : {}) as Record<string, unknown>;
    const active = this.sql
      .exec('SELECT id FROM devices WHERE revoked_at IS NULL')
      .toArray()
      .map((r) => r.id as string);
    const remaining = active.filter((id) => !remove.includes(id));
    if (!remaining.every((id) => isSealed(wrapMap[id]))) return error('missing_wraps', 400);

    for (const id of remove) {
      this.sql.exec(
        'UPDATE devices SET revoked_at = ?, push_token = NULL, label = NULL WHERE id = ? AND revoked_at IS NULL',
        now,
        id,
      );
    }
    this.sql.exec('DELETE FROM key_wraps');
    for (const id of remaining) {
      this.sql.exec(
        'INSERT INTO key_wraps (device, epoch, from_device, body) VALUES (?, ?, ?, ?)',
        id,
        epoch,
        deviceId,
        wrapMap[id] as string,
      );
      // Labels were sealed with the old key; the remover reseals the ones it could read.
      const label = labelMap[id];
      this.sql.exec('UPDATE devices SET label = ? WHERE id = ?', isSealed(label) ? label : null, id);
    }
    this.setMeta('key_epoch', epoch);
    // Everything sealed with the old key goes: the log, open invites (they carry the old
    // key) and pending reminders.
    this.sql.exec('DELETE FROM changes');
    this.sql.exec('DELETE FROM invites');
    this.sql.exec('DELETE FROM reminders');
    this.sql.exec('UPDATE devices SET acked_seq = 0');
    await this.scheduleAlarm();
    return json({ epoch });
  }

  /** Deletes the family from the relay: devices, log, invites and reminders. */
  private async deleteFamily(): Promise<Response> {
    for (const table of ['devices', 'invites', 'changes', 'reminders', 'meta', 'key_wraps']) {
      this.sql.exec(`DELETE FROM ${table}`);
    }
    await this.ctx.storage.deleteAlarm();
    return json({ ok: true });
  }

  private listDevices(): Response {
    const devices = this.sql
      .exec(
        `SELECT id, created_at AS createdAt, last_seen_at AS lastSeenAt, label
         FROM devices WHERE revoked_at IS NULL ORDER BY created_at`,
      )
      .toArray();
    return json({ devices });
  }

  private revoke(id: string, now: number): Response {
    this.sql.exec(
      'UPDATE devices SET revoked_at = ?, push_token = NULL, label = NULL WHERE id = ? AND revoked_at IS NULL',
      now,
      id,
    );
    return json({ ok: true });
  }

  private updateDevice(deviceId: string, body: Json): Response {
    const token = body.pushToken;
    if (token !== null && (typeof token !== 'string' || token.length > 4096)) {
      return error('bad_token', 400);
    }
    const label = body.label;
    if (
      label !== undefined &&
      label !== null &&
      (typeof label !== 'string' || label.length > MAX_SEALED_BYTES)
    ) {
      return error('bad_label', 400);
    }
    const reminders = body.reminders !== false;
    // A token belongs to one app install; drop it from any other device row.
    if (token) this.sql.exec('UPDATE devices SET push_token = NULL WHERE push_token = ?', token);
    this.sql.exec(
      'UPDATE devices SET push_token = ?, reminders = ? WHERE id = ?',
      token,
      reminders ? 1 : 0,
      deviceId,
    );
    if (label !== undefined) {
      this.sql.exec('UPDATE devices SET label = ? WHERE id = ?', label, deviceId);
    }
    return json({ ok: true, push: fcmConfigured(this.env) });
  }

  /**
   * Replaces the family's pending reminders. `basis` is the change-log seq the phone had
   * applied when it computed them; a set based on an older log is ignored.
   */
  private async setReminders(body: Json, now: number): Promise<Response> {
    const basis = body.basis;
    const list = body.reminders;
    if (typeof basis !== 'number' || !Array.isArray(list) || list.length > MAX_REMINDERS) {
      return error('bad_reminders', 400);
    }
    const reminders: { tag: string; fireAt: number; body: string }[] = [];
    for (const r of list as Json[]) {
      if (
        typeof r.tag !== 'string' ||
        !/^[a-z0-9_-]{1,32}$/.test(r.tag) ||
        typeof r.fireAt !== 'number' ||
        r.fireAt > now + MAX_REMINDER_AHEAD_MS ||
        typeof r.body !== 'string' ||
        r.body.length > MAX_REMINDER_BYTES
      ) {
        return error('bad_reminders', 400);
      }
      if (r.fireAt > now) reminders.push({ tag: r.tag, fireAt: r.fireAt, body: r.body });
    }
    const current = this.sql.exec("SELECT value FROM meta WHERE key = 'reminder_basis'").toArray();
    const currentBasis = current.length ? (current[0].value as number) : -1;
    if (basis < currentBasis) return json({ applied: false });

    this.sql.exec('DELETE FROM reminders');
    for (const r of reminders) {
      this.sql.exec('INSERT INTO reminders (tag, fire_at, body) VALUES (?, ?, ?)', r.tag, r.fireAt, r.body);
    }
    this.sql.exec(
      "INSERT INTO meta (key, value) VALUES ('reminder_basis', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      basis,
    );
    await this.scheduleAlarm();
    return json({ applied: true });
  }

  private async scheduleAlarm(): Promise<void> {
    const next = this.sql.exec('SELECT MIN(fire_at) AS t FROM reminders').one().t as number | null;
    if (next === null) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(next);
  }

  /** Durable Object alarm: push every reminder that is due, then wait for the next one. */
  async alarm(): Promise<void> {
    const now = Date.now();
    const due = this.sql
      .exec('SELECT tag, fire_at, body FROM reminders WHERE fire_at <= ?', now + 1000)
      .toArray();
    if (due.length > 0) {
      const tokens = this.pushTokens(null, true);
      const messages: PushMessage[] = [];
      for (const r of due) {
        for (const t of tokens) {
          messages.push({
            token: t.token,
            data: { type: 'reminder', tag: r.tag as string, payload: r.body as string },
            priority: 'HIGH',
            ttlSeconds: REMINDER_TTL_SECONDS,
          });
        }
      }
      await this.send(messages);
      this.sql.exec('DELETE FROM reminders WHERE fire_at <= ?', now + 1000);
    }
    await this.scheduleAlarm();
  }

  private pushTokens(exceptDevice: string | null, remindersOnly: boolean) {
    return this.sql
      .exec(
        `SELECT id, push_token FROM devices
         WHERE revoked_at IS NULL AND push_token IS NOT NULL AND id IS NOT ?
         ${remindersOnly ? 'AND reminders = 1' : ''}`,
        exceptDevice,
      )
      .toArray()
      .map((r) => ({ device: r.id as string, token: r.push_token as string }));
  }

  private async nudge(sender: string, priority: 'HIGH' | 'NORMAL'): Promise<void> {
    if (!fcmConfigured(this.env)) return;
    const tokens = this.pushTokens(sender, false);
    await this.send(
      tokens.map((t) => ({
        token: t.token,
        data: { type: 'sync' },
        priority,
        ttlSeconds: SYNC_NUDGE_TTL_SECONDS,
        collapseKey: 'sync',
      })),
    );
  }

  /** Sends pushes and forgets tokens FCM reports as dead. */
  private async send(messages: PushMessage[]): Promise<void> {
    if (messages.length === 0 || !fcmConfigured(this.env)) return;
    const results = await sendPushes(this.env, messages).catch(() => messages.map(() => 'failed'));
    results.forEach((result, i) => {
      if (result === 'invalid_token') {
        this.sql.exec(
          'UPDATE devices SET push_token = NULL WHERE push_token = ?',
          messages[i].token,
        );
      }
    });
  }
}
