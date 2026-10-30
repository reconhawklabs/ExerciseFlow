import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStatic } from '../src/static.js';

// The packaged .exe serves pages from files embedded in it, keyed 'public/<path>'.

function fakeRes() {
  return {
    writeHead(status, headers) { this.status = status; this.headers = headers; },
    end(body) { this.body = body; },
  };
}

test('packaged mode serves embedded files with the right type, and 404s anything else', async () => {
  const embedded = { 'public/css/base.css': Buffer.from('body{}'), 'public/login.html': Buffer.from('<p>hi</p>') };
  const files = createStatic({ publicDir: null, readAsset: (key) => embedded[key] ?? null });

  const css = fakeRes();
  await files.serve(css, '/css/base.css');
  assert.equal(css.status, 200);
  assert.match(css.headers['Content-Type'], /text\/css/);
  assert.equal(css.body.toString(), 'body{}');

  for (const path of ['/css/missing.css', '/../server.js', '/data/auth.json']) {
    const res = fakeRes();
    await files.serve(res, path);
    assert.equal(res.status, 404, path);
  }
});
