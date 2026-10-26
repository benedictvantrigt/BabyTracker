import { b64url, bytesUtf8, utf8Bytes } from './crypto';

const PREFIX = 'BT1.';

/** Everything a new phone needs to join: shown as a QR code or shared as text. */
export interface Invite {
  relayUrl: string;
  familyId: string;
  familyKey: Uint8Array;
  /** Single-use secret; the relay only knows its hash. */
  inviteSecret: string;
}

export function encodeInvite(invite: Invite): string {
  const payload = JSON.stringify({
    u: invite.relayUrl,
    f: invite.familyId,
    k: b64url.encode(invite.familyKey),
    i: invite.inviteSecret,
  });
  return PREFIX + b64url.encode(utf8Bytes(payload));
}

export class InvalidInviteError extends Error {
  constructor() {
    super('This is not a valid Baby Tracker invite code.');
  }
}

export function decodeInvite(code: string): Invite {
  const trimmed = code.trim().replace(/\s+/g, '');
  if (!trimmed.startsWith(PREFIX)) throw new InvalidInviteError();
  try {
    const p = JSON.parse(bytesUtf8(b64url.decode(trimmed.slice(PREFIX.length))));
    const familyKey = b64url.decode(p.k);
    if (
      typeof p.u !== 'string' ||
      !/^https?:\/\//.test(p.u) ||
      typeof p.f !== 'string' ||
      typeof p.i !== 'string' ||
      familyKey.length !== 32
    ) {
      throw new InvalidInviteError();
    }
    return { relayUrl: p.u, familyId: p.f, familyKey, inviteSecret: p.i };
  } catch {
    throw new InvalidInviteError();
  }
}
