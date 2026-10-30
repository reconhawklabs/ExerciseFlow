import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';

const FOUR = 'A,B,C,D';

test('parses a full env', () => {
  const c = loadConfig({
    APP_PASSWORD: 'pw',
    ENCLAVES: ' Enclave 1 , Enclave 2,Enclave 3,Enclave 4 ',
    PORT: '9000',
    EXERCISE_DAY1_DATE: '2026-10-27',
  });
  assert.deepEqual(c.enclaves, ['Enclave 1', 'Enclave 2', 'Enclave 3', 'Enclave 4']);
  assert.equal(c.port, 9000);
  assert.equal(c.day1Date, '2026-10-27');
  assert.equal(c.stateFile, 'state.json');
  assert.equal(c.password, 'pw');
});

test('APP_PASSWORD is optional: without it, first-time setup chooses one', () => {
  const c = loadConfig({ ENCLAVES: FOUR });
  assert.equal(c.password, null);
  assert.equal(c.sessionSecret, null);
  assert.equal(loadConfig({ APP_PASSWORD: '   ', ENCLAVES: FOUR }).password, null);
  assert.equal(c.authFile, 'auth.json');
});

test('enclaves: optional, 1–15 when set', () => {
  const names = (n) => Array.from({ length: n }, (_, i) => `E${i + 1}`).join(',');
  assert.throws(() => loadConfig({ APP_PASSWORD: 'pw', ENCLAVES: names(16) }), /1.*15/);
  assert.equal(loadConfig({ APP_PASSWORD: 'pw', ENCLAVES: names(15) }).enclaves.length, 15);
  assert.deepEqual(loadConfig({ APP_PASSWORD: 'pw', ENCLAVES: 'Solo' }).enclaves, ['Solo']);
  assert.equal(loadConfig({ APP_PASSWORD: 'pw' }).enclaves.length, 4, 'a starter set when .env has none');
});

test('exercise name and column name come from .env, with general defaults', () => {
  const plain = loadConfig({ APP_PASSWORD: 'pw' });
  assert.deepEqual([plain.name, plain.unitName], ['Exercise', 'Enclave']);
  const set = loadConfig({ APP_PASSWORD: 'pw', EXERCISE_NAME: ' Ops Week ', UNIT_NAME: 'Lane' });
  assert.deepEqual([set.name, set.unitName], ['Ops Week', 'Lane']);
});

test('rejects duplicate enclave names', () => {
  assert.throws(() => loadConfig({ APP_PASSWORD: 'pw', ENCLAVES: 'A,B,C,A' }), /duplicate/i);
});

test('defaults and date validation', () => {
  const c = loadConfig({ APP_PASSWORD: 'pw', ENCLAVES: FOUR });
  assert.equal(c.port, 8080);
  assert.equal(c.day1Date, null);
  assert.throws(
    () => loadConfig({ APP_PASSWORD: 'pw', ENCLAVES: FOUR, EXERCISE_DAY1_DATE: '10/27' }),
    /EXERCISE_DAY1_DATE/,
  );
});

test('SESSION_SECRET is optional', () => {
  assert.equal(loadConfig({ APP_PASSWORD: 'pw', ENCLAVES: FOUR }).sessionSecret, null);
  assert.equal(loadConfig({ APP_PASSWORD: 'pw', ENCLAVES: FOUR, SESSION_SECRET: 's3' }).sessionSecret, 's3');
});

test('TIMEZONE: defaults to this computer’s zone; a bad name is refused with the setting named', () => {
  assert.equal(loadConfig({ APP_PASSWORD: 'pw' }).timeZone, Intl.DateTimeFormat().resolvedOptions().timeZone);
  assert.equal(loadConfig({ APP_PASSWORD: 'pw', TIMEZONE: 'Europe/Berlin' }).timeZone, 'Europe/Berlin');
  assert.throws(() => loadConfig({ APP_PASSWORD: 'pw', TIMEZONE: 'Mars/Olympus' }), /TIMEZONE/);
});

test('a bad .env value names the setting to fix', () => {
  assert.throws(() => loadConfig({ APP_PASSWORD: 'pw', EXERCISE_NAME: 'x'.repeat(81) }), /EXERCISE_NAME/);
  assert.throws(() => loadConfig({ APP_PASSWORD: 'pw', UNIT_NAME: 'x'.repeat(31) }), /UNIT_NAME/);
  assert.throws(() => loadConfig({ APP_PASSWORD: 'pw', ENCLAVES: 'A,b/c' }), /ENCLAVES/);
  assert.throws(() => loadConfig({ APP_PASSWORD: 'pw', EXERCISE_DAY1_DATE: '2026-02-31' }), /EXERCISE_DAY1_DATE/, 'no 31 February');
});
