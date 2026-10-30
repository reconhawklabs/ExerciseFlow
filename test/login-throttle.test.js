import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, login } from './helpers.js';

// The login slowdown must not be escapable by faking the visitor-address header.

const open = [];
after(async () => { for (const ctx of open) await ctx.close(); });

test('a forwarded address is ignored unless the request comes from a trusted proxy', async () => {
  const ctx = await startApp({ trustedProxies: new Set() }); // the test connection is not trusted
  open.push(ctx);
  for (let i = 0; i < 5; i += 1) await login(ctx.base, 'wrong', { 'cf-connecting-ip': `198.51.100.${i}` });
  const spoofed = await login(ctx.base, undefined, { 'cf-connecting-ip': '198.51.100.99' });
  assert.equal(spoofed.headers.get('location'), '/login?error=wait', 'new fake address, same real visitor, still slowed');
});

test('even with a trusted proxy, rotating addresses hits a site-wide limit', async () => {
  const ctx = await startApp(); // 127.0.0.1 is trusted by default
  open.push(ctx);
  let firstWait = null;
  for (let i = 0; i < 40; i += 1) {
    const res = await login(ctx.base, 'wrong', { 'cf-connecting-ip': `203.0.113.${i}` });
    if (res.headers.get('location') === '/login?error=wait') { firstWait = i; break; }
  }
  assert.ok(firstWait !== null && firstWait >= 20, `plenty of room for real users (waited at ${firstWait})`);
});

test('a burst of simultaneous wrong passwords does not all get checked', async () => {
  const ctx = await startApp({ password: null });
  open.push(ctx);
  const code = ctx.passwords.setupCode();
  await fetch(`${ctx.base}/setup`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, password: 'a real password', confirm: 'a real password' }).toString(),
  });
  const answers = await Promise.all(Array.from({ length: 12 }, () => login(ctx.base, 'wrong')));
  const checked = answers.filter((r) => r.headers.get('location') === '/login?error=1').length;
  assert.equal(checked, 5, 'only the free tries are actually checked; the rest are told to wait');
});
