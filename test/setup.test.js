import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPasswords } from '../src/passwords.js';
import { UserError } from '../src/errors.js';

const freshFile = () => join(mkdtempSync(join(tmpdir(), 'pw-')), 'data', 'auth.json');
const PASSWORD = 'correct horse battery';

test('first-time setup stores a salted hash, never the password, and it works after a restart', async () => {
  const file = freshFile();
  const first = createPasswords({ file });
  assert.equal(first.needsSetup(), true);
  assert.match(first.setupCode(), /^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
  assert.equal(await first.check(PASSWORD), false, 'nothing logs in before setup');

  first.completeSetup({ code: first.setupCode().toLowerCase().replace('-', ' '), password: PASSWORD, confirm: PASSWORD });
  assert.equal(first.needsSetup(), false);
  assert.equal(await first.check(PASSWORD), true);

  const saved = readFileSync(file, 'utf8');
  assert.doesNotMatch(saved, /correct horse/);
  if (process.platform !== 'win32') {
    // Windows has no Unix-style permission bits; its folders' own access rules apply there.
    assert.equal(statSync(file).mode & 0o777, 0o600, 'only the app owner can read it');
  }

  const again = createPasswords({ file });
  assert.equal(again.needsSetup(), false);
  assert.equal(await again.check(PASSWORD), true);
  assert.equal(await again.check('wrong password'), false);
  assert.equal(again.sessionSecret(), first.sessionSecret(), 'logins survive a restart');
});

test('setup refuses a wrong code, a short or mismatched password, and runs only once', async () => {
  const s = createPasswords({ file: freshFile() });
  const refused = (input, reason) =>
    assert.throws(() => s.completeSetup(input), (err) => err instanceof UserError && err.reason === reason, reason);
  refused({ code: 'AAAAA-AAAAA', password: PASSWORD, confirm: PASSWORD }, 'code');
  refused({ code: s.setupCode(), password: 'short', confirm: 'short' }, 'short');
  refused({ code: s.setupCode(), password: PASSWORD, confirm: `${PASSWORD}!` }, 'mismatch');
  assert.equal(s.needsSetup(), true);

  s.completeSetup({ code: s.setupCode(), password: PASSWORD, confirm: PASSWORD });
  refused({ code: 'anything', password: 'another password', confirm: 'another password' }, 'done');
  assert.equal(await s.check(PASSWORD), true);
});

test('after many wrong setup codes a fresh code is issued and announced', () => {
  const announced = [];
  const s = createPasswords({ file: freshFile(), onNewCode: (code) => announced.push(code) });
  const original = s.setupCode();
  const guess = () => assert.throws(() => s.completeSetup({ code: 'AAAAA-AAAAA', password: PASSWORD, confirm: PASSWORD }), /not right/);
  for (let i = 0; i < 49; i += 1) guess();
  assert.equal(s.setupCode(), original, 'still the same code');
  guess();
  assert.notEqual(s.setupCode(), original, 'rotated on the 50th wrong guess');
  assert.deepEqual(announced, [s.setupCode()]);
  s.completeSetup({ code: s.setupCode(), password: PASSWORD, confirm: PASSWORD });
  assert.equal(s.needsSetup(), false);
});

test('a password in .env wins: no setup, and the saved one is ignored', async () => {
  const file = freshFile();
  const stored = createPasswords({ file });
  stored.completeSetup({ code: stored.setupCode(), password: PASSWORD, confirm: PASSWORD });

  const env = createPasswords({ file, envPassword: 'from-env', envSecret: 'env-secret' });
  assert.equal(env.needsSetup(), false);
  assert.equal(await env.check('from-env'), true);
  assert.equal(await env.check(PASSWORD), false);
  assert.equal(env.sessionSecret(), 'env-secret');
});
