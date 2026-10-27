/// <reference types="node" />
// Key wrapping and invite codes (Node test runner: the crypto libraries are ESM-only).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { deviceIdFor, unwrapKey, wrapKey } from '../src/sync/crypto';
import { decodeInvite, encodeInvite } from '../src/sync/invite';
import { random } from './phone';

describe('wrapped family keys', () => {
  it('open for the recipient and the sender only', () => {
    const [a, b, c] = [random(32), random(32), random(32)];
    const key = random(32);
    const wrapped = wrapKey(a, deviceIdFor(b), key, random);
    assert.deepEqual(unwrapKey(b, deviceIdFor(a), wrapped), key);
    assert.deepEqual(unwrapKey(a, deviceIdFor(b), wrapped), key);
    assert.throws(() => unwrapKey(c, deviceIdFor(a), wrapped));
  });
});

describe('invite codes', () => {
  const invite = {
    relayUrl: 'https://relay.example',
    familyId: 'family-id-123456',
    familyKey: random(32),
    keyEpoch: 2,
    inviteSecret: 'secret-secret-secret',
  };

  it('carry the key epoch', () => {
    assert.deepEqual(decodeInvite(encodeInvite(invite)), invite);
  });

  it('default to epoch 0 for codes from older versions', () => {
    const code = encodeInvite(invite);
    const payload = JSON.parse(Buffer.from(code.slice(4), 'base64url').toString());
    delete payload.e;
    const old = 'BT1.' + Buffer.from(JSON.stringify(payload)).toString('base64url');
    assert.equal(decodeInvite(old).keyEpoch, 0);
  });
});
