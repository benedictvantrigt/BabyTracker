// Firebase Cloud Messaging (HTTP v1) from a Worker: service-account JWT -> OAuth token -> send.
// https://firebase.google.com/docs/cloud-messaging/send/v1-api

export interface FcmEnv {
  /** Service account JSON from the Firebase console (Worker secret). Push is off without it. */
  FCM_SERVICE_ACCOUNT?: string;
  /** Test override for https://fcm.googleapis.com. */
  FCM_API_BASE?: string;
}

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri: string;
}

export interface PushMessage {
  token: string;
  data: Record<string, string>;
  priority: 'HIGH' | 'NORMAL';
  /** Seconds FCM keeps trying to deliver. */
  ttlSeconds: number;
  collapseKey?: string;
}

export type SendResult = 'sent' | 'invalid_token' | 'failed';

const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

let cachedToken: { key: string; token: string; expiresAt: number } | null = null;

function b64url(data: ArrayBuffer | Uint8Array | string): string {
  const bytes =
    typeof data === 'string'
      ? new TextEncoder().encode(data)
      : data instanceof Uint8Array
        ? data
        : new Uint8Array(data);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToDer(pem: string): ArrayBuffer {
  const body = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const binary = atob(body);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out.buffer;
}

async function accessToken(sa: ServiceAccount, now: number): Promise<string> {
  if (cachedToken && cachedToken.key === sa.client_email && cachedToken.expiresAt > now + 60_000) {
    return cachedToken.token;
  }
  const iat = Math.floor(now / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(
    JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: sa.token_uri, iat, exp: iat + 3600 }),
  );
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(`${header}.${claims}`),
  );
  const response = await fetch(sa.token_uri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claims}.${b64url(signature)}`,
    }),
  });
  if (!response.ok) throw new Error(`oauth ${response.status}`);
  const json = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    key: sa.client_email,
    token: json.access_token,
    expiresAt: now + json.expires_in * 1000,
  };
  return json.access_token;
}

export function fcmConfigured(env: FcmEnv): boolean {
  return Boolean(env.FCM_SERVICE_ACCOUNT);
}

/** Sends each message; reports per token whether it was delivered to FCM or is dead. */
export async function sendPushes(env: FcmEnv, messages: PushMessage[]): Promise<SendResult[]> {
  if (!env.FCM_SERVICE_ACCOUNT || messages.length === 0) return messages.map(() => 'failed');
  const sa = JSON.parse(env.FCM_SERVICE_ACCOUNT) as ServiceAccount;
  const token = await accessToken(sa, Date.now());
  const base = env.FCM_API_BASE ?? 'https://fcm.googleapis.com';
  return Promise.all(
    messages.map(async (m): Promise<SendResult> => {
      const response = await fetch(`${base}/v1/projects/${sa.project_id}/messages:send`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          message: {
            token: m.token,
            data: m.data,
            android: {
              priority: m.priority,
              ttl: `${m.ttlSeconds}s`,
              ...(m.collapseKey && { collapse_key: m.collapseKey }),
            },
          },
        }),
      }).catch(() => null);
      if (!response) return 'failed';
      if (response.ok) return 'sent';
      // 404 UNREGISTERED: the app was uninstalled or the token rotated.
      if (response.status === 404) return 'invalid_token';
      if (response.status === 400) {
        const text = await response.text().catch(() => '');
        if (text.includes('registration token')) return 'invalid_token';
      }
      return 'failed';
    }),
  );
}
