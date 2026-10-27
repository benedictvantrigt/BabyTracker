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

/** XChaCha20-Poly1305 with a random nonce; output is base64url(nonce || ciphertext). */
export function seal(key: Uint8Array, plaintext: string, random: RandomBytes): string {
  const nonce = random(NONCE_BYTES);
  const ciphertext = xchacha20poly1305(key, nonce).encrypt(utf8Bytes(plaintext));
  const out = new Uint8Array(NONCE_BYTES + ciphertext.length);
  out.set(nonce);
  out.set(ciphertext, NONCE_BYTES);
  return b64url.encode(out);
}

/** Inverse of `seal`. Throws when the data was not sealed with `key` or was tampered with. */
export function open(key: Uint8Array, sealed: string): string {
  const bytes = b64url.decode(sealed);
  const nonce = bytes.subarray(0, NONCE_BYTES);
  return bytesUtf8(xchacha20poly1305(key, nonce).decrypt(bytes.subarray(NONCE_BYTES)));
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

/** Seals a family key so only `recipientDeviceId` (and the sender) can open it. */
export function wrapKey(
  senderSecret: Uint8Array,
  recipientDeviceId: string,
  key: Uint8Array,
  random: RandomBytes,
): string {
  return seal(wrappingKey(senderSecret, recipientDeviceId), b64url.encode(key), random);
}

/** Opens a key wrapped by `senderDeviceId` for this device. Throws when it was not. */
export function unwrapKey(
  recipientSecret: Uint8Array,
  senderDeviceId: string,
  wrapped: string,
): Uint8Array {
  return b64url.decode(open(wrappingKey(recipientSecret, senderDeviceId), wrapped));
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
