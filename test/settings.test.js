import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSettings } from '../src/settings.js';
import { UserError } from '../src/errors.js';

const DEFAULTS = Object.freeze({ name: 'From Env', unitName: 'Enclave', enclaves: ['A', 'B'], day1Date: null, timeZone: 'UTC' });
const freshFile = () => join(mkdtempSync(join(tmpdir(), 'settings-')), 'settings.json');

test('page settings override .env, only for what was set, and survive a restart', () => {
  const file = freshFile();
  const s = createSettings({ file, defaults: DEFAULTS });
  assert.deepEqual(s.get(), DEFAULTS, 'nothing set yet: .env values');
  assert.equal(existsSync(file), false);

  s.update({ name: '  Ops Week  ', day1Date: '2027-03-01', timeZone: 'Europe/Berlin' });
  s.addEnclave('Lane C');
  s.removeEnclave('A');

  const again = createSettings({ file, defaults: { ...DEFAULTS, unitName: 'Team' } });
  assert.deepEqual(again.get(), { name: 'Ops Week', unitName: 'Team', enclaves: ['B', 'Lane C'], day1Date: '2027-03-01', timeZone: 'Europe/Berlin' });
  assert.equal('unitName' in JSON.parse(readFileSync(file, 'utf8')), false, 'untouched fields stay with .env');
  assert.ok(again.hasEnclave('Lane C'));
  assert.equal(again.hasEnclave('A'), false);

  again.update({ day1Date: '' });
  assert.equal(again.get().day1Date, null, 'the date can be cleared');
});

test('bad settings are refused with a clear message and nothing is saved', () => {
  const file = freshFile();
  const s = createSettings({ file, defaults: DEFAULTS });
  const refused = (fn, message) => assert.throws(fn, (err) => err instanceof UserError && message.test(err.message));
  refused(() => s.update({ name: '   ' }), /name/i);
  refused(() => s.update({ name: 'x'.repeat(81) }), /name/i);
  refused(() => s.update({ unitName: '' }), /column/i);
  refused(() => s.update({ day1Date: '03/01/2027' }), /date/i);
  refused(() => s.update({ timeZone: 'Mars/Olympus' }), /time zone/i);
  refused(() => s.addEnclave('A'), /already/);
  refused(() => s.addEnclave(' '), /name/i);
  refused(() => s.addEnclave('a/b'), /name/i);
  assert.throws(() => s.removeEnclave('Nope'), (err) => err.status === 404);
  s.removeEnclave('A');
  refused(() => s.removeEnclave('B'), /last/);
  for (let i = 2; i <= 15; i += 1) s.addEnclave(`E${i}`);
  refused(() => s.addEnclave('E16'), /15/);
  assert.equal(s.get().name, 'From Env');
});
