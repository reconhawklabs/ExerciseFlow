import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHub } from '../src/hub.js';
import { startApp, cookieFor } from './helpers.js';

// Adding and removing injects from the edit page: saved, pushed live to every
// open board, and status progress on a removed inject comes back if re-added.

let ctx, hub, cookie;
before(async () => {
  hub = createHub({ heartbeatMs: 1000 });
  ctx = await startApp({ hub });
  cookie = await cookieFor(ctx.base);
});
after(async () => {
  hub.close();
  await ctx.close();
});

const call = (method, path, body) =>
  fetch(`${ctx.base}${path}`, {
    method,
    headers: { cookie, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const ids = async () => (await (await call('GET', '/api/state')).json()).injects.map((i) => i.id);
const statusOf = async (enclave, id) => (await (await call('GET', '/api/state')).json()).state[enclave]?.[id]?.status;

function collectEvents() {
  const controller = new AbortController();
  const chunks = [];
  const done = fetch(`${ctx.base}/api/events`, { headers: { cookie }, signal: controller.signal })
    .then(async (res) => { for await (const c of res.body) chunks.push(Buffer.from(c).toString()); })
    .catch(() => {});
  return { text: () => chunks.join(''), close: () => { controller.abort(); return done; } };
}

const NEW = { id: '03.21', day: 3, time: '1600', title: 'Hotwash', category: 'WHITE' };

test('add, track, remove and re-add an inject', async () => {
  const events = collectEvents();
  await new Promise((r) => setTimeout(r, 100));

  const added = await call('POST', '/api/injects', NEW);
  assert.equal(added.status, 201);
  assert.equal((await ids()).at(-1), '03.21');
  assert.equal((await call('PUT', '/api/status', { enclave: 'Enclave 1', injectId: '03.21', status: 'complete' })).status, 200);

  const removed = await call('DELETE', '/api/injects/03.21');
  assert.equal(removed.status, 200);
  assert.ok(!(await ids()).includes('03.21'));
  const late = await call('PUT', '/api/status', { enclave: 'Enclave 1', injectId: '03.21', status: 'blocked' });
  assert.equal(late.status, 400, 'a stale page cannot set a removed inject');

  assert.equal((await call('POST', '/api/injects', NEW)).status, 201);
  assert.equal(await statusOf('Enclave 1', '03.21'), 'complete', 'progress came back with the inject');

  await new Promise((r) => setTimeout(r, 100));
  await events.close();
  assert.equal((events.text().match(/event: injects/g) ?? []).length, 3, 'every change is pushed live');
});

test('bad requests are refused and change nothing', async () => {
  const before = await ids();
  assert.equal((await call('POST', '/api/injects', { ...NEW, id: '01.01' })).status, 400);
  assert.equal((await call('POST', '/api/injects', { ...NEW, time: 'soon' })).status, 400);
  const bad = await fetch(`${ctx.base}/api/injects`, { method: 'POST', headers: { cookie }, body: '{' });
  assert.equal(bad.status, 400);
  assert.equal((await call('DELETE', '/api/injects/99.99')).status, 404);
  assert.deepEqual(await ids(), before);
});

test('inject changes need a login', async () => {
  const res = await fetch(`${ctx.base}/api/injects`, { method: 'POST', body: JSON.stringify(NEW) });
  assert.equal(res.status, 401);
});
