import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHub } from '../src/hub.js';
import { startApp, cookieFor } from './helpers.js';

// The Edit Platform tab: exercise name, column name, days and enclaves, all changed
// at runtime, saved over .env values, and pushed live to every open page.

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
    redirect: 'manual',
    headers: { cookie, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const snapshot = async () => (await call('GET', '/api/state')).json();
const setStatus = (enclave, injectId, status) => call('PUT', '/api/status', { enclave, injectId, status });

function collectEvents() {
  const controller = new AbortController();
  const chunks = [];
  const done = fetch(`${ctx.base}/api/events`, { headers: { cookie }, signal: controller.signal })
    .then(async (res) => { for await (const c of res.body) chunks.push(Buffer.from(c).toString()); })
    .catch(() => {});
  return { text: () => chunks.join(''), close: () => { controller.abort(); return done; } };
}

test('name, column name and date are saved and shown everywhere, including the login page', async () => {
  const res = await call('PATCH', '/api/settings', { name: 'Ops Week 2027', unitName: 'Lane', day1Date: '2027-03-01', timeZone: 'Europe/London' });
  assert.equal(res.status, 200);
  const s = await snapshot();
  assert.deepEqual([s.name, s.unitName, s.day1Date, s.timeZone], ['Ops Week 2027', 'Lane', '2027-03-01', 'Europe/London']);
  const brand = await (await fetch(`${ctx.base}/api/brand`)).json();
  assert.deepEqual(brand, { name: 'Ops Week 2027' }, 'login page can show the name before sign-in');
  assert.equal((await call('PATCH', '/api/settings', { name: '' })).status, 400);
});

test('enclaves: add, track, remove, re-add with progress restored', async () => {
  const events = collectEvents();
  await new Promise((r) => setTimeout(r, 100));

  assert.equal((await call('POST', '/api/enclaves', { name: 'Red Lane' })).status, 201);
  assert.equal((await snapshot()).enclaves.at(-1), 'Red Lane');
  assert.equal((await setStatus('Red Lane', '01.01', 'complete')).status, 200);

  assert.equal((await call('DELETE', `/api/enclaves/${encodeURIComponent('Red Lane')}`)).status, 200);
  assert.ok(!(await snapshot()).enclaves.includes('Red Lane'));
  assert.equal((await setStatus('Red Lane', '01.01', 'blocked')).status, 400, 'a stale page cannot write to it');

  assert.equal((await call('POST', '/api/enclaves', { name: 'Red Lane' })).status, 201);
  assert.equal((await snapshot()).state['Red Lane']['01.01'].status, 'complete');
  assert.equal((await call('POST', '/api/enclaves', { name: 'Red Lane' })).status, 400, 'no duplicates');
  assert.equal((await call('DELETE', '/api/enclaves/Nobody')).status, 404);

  await new Promise((r) => setTimeout(r, 100));
  await events.close();
  assert.equal((events.text().match(/event: platform/g) ?? []).length, 3, 'each change is pushed live');
});

test('days: add one, it gets a page; remove one, its injects go and later days move up', async () => {
  const added = await call('POST', '/api/days', { theme: 'Hotwash' });
  assert.equal(added.status, 201);
  assert.deepEqual(await added.json(), { day: { day: 4, theme: 'Hotwash' } });
  assert.equal((await call('GET', '/day/4')).status, 200);

  assert.equal((await call('PUT', '/api/days/4', { theme: 'After Action' })).status, 200);
  assert.equal((await snapshot()).days.at(-1).theme, 'After Action');

  const before = await snapshot();
  const day1Count = before.injects.filter((i) => i.day === 1).length;
  const removed = await call('DELETE', '/api/days/1');
  assert.equal(removed.status, 200);
  assert.equal((await removed.json()).removedInjects.length, day1Count);
  const after = await snapshot();
  assert.equal(after.days.length, 3);
  assert.equal(after.days.at(-1).theme, 'After Action');
  assert.equal(after.injects[0].day, 1, 'old Day 2 is now Day 1');
  assert.equal((await call('GET', '/day/4')).status, 404);
  assert.equal((await call('DELETE', '/api/days/9')).status, 404);
});

test('platform changes need a login', async () => {
  for (const [method, path] of [['PATCH', '/api/settings'], ['POST', '/api/enclaves'], ['POST', '/api/days']]) {
    const res = await fetch(`${ctx.base}${path}`, { method, body: '{}' });
    assert.equal(res.status, 401, `${method} ${path}`);
  }
});
