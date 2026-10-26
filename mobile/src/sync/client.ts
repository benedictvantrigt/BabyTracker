import { deviceIdFor, sign, signingMessage } from './crypto';

export class RelayError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(
      status === 0
        ? 'Could not reach the sync server. Check your internet connection.'
        : code === 'invite_invalid'
          ? 'This invite has expired or was already used. Ask for a new one.'
          : `Sync server error (${code || status}).`,
    );
  }
}

export interface PulledChange {
  seq: number;
  device: string;
  body: string;
}

type Fetch = typeof fetch;

/** Signed requests to one family on the relay. Every request carries an Ed25519 signature. */
export class RelayClient {
  readonly deviceId: string;
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    readonly familyId: string,
    private readonly deviceSecret: Uint8Array,
    private readonly fetchImpl: Fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.deviceId = deviceIdFor(deviceSecret);
  }

  createFamily() {
    return this.request('POST', '', {});
  }

  createInvite(hash: string): Promise<{ expiresAt: number }> {
    return this.request('POST', '/invites', { hash });
  }

  join(invite: string) {
    return this.request('POST', '/join', { invite });
  }

  /**
   * `nudge` asks the relay to wake the other phones: 'high' when the change shows or
   * clears a notification there (a running timer), else 'normal'.
   */
  push(changes: string[], nudge: 'high' | 'normal' = 'normal'): Promise<{ lastSeq: number }> {
    return this.request('POST', '/changes', { changes, nudge });
  }

  /** Registers this phone's FCM token (or clears it) and whether it wants reminders. */
  updateDevice(pushToken: string | null, reminders: boolean): Promise<{ push: boolean }> {
    return this.request('PUT', '/device', { pushToken, reminders });
  }

  /** Replaces the family's pending reminders; `basis` is the last change seq applied. */
  setReminders(
    basis: number,
    reminders: { tag: string; fireAt: number; body: string }[],
  ): Promise<{ applied: boolean }> {
    return this.request('PUT', '/reminders', { basis, reminders });
  }

  pull(after: number, limit = 500): Promise<{ changes: PulledChange[]; more: boolean }> {
    return this.request('GET', `/changes?after=${after}&limit=${limit}`);
  }

  devices(): Promise<{ devices: { id: string; createdAt: number }[] }> {
    return this.request('GET', '/devices');
  }

  revoke(deviceId: string) {
    return this.request('DELETE', `/devices/${deviceId}`);
  }

  private async request<T>(method: string, sub: string, body?: object): Promise<T> {
    const path = `/v1/families/${this.familyId}${sub}`;
    const text = body === undefined ? '' : JSON.stringify(body);
    const time = String(this.now());
    const signature = sign(this.deviceSecret, signingMessage(method, path, time, text));
    let response: Response;
    try {
      response = await this.fetchImpl(this.baseUrl + path, {
        method,
        headers: {
          'content-type': 'application/json',
          'x-bt-device': this.deviceId,
          'x-bt-time': time,
          'x-bt-sig': signature,
        },
        body: text === '' ? undefined : text,
      });
    } catch {
      throw new RelayError(0, 'network');
    }
    const json = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) throw new RelayError(response.status, json.error ?? '');
    return json as T;
  }
}
