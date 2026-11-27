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

/** Which due reminders the relay pushes to this phone (see the relay's reminder-filter.ts). */
/**
 * A timer this phone just started, as the relay sees it (#98): only its kind and start time,
 * since iOS draws the Live Activity it starts before the app can decrypt anything.
 */
export interface LiveStart {
  kind: 'sleep' | 'feeding';
  start: number;
}

export interface ReminderFilter {
  /** Reminder ids this phone shows: some of nap, wake, bed and feed. */
  ids: string[];
  /** Duty days, 0 is Sunday; a day runs from `dayStartMinute` to the next day start. */
  dutyDays: number[];
  dayStartMinute: number;
  /** IANA time zone the duty days are in; null skips the duty-day check on the relay. */
  timeZone: string | null;
}

export interface RelayDevice {
  id: string;
  createdAt: number;
  lastSeenAt: number | null;
  /** The device's name, sealed with the family key; null when not set. */
  label: string | null;
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
   * `epoch` is the family key the changes are sealed with; the relay refuses an old one
   * (409 stale_key). `nudge` asks the relay to wake the other phones: 'high' when the
   * change shows or clears a notification there (a running timer), else 'normal'.
   */
  push(
    changes: string[],
    epoch: number,
    nudge: 'high' | 'normal' = 'normal',
    /** A sleep or feeding timer just started here: the relay starts it on partner iPhones (#98). */
    liveStart?: LiveStart,
  ): Promise<{ lastSeq: number }> {
    return this.request('POST', '/changes', { changes, epoch, nudge, liveStart });
  }

  /**
   * Registers this phone's push token (or clears it), whether it wants reminders, and its
   * sealed name (left unchanged when undefined). `reminderFilter` narrows which reminders
   * the relay pushes here: an iPhone cannot drop a pushed alert itself.
   */
  updateDevice(
    pushToken: string | null,
    reminders: boolean,
    label?: string,
    reminderFilter?: ReminderFilter,
    /** iPhone: the Live Activity push-to-start token (#98); left out where there is none. */
    liveStartToken?: string,
  ): Promise<{ push: boolean }> {
    return this.request('PUT', '/device', {
      pushToken,
      reminders,
      label,
      reminderFilter,
      liveStartToken,
    });
  }

  /** Replaces the family's pending reminders; `basis` is the last change seq applied. */
  setReminders(
    basis: number,
    reminders: { tag: string; fireAt: number; body: string }[],
  ): Promise<{ applied: boolean }> {
    return this.request('PUT', '/reminders', { basis, reminders });
  }

  /** Changes after `after`, and the current key epoch. Also acknowledges up to `after`. */
  pull(
    after: number,
    limit = 500,
  ): Promise<{ changes: PulledChange[]; more: boolean; epoch?: number }> {
    return this.request('GET', `/changes?after=${after}&limit=${limit}`);
  }

  devices(): Promise<{ devices: RelayDevice[] }> {
    return this.request('GET', '/devices');
  }

  /** Leaves the family (this device only). */
  revoke(deviceId: string) {
    return this.request('DELETE', `/devices/${deviceId}`);
  }

  /** The current key epoch and the family key wrapped for this device, if rotated. */
  key(): Promise<{ epoch: number; wrap: { epoch: number; from: string; body: string } | null }> {
    return this.request('GET', '/key');
  }

  /** Removes devices and starts key `epoch`; see the relay's rotate. */
  rotate(body: {
    epoch: number;
    basis: number;
    remove: string[];
    wraps: Record<string, string>;
    labels: Record<string, string>;
  }): Promise<{ epoch: number }> {
    return this.request('POST', '/rotate', body);
  }

  deleteFamily() {
    return this.request('DELETE', '');
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
