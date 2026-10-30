import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../src/store.js';
import { startApp, cookieFor } from './helpers.js';

// A change to one cell must never carry a stale copy of other cells with it.
// Scenario: two staff have the edit page open for the same enclave. One sets an
// inject that the other's page never saw; the other then changes a different
// inject. Neither change may clobber the other.

let ctx, cookie;
before(async () => { ctx = await startApp(); cookie = await cookieFor(ctx.base); });
after(async () => { await ctx.close(); });

const put = (enclave, injectId, status) =>
  fetch(`${ctx.base}/api/status`, {
    method: 'PUT',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ enclave, injectId, status }),
  });
const state = async () => (await fetch(`${ctx.base}/api/state`, { headers: { cookie } }).then((r) => r.json())).state;

test('a second editor with a stale page does not overwrite the first editor’s change', async () => {
  // User 2 marks 01.01 complete (User 1's page still shows it Not Started).
  assert.equal((await put('Enclave 1', '01.01', 'complete')).status, 200);
  // User 1, knowing nothing of that, changes a different inject.
  assert.equal((await put('Enclave 1', '01.02', 'blocked')).status, 200);
  const s = await state();
  assert.equal(s['Enclave 1']['01.01'].status, 'complete', 'first editor’s change survived');
  assert.equal(s['Enclave 1']['01.02'].status, 'blocked', 'second editor’s change applied');
});

test('setStatus preserves other cells when writing one', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'conc-')), 'state.json');
  const store = createStore({ file, hasEnclave: (e) => e === 'E1', hasInject: (id) => ['a', 'b', 'c'].includes(id) });
  store.setStatus('E1', 'a', 'complete');
  store.setStatus('E1', 'b', 'in_progress');
  store.setStatus('E1', 'c', 'blocked');
  // Re-writing 'b' must leave 'a' and 'c' exactly as they were.
  store.setStatus('E1', 'b', 'complete');
  const s = store.getState().E1;
  assert.equal(s.a.status, 'complete');
  assert.equal(s.b.status, 'complete');
  assert.equal(s.c.status, 'blocked');
});
