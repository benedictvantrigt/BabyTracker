import { ed25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { base64urlnopad } from '@scure/base';

/** Requests older or newer than this are rejected (clock skew + replay window). */
export const MAX_CLOCK_SKEW_MS = 10 * 60_000;

export const HEADER_DEVICE = 'x-bt-device';
export const HEADER_TIME = 'x-bt-time';
export const HEADER_SIGNATURE = 'x-bt-sig';

/**
 * What a device signs: method, path with query, timestamp and body hash, one per line.
 * Must match the app's RelayClient.
 */
export function signingMessage(method: string, pathAndQuery: string, time: string, body: Uint8Array) {
  return new TextEncoder().encode(
    `${method.toUpperCase()}\n${pathAndQuery}\n${time}\n${bytesToHex(sha256(body))}`,
  );
}

export interface Signed {
  /** Device id: the base64url Ed25519 public key. */
  deviceId: string;
  body: Uint8Array;
}

/** Verifies the request signature. Returns null when missing, stale or invalid. */
export async function verifyRequest(request: Request, now: number): Promise<Signed | null> {
  const deviceId = request.headers.get(HEADER_DEVICE);
  const time = request.headers.get(HEADER_TIME);
  const signature = request.headers.get(HEADER_SIGNATURE);
  if (!deviceId || !time || !signature) return null;
  const ts = Number(time);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > MAX_CLOCK_SKEW_MS) return null;

  let publicKey: Uint8Array;
  let sig: Uint8Array;
  try {
    publicKey = base64urlnopad.decode(deviceId);
    sig = base64urlnopad.decode(signature);
  } catch {
    return null;
  }
  if (publicKey.length !== 32 || sig.length !== 64) return null;

  const body = new Uint8Array(await request.arrayBuffer());
  const url = new URL(request.url);
  const message = signingMessage(request.method, url.pathname + url.search, time, body);
  try {
    if (!ed25519.verify(sig, message, publicKey)) return null;
  } catch {
    return null;
  }
  return { deviceId, body };
}

export function sha256Hex(data: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(data)));
}
