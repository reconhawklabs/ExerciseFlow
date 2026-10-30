import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAuth } from '../src/auth.js';
import { createPasswords } from '../src/passwords.js';
import { loadConfig } from '../src/config.js';

const noFile = () => join(mkdtempSync(join(tmpdir(), 'auth-')), 'auth.json');
const envAuth = (password, secret) => createAuth({ passwords: createPasswords({ file: noFile(), envPassword: password, envSecret: secret }) });

test('password check trims input and rejects wrong values', async () => {
  const auth = envAuth('pw', 's');
  assert.equal(await auth.checkPassword('pw'), true);
  assert.equal(await auth.checkPassword(' pw '), true);
  assert.equal(await auth.checkPassword('nope'), false);
  assert.equal(await auth.checkPassword(''), false);
  assert.equal(await auth.checkPassword(undefined), false);
});

test('session tokens cannot be forged', () => {
  const auth = envAuth('pw', 's');
  const token = auth.token();
  assert.equal(auth.verify(token), true);
  assert.equal(auth.verify(`${token}x`), false);
  assert.equal(auth.verify('AAAA'), false);
  assert.equal(envAuth('pw', 'other').verify(token), false);
  assert.equal(auth.verify(''), false);
  assert.equal(auth.verify(undefined), false);
});

test('a restarted server still accepts existing logins (the secret is kept in data/)', () => {
  const file = noFile();
  const env = { APP_PASSWORD: 'pw', ENCLAVES: 'A,B,C,D' };
  const run = () => {
    const config = loadConfig(env);
    return createAuth({ passwords: createPasswords({ file, envPassword: config.password, envSecret: config.sessionSecret }) });
  };
  const token = run().token();
  assert.equal(run().verify(token), true);
  assert.notEqual(envAuth('pw', null).verify(token), true, 'another install has its own secret');
});

test('before first-time setup nothing can log in or hold a session', async () => {
  const auth = createAuth({ passwords: createPasswords({ file: noFile() }) });
  assert.equal(auth.token(), null);
  assert.equal(auth.verify(''), false);
  assert.equal(await auth.checkPassword('anything'), false);
});
