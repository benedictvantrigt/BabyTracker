// Apple Push Notification service from a Worker (#6): token-based auth (ES256 JWT), one
// request per message. https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns
import type { PushMessage, SendResult } from './fcm';

export interface ApnsEnv {
  /** Contents of the AuthKey_XXXX.p8 file (Worker secret). iOS push is off without it. */
  APNS_KEY_P8?: string;
  APNS_KEY_ID?: string;
  APNS_TEAM_ID?: string;
  /** The app's bundle ID: com.napchime.app (production) or com.napchime.app.acc. */
  APNS_TOPIC?: string;
  /** Test override for https://api.push.apple.com. */
  APNS_API_BASE?: string;
}

/** Push tokens from iPhones carry this prefix; the rest is the hex APNs device token. */
export const APNS_PREFIX = 'apns:';

let cachedJwt: { key: string; jwt: string; issuedAt: number } | null = null;

function b64url(bytes: Uint8Array | string): string {
  const data = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
  let binary = '';
  for (const b of data) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToDer(pem: string): ArrayBuffer {
  const binary = atob(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out.buffer;
}

export function apnsConfigured(env: ApnsEnv): boolean {
  return Boolean(env.APNS_KEY_P8 && env.APNS_KEY_ID && env.APNS_TEAM_ID);
}

/** Apple accepts a token for an hour and refuses one refreshed more than every 20 minutes. */
async function providerToken(env: ApnsEnv, now: number): Promise<string> {
  const cacheKey = `${env.APNS_TEAM_ID}/${env.APNS_KEY_ID}`;
  if (cachedJwt && cachedJwt.key === cacheKey && now - cachedJwt.issuedAt < 40 * 60_000) {
    return cachedJwt.jwt;
  }
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: env.APNS_KEY_ID }));
  const claims = b64url(JSON.stringify({ iss: env.APNS_TEAM_ID, iat: Math.floor(now / 1000) }));
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(env.APNS_KEY_P8!),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  // WebCrypto returns r || s, the form JWS expects.
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(`${header}.${claims}`),
  );
  const jwt = `${header}.${claims}.${b64url(new Uint8Array(signature))}`;
  cachedJwt = { key: cacheKey, jwt, issuedAt: now };
  return jwt;
}

/**
 * A reminder goes out as an alert the notification service extension decrypts before it
 * shows (mutable-content); the visible fallback text says nothing about the baby. A sync
 * nudge is a background push.
 */
function request(m: PushMessage, now: number): { headers: Record<string, string>; body: string } {
  const expiration = String(Math.floor(now / 1000) + m.ttlSeconds);
  if (m.data.type === 'reminder') {
    return {
      headers: {
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'apns-expiration': expiration,
        ...(m.data.tag && { 'apns-collapse-id': m.data.tag.slice(0, 64) }),
      },
      body: JSON.stringify({
        aps: {
          alert: { title: 'Napchime', body: 'Reminder' },
          sound: 'default',
          'mutable-content': 1,
          'thread-id': 'reminders',
        },
        ...m.data,
      }),
    };
  }
  return {
    headers: { 'apns-push-type': 'background', 'apns-priority': '5', 'apns-expiration': expiration },
    body: JSON.stringify({ aps: { 'content-available': 1 }, ...m.data }),
  };
}

export async function sendApns(env: ApnsEnv, messages: PushMessage[]): Promise<SendResult[]> {
  if (!apnsConfigured(env) || messages.length === 0) return messages.map(() => 'failed');
  const now = Date.now();
  let jwt: string;
  try {
    jwt = await providerToken(env, now);
  } catch {
    return messages.map(() => 'failed');
  }
  const base = env.APNS_API_BASE ?? 'https://api.push.apple.com';
  const topic = env.APNS_TOPIC ?? 'com.napchime.app';
  return Promise.all(
    messages.map(async (m): Promise<SendResult> => {
      const device = m.token.slice(APNS_PREFIX.length);
      if (!/^[0-9a-fA-F]{32,200}$/.test(device)) return 'invalid_token';
      const { headers, body } = request(m, now);
      const response = await fetch(`${base}/3/device/${device}`, {
        method: 'POST',
        headers: {
          authorization: `bearer ${jwt}`,
          'apns-topic': topic,
          'content-type': 'application/json',
          ...headers,
        },
        body,
      }).catch(() => null);
      if (!response) return 'failed';
      if (response.ok) return 'sent';
      // 410 Unregistered: the app was removed or the token expired.
      if (response.status === 410) return 'invalid_token';
      if (response.status === 400) {
        const text = await response.text().catch(() => '');
        if (text.includes('BadDeviceToken') || text.includes('DeviceTokenNotForTopic')) {
          return 'invalid_token';
        }
      }
      return 'failed';
    }),
  );
}
