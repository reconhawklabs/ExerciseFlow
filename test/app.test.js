import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, login, cookieFor } from './helpers.js';

let ctx;
before(async () => { ctx = await startApp(); });
after(async () => { await ctx.close(); });

const get = (path, cookie) =>
  fetch(`${ctx.base}${path}`, { redirect: 'manual', headers: cookie ? { cookie } : {} });

test('unauthenticated requests go to login, API says 401, login page and CSS are public', async () => {
  for (const path of ['/', '/progress', '/edit', '/js/live.js']) {
    const res = await get(path);
    assert.equal(res.status, 302, path);
    assert.equal(res.headers.get('location'), '/login');
  }
  assert.equal((await get('/api/state')).status, 401);
  const page = await get('/login');
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /text\/html/);
  const css = await get('/css/base.css');
  assert.equal(css.status, 200);
  assert.match(css.headers.get('content-type'), /text\/css/);
});

test('login: wrong password is refused, right password sets a cookie', async () => {
  const wrong = await login(ctx.base, 'nope');
  assert.equal(wrong.status, 303);
  assert.equal(wrong.headers.get('location'), '/login?error=1');
  assert.equal(wrong.headers.get('set-cookie'), null);

  const right = await login(ctx.base);
  assert.equal(right.status, 303);
  assert.equal(right.headers.get('location'), '/');
  const setCookie = right.headers.get('set-cookie');
  assert.match(setCookie, /exflow=/);
  assert.match(setCookie, /HttpOnly/);
  assert.doesNotMatch(setCookie, /Secure/);

  const viaTunnel = await login(ctx.base, undefined, { 'x-forwarded-proto': 'https' });
  assert.match(viaTunnel.headers.get('set-cookie'), /Secure/);
});

test('logged-in users get every page', async () => {
  const cookie = await cookieFor(ctx.base);
  for (const path of ['/', '/progress', '/day/1', '/day/2', '/day/3', '/edit']) {
    const res = await get(path, cookie);
    assert.equal(res.status, 200, path);
    assert.match(res.headers.get('content-type'), /text\/html/, path);
  }
  assert.equal((await get('/day/4', cookie)).status, 404, 'only days that exist');
  assert.equal((await get('/day/0', cookie)).status, 404);
  assert.equal((await get('/nope', cookie)).status, 404);
});

test('static paths cannot escape the public folder, and odd URLs are a plain 404', async () => {
  const cookie = await cookieFor(ctx.base);
  assert.equal((await get('//', cookie)).status, 404);
  assert.equal((await get('/%E0%A4%A', cookie)).status, 404);
  assert.equal((await get('/js/..%2f..%2fserver.js', cookie)).status, 404);
  assert.equal((await get('/shared/..%2f..%2fsrc%2fconfig.js', cookie)).status, 404);
});

test('the open /css/ prefix cannot be used to reach gated assets without a login', async () => {
  // /css/..%2fjs%2flive.js decodes to /css/../js/live.js -> must not serve live.js unauthenticated
  assert.notEqual((await get('/css/..%2fjs%2flive.js')).status, 200);
  assert.notEqual((await get('/css/..%2foverview.html')).status, 200);
});

// Last in this file on purpose: it uses up this address's free login tries.
test('repeated wrong passwords from one address are slowed down, then the right one still works', async () => {
  const attempts = [];
  for (let i = 0; i < 7; i += 1) attempts.push((await login(ctx.base, 'wrong')).headers.get('location'));
  assert.deepEqual(attempts.slice(0, 5), Array(5).fill('/login?error=1'), 'first five are plain wrong-password answers');
  assert.equal(attempts[5], '/login?error=wait', 'then asked to wait');
  assert.equal((await login(ctx.base)).headers.get('location'), '/login?error=wait', 'even the right password waits it out');
  const viaProxy = await login(ctx.base, undefined, { 'cf-connecting-ip': '203.0.113.9' });
  assert.equal(viaProxy.headers.get('location'), '/', 'a different visitor through the tunnel is not affected');
});
