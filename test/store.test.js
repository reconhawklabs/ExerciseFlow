import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore, StoreError } from '../src/store.js';

const enclaves = new Set(['Enclave 1', 'Enclave 2']);
const hasEnclave = (name) => enclaves.has(name);
const ids = new Set(['01.01', '01.02']);
const hasInject = (id) => ids.has(id);
const freshFile = () => join(mkdtempSync(join(tmpdir(), 'store-')), 'data', 'state.json');

test('starts empty when the file is missing', () => {
  assert.deepEqual(createStore({ file: freshFile(), hasEnclave, hasInject }).getState(), {});
});

test('persists a status across store instances', () => {
  const file = freshFile();
  const cell = createStore({ file, hasEnclave, hasInject }).setStatus('Enclave 1', '01.01', 'complete');
  assert.equal(cell.status, 'complete');
  const again = createStore({ file, hasEnclave, hasInject }).getState();
  assert.equal(again['Enclave 1']['01.01'].status, 'complete');
  assert.ok(!Number.isNaN(Date.parse(again['Enclave 1']['01.01'].changedAt)));
});

test('rejects unknown enclave, inject or status without writing', () => {
  const file = freshFile();
  const store = createStore({ file, hasEnclave, hasInject });
  store.setStatus('Enclave 1', '01.01', 'blocked');
  const before = readFileSync(file, 'utf8');
  assert.throws(() => store.setStatus('Enclave 9', '01.01', 'complete'), StoreError);
  assert.throws(() => store.setStatus('Enclave 1', '99.99', 'complete'), StoreError);
  assert.throws(() => store.setStatus('Enclave 1', '01.01', 'done'), StoreError);
  assert.equal(readFileSync(file, 'utf8'), before);
});

test('getState returns a copy callers cannot change', () => {
  const store = createStore({ file: freshFile(), hasEnclave, hasInject });
  store.setStatus('Enclave 1', '01.01', 'complete');
  const copy = store.getState();
  copy['Enclave 1']['01.01'].status = 'blocked';
  copy['Enclave 2'] = {};
  assert.equal(store.getState()['Enclave 1']['01.01'].status, 'complete');
  assert.equal(store.getState()['Enclave 2'], undefined);
});

test('survives a corrupt state file', () => {
  const file = freshFile();
  createStore({ file, hasEnclave, hasInject }).setStatus('Enclave 1', '01.01', 'complete');
  writeFileSync(file, '{not json');
  const store = createStore({ file, hasEnclave, hasInject });
  assert.deepEqual(store.getState(), {});
  const dir = join(file, '..');
  assert.ok(readdirSync(dir).some((f) => /^state\.json\.corrupt-\d+$/.test(f)));
});

test('keeps progress on removed enclaves and injects, but refuses new changes to them', () => {
  const file = freshFile();
  const everything = () => true;
  const wide = createStore({ file, hasEnclave: everything, hasInject: everything });
  wide.setStatus('Old Enclave', '01.01', 'complete');
  wide.setStatus('Enclave 1', '00.00', 'complete');
  const store = createStore({ file, hasEnclave, hasInject });
  assert.equal(store.getState()['Old Enclave']['01.01'].status, 'complete', 'kept so re-adding restores it');
  assert.equal(store.getState()['Enclave 1']['00.00'].status, 'complete');
  assert.throws(() => store.setStatus('Old Enclave', '01.01', 'blocked'), StoreError);
  assert.throws(() => store.setStatus('Enclave 1', '00.00', 'blocked'), StoreError);
});
