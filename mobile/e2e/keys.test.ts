/// <reference types="node" />
// Key wrapping and invite codes (Node test runner: the crypto libraries are ESM-only).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';

import {
  b64url,
  deviceIdFor,
  open,
  safetyCode,
  seal,
  sealContext,
  unwrapKey,
  utf8Bytes,
  wrapKey,
} from '../src/sync/crypto';
import { decodeInvite, encodeInvite } from '../src/sync/invite';
import { random } from './phone';

describe('wrapped family keys', () => {
  it('open for the recipient and the sender only', () => {
    const [a, b, c] = [random(32), random(32), random(32)];
    const key = random(32);
    const context = sealContext.wrap('family', 1, deviceIdFor(b));
    const wrapped = wrapKey(a, deviceIdFor(b), key, random, context);
    assert.deepEqual(unwrapKey(b, deviceIdFor(a), wrapped, context), key);
    assert.deepEqual(unwrapKey(a, deviceIdFor(b), wrapped, context), key);
    assert.throws(() => unwrapKey(c, deviceIdFor(a), wrapped, context));
  });

  it('cannot be replayed for another epoch (#41)', () => {
    const [a, b] = [random(32), random(32)];
    const wrapped = wrapKey(a, deviceIdFor(b), random(32), random, sealContext.wrap('f', 1, 'b'));
    assert.throws(() => unwrapKey(b, deviceIdFor(a), wrapped, sealContext.wrap('f', 2, 'b')));
  });

  it('refuse wraps sealed without context', () => {
    const [a, b] = [random(32), random(32)];
    const legacy = wrapKey(a, deviceIdFor(b), random(32), random, 'x').slice('v2.'.length);
    assert.throws(() => unwrapKey(b, deviceIdFor(a), legacy, 'x'));
  });
});

describe('sealed data', () => {
  const key = random(32);

  it('only opens under the context it was sealed for (#41)', () => {
    const sealed = seal(key, 'hello', random, sealContext.change('f', 0));
    assert.equal(open(key, sealed, sealContext.change('f', 0)), 'hello');
    assert.throws(() => open(key, sealed, sealContext.change('f', 1)));
    assert.throws(() => open(key, sealed, sealContext.reminder('f')));
    assert.throws(() => open(key, sealed, sealContext.change('other', 0)));
  });

  it('opens data from before 0.7 only when asked to', () => {
    const nonce = random(24);
    const ciphertext = xchacha20poly1305(key, nonce).encrypt(utf8Bytes('old'));
    const legacy = b64url.encode(new Uint8Array([...nonce, ...ciphertext]));
    assert.equal(open(key, legacy, 'any', { legacy: true }), 'old');
    assert.throws(() => open(key, legacy, 'any'));
  });
});

describe('safety codes', () => {
  it('match for the same phones in any order and differ otherwise', () => {
    const [a, b, c] = [random(32), random(32), random(32)].map(deviceIdFor);
    const code = safetyCode('family', [a, b]);
    assert.match(code, /^\d{4}( \d{4}){4}$/);
    assert.equal(safetyCode('family', [b, a]), code);
    assert.notEqual(safetyCode('family', [a, b, c]), code);
    assert.notEqual(safetyCode('other', [a, b]), code);
  });
});

describe('invite codes', () => {
  const invite = {
    relayUrl: 'https://relay.example',
    familyId: 'family-id-123456',
    familyKey: random(32),
    keyEpoch: 2,
    inviteSecret: 'secret-secret-secret',
    inviterId: deviceIdFor(random(32)),
  };

  it('carry the key epoch and the inviting phone', () => {
    assert.deepEqual(decodeInvite(encodeInvite(invite)), invite);
  });

  function withPayload(change: (payload: Record<string, unknown>) => void): string {
    const code = encodeInvite(invite);
    const payload = JSON.parse(Buffer.from(code.slice(4), 'base64url').toString());
    change(payload);
    return 'BT1.' + Buffer.from(JSON.stringify(payload)).toString('base64url');
  }

  it('default to epoch 0 and no inviter for codes from older versions', () => {
    const old = decodeInvite(
      withPayload((p) => {
        delete p.e;
        delete p.d;
      }),
    );
    assert.equal(old.keyEpoch, 0);
    assert.equal(old.inviterId, null);
  });

  it('reject an inviter that is not a device id', () => {
    assert.throws(() => decodeInvite(withPayload((p) => (p.d = 'not-a-key'))));
  });
});
