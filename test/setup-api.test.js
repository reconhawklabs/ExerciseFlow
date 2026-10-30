import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, login } from './helpers.js';

// No .env password: the app starts in setup mode and the first visitor with the
// setup code (printed in the server window) chooses the password.

let ctx;
before(async () => { ctx = await startApp({ password: null }); });
after(async () => { await ctx.close(); });

const get = (path, headers = {}) => fetch(`${ctx.base}${path}`, { redirect: 'manual', headers });
const setup = (fields) =>
  fetch(`${ctx.base}/setup`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  });
const NEW_PASSWORD = 'a long enough password';

test('before setup, every page leads to setup and the API stays closed', async () => {
  for (const path of ['/', '/progress', '/edit', '/login']) {
    const res = await get(path);
    assert.equal(res.status, 302, path);
    assert.equal(res.headers.get('location'), '/setup', path);
  }
  const page = await get('/setup');
  assert.equal(page.status, 200);
  assert.match(await page.text(), /setup code/i);
  assert.equal((await get('/api/state')).status, 503);
  assert.equal((await login(ctx.base, '')).headers.get('location'), '/setup');

  const wrong = await setup({ code: 'AAAAA-AAAAA', password: NEW_PASSWORD, confirm: NEW_PASSWORD });
  assert.equal(wrong.headers.get('location'), '/setup?error=code');
  assert.equal(wrong.headers.get('set-cookie'), null);
});

test('finishing setup signs you in; then the new password works and setup is gone', async () => {
  const done = await setup({ code: ctx.passwords.setupCode(), password: NEW_PASSWORD, confirm: NEW_PASSWORD });
  assert.equal(done.status, 303);
  assert.equal(done.headers.get('location'), '/edit#platform');
  const cookie = done.headers.get('set-cookie').split(';')[0];
  assert.equal((await get('/api/state', { cookie })).status, 200);

  assert.equal((await get('/setup')).headers.get('location'), '/login');
  assert.equal((await setup({ code: 'x', password: 'another one!', confirm: 'another one!' })).headers.get('location'), '/login');
  const relogin = await login(ctx.base, NEW_PASSWORD);
  assert.equal(relogin.headers.get('location'), '/');
});
