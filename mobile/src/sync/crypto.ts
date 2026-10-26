import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { ed25519 } from '@noble/curves/ed25519.js';
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
