import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { ed25519, x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { base64urlnopad, utf8 } from '@scure/base';

/** Cryptographically secure random bytes; injected so the app (expo-crypto) and Node can share code. */
export type RandomBytes = (length: number) => Uint8Array;

export const b64url = {
  encode: (bytes: Uint8Array): string => base64urlnopad.encode(bytes),
  decode: (text: string): Uint8Array => base64urlnopad.decode(text),
};

export const utf8Bytes = (text: string): Uint8Array => utf8.decode(text);
export const bytesUtf8 = (bytes: Uint8Array): string => utf8.encode(bytes);

export function sha256Hex(data: string | Uint8Array): string {
  return bytesToHex(sha256(typeof data === 'string' ? utf8Bytes(data) : data));
}

const NONCE_BYTES = 24;
/** Marks data sealed with associated data (`context`); base64url never contains a dot. */
const V2 = 'v2.';

/**
 * What each kind of sealed data is bound to (#41). Opening it under another context fails,
 * so the relay cannot move ciphertext between families, epochs, devices or purposes.
 */
export const sealContext = {
  change: (familyId: string, epoch: number) => `bt/v2/change/${familyId}/${epoch}`,
  reminder: (familyId: string) => `bt/v2/reminder/${familyId}`,
  label: (familyId: string, deviceId: string) => `bt/v2/label/${familyId}/${deviceId}`,
  wrap: (familyId: string, epoch: number, recipientId: string) =>
    `bt/v2/wrap/${familyId}/${epoch}/${recipientId}`,
};

/**
 * XChaCha20-Poly1305 with a random nonce, bound to `context` as associated data. Output is
 * "v2." + base64url(nonce || ciphertext).
 */
export function seal(
  key: Uint8Array,
  plaintext: string,
  random: RandomBytes,
  context: string,
): string {
  const nonce = random(NONCE_BYTES);
  const ciphertext = xchacha20poly1305(key, nonce, utf8Bytes(context)).encrypt(
    utf8Bytes(plaintext),
  );
  const out = new Uint8Array(NONCE_BYTES + ciphertext.length);
  out.set(nonce);
  out.set(ciphertext, NONCE_BYTES);
  return V2 + b64url.encode(out);
}

/**
 * Inverse of `seal`. Throws when the data was not sealed with `key` and `context`, or was
 * tampered with. With `legacy`, data from before 0.7 (no "v2." prefix, no context) opens too.
 */
export function open(
  key: Uint8Array,
  sealed: string,
  context: string,
  { legacy = false }: { legacy?: boolean } = {},
): string {
  const v2 = sealed.startsWith(V2);
  if (!v2 && !legacy) throw new Error('Sealed without context.');
  const bytes = b64url.decode(v2 ? sealed.slice(V2.length) : sealed);
  const nonce = bytes.subarray(0, NONCE_BYTES);
  const aad = v2 ? utf8Bytes(context) : undefined;
  return bytesUtf8(xchacha20poly1305(key, nonce, aad).decrypt(bytes.subarray(NONCE_BYTES)));
}

const WRAP_INFO = utf8Bytes('baby-tracker key wrap v1');

/** Key-encryption key shared by two devices: X25519 on their Ed25519 keys, then HKDF. */
function wrappingKey(ownSecret: Uint8Array, otherDeviceId: string): Uint8Array {
  const shared = x25519.getSharedSecret(
    ed25519.utils.toMontgomerySecret(ownSecret),
    ed25519.utils.toMontgomery(b64url.decode(otherDeviceId)),
  );
  return hkdf(sha256, shared, undefined, WRAP_INFO, 32);
}

/**
 * Seals a family key so only `recipientDeviceId` (and the sender) can open it, bound to
 * `context` (`sealContext.wrap`), so it cannot be replayed for another epoch.
 */
export function wrapKey(
  senderSecret: Uint8Array,
  recipientDeviceId: string,
  key: Uint8Array,
  random: RandomBytes,
  context: string,
): string {
  return seal(wrappingKey(senderSecret, recipientDeviceId), b64url.encode(key), random, context);
}

/** Opens a key wrapped by `senderDeviceId` for this device. Throws when it was not. */
export function unwrapKey(
  recipientSecret: Uint8Array,
  senderDeviceId: string,
  wrapped: string,
  context: string,
): Uint8Array {
  const key = b64url.decode(open(wrappingKey(recipientSecret, senderDeviceId), wrapped, context));
  if (key.length !== 32) throw new Error('Not a family key.');
  return key;
}

/** Whether `id` has the form of a device id (32-byte Ed25519 public key, base64url). */
export function isDeviceId(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{43}$/.test(id);
}

/**
 * A code both parents can compare to check that their phones trust the same phones: 20
 * digits from a hash of the family id and the sorted trusted device ids.
 */
export function safetyCode(familyId: string, deviceIds: string[]): string {
  const lines = ['bt safety v1', familyId, ...[...deviceIds].sort()];
  const digest = sha256(utf8Bytes(lines.join('\n')));
  const groups: string[] = [];
  for (let i = 0; i < 5; i++) {
    const n = ((digest[i * 3] << 16) | (digest[i * 3 + 1] << 8) | digest[i * 3 + 2]) % 10000;
    groups.push(String(n).padStart(4, '0'));
  }
  return groups.join(' ');
}

/** A device id is its base64url Ed25519 public key. */
export function deviceIdFor(secret: Uint8Array): string {
  return b64url.encode(ed25519.getPublicKey(secret));
}

export function sign(secret: Uint8Array, message: Uint8Array): string {
  return b64url.encode(ed25519.sign(message, secret));
}

/**
 * What a device signs for each relay request. Must match the relay's `signingMessage`.
 */
export function signingMessage(method: string, pathAndQuery: string, time: string, body: string) {
  return utf8Bytes(`${method.toUpperCase()}\n${pathAndQuery}\n${time}\n${sha256Hex(body)}`);
}
