import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHub } from '../src/hub.js';
import { createStore } from '../src/store.js';
import { startApp, cookieFor } from './helpers.js';

let ctx;
let hub;
let cookie;
before(async () => {
  hub = createHub({ heartbeatMs: 1000 });
  ctx = await startApp({ hub });
  cookie = await cookieFor(ctx.base);
});
after(async () => {
  hub.close();
  await ctx.close();
});

const put = (body) =>
  fetch(`${ctx.base}/api/status`, {
    method: 'PUT',
    headers: { cookie, 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
const getState = async () => (await fetch(`${ctx.base}/api/state`, { headers: { cookie } })).json();

async function openStream() {
  const controller = new AbortController();
  const res = await fetch(`${ctx.base}/api/events`, { headers: { cookie }, signal: controller.signal });
  const reader = res.body.getReader();
  let text = '';
  const until = async (pattern, ms = 1000) => {
    const deadline = Date.now() + ms;
    while (!pattern.test(text) && Date.now() < deadline) {
      const chunk = await Promise.race([reader.read(), new Promise((r) => setTimeout(() => r({ timeout: true }), deadline - Date.now()))]);
      if (chunk.timeout || chunk.done) break;
      text += new TextDecoder().decode(chunk.value);
    }
    return text;
  };
  return { res, until, close: () => controller.abort() };
}

test('state endpoint returns enclaves, injects and empty state', async () => {
  const s = await getState();
  assert.deepEqual(s.enclaves, ['Enclave 1', 'Enclave 2', 'Enclave 3', 'Enclave 4']);
  assert.equal(s.injects.length, 12);
  assert.equal(s.days.length, 3);
  assert.equal(s.day1Date, '2026-10-27');
  assert.deepEqual(s.state, {});
});

test('bad updates are rejected and change nothing', async () => {
  const stream = await openStream();
  await stream.until(/retry:/);
  for (const body of [
    { enclave: 'Enclave 9', injectId: '01.01', status: 'complete' },
    { enclave: 'Enclave 1', injectId: '99.99', status: 'complete' },
    { enclave: 'Enclave 1', injectId: '01.01', status: 'done' },
    '{',
  ]) {
    const res = await put(body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.ok((await res.json()).error);
  }
  assert.deepEqual((await getState()).state, {});
  assert.doesNotMatch(await stream.until(/event: status/, 200), /event: status/);
  stream.close();
});

test('a status update is saved and pushed to open streams', async () => {
  const stream = await openStream();
  assert.equal(stream.res.headers.get('content-type'), 'text/event-stream');
  assert.equal(stream.res.headers.get('cache-control'), 'no-cache, no-transform');
  assert.equal(stream.res.headers.get('x-accel-buffering'), 'no');
  await stream.until(/retry:/);
  const res = await put({ enclave: 'Enclave 1', injectId: '01.01', status: 'complete' });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).status, 'complete');
  assert.match(await stream.until(/event: status/), /"injectId":"01.01","status":"complete"/);
  stream.close();
  const reopened = createStore({ file: ctx.stateFile, hasEnclave: () => true, hasInject: () => true });
  assert.equal(reopened.getState()['Enclave 1']['01.01'].status, 'complete');
});

test('parallel edits to different enclaves both land', async () => {
  const [a, b] = await Promise.all([
    put({ enclave: 'Enclave 2', injectId: '01.02', status: 'in_progress' }),
    put({ enclave: 'Enclave 3', injectId: '01.02', status: 'blocked' }),
  ]);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  const { state } = await getState();
  assert.equal(state['Enclave 2']['01.02'].status, 'in_progress');
  assert.equal(state['Enclave 3']['01.02'].status, 'blocked');
});
