import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadInjects } from '../src/injects.js';

test('the legacy fixture (an older file with event-specific categories) still loads', () => {
  const { days, injects } = loadInjects('test/fixtures/legacy-injects.json');
  assert.equal(injects.length, 12);
  assert.equal(days.length, 3);
  assert.deepEqual([1, 2, 3].map((d) => injects.filter((i) => i.day === d).length), [5, 4, 3]);
  assert.equal(injects.at(-1).id, '03.03');
  const byId = Object.fromEntries(injects.map((i) => [i.id, i]));
  assert.equal(byId['02.02'].category, 'LEGAL');
  assert.equal(byId['02.03'].category, 'RED');
  assert.equal(byId['03.03'].time, '1200');
});

test('rejects bad inject data', () => {
  const dir = mkdtempSync(join(tmpdir(), 'inj-'));
  const write = (injects) => {
    const file = join(dir, `${Math.random()}.json`);
    writeFileSync(file, JSON.stringify({ days: [{ day: 1, theme: 't' }], injects }));
    return file;
  };
  const ok = { id: '01.01', day: 1, time: '0800', title: 'x', category: 'WHITE' };
  assert.throws(() => loadInjects(write([{ ...ok, category: 'BLUE' }])), /category/);
  assert.throws(() => loadInjects(write([ok, ok])), /already exists/);
  assert.throws(() => loadInjects(write([{ ...ok, day: 4 }])), /day/);
  assert.throws(() => loadInjects(write([{ ...ok, time: '8:00' }])), /time/);
});

test('the shipped sample inject list is valid and uses only general categories', () => {
  const { days, injects } = loadInjects('data/sample-injects.json');
  assert.equal(days.length, 2);
  assert.ok(injects.length >= 8);
  assert.ok(injects.every((i) => ['WHITE', 'GOLD', 'EXCON', 'INTEL', 'LEGAL', 'RED', 'OTHER'].includes(i.category)));
});
