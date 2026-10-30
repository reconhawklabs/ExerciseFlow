import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createHub } from '../src/hub.js';

function fakeClient() {
  const req = new EventEmitter();
  const res = { written: '', head: null, writeHead(status, headers) { this.head = { status, headers }; }, write(s) { this.written += s; } };
  return { req, res };
}

test('hub sends events to every client, pings, and forgets closed clients', async () => {
  const hub = createHub({ heartbeatMs: 20 });
  const a = fakeClient();
  const b = fakeClient();
  hub.subscribe(a.req, a.res);
  hub.subscribe(b.req, b.res);
  assert.equal(a.res.head.status, 200);
  assert.equal(a.res.head.headers['Content-Type'], 'text/event-stream');
  assert.equal(a.res.head.headers['X-Accel-Buffering'], 'no');
  hub.broadcast('status', { enclave: 'E1', injectId: '01.01', status: 'complete' });
  for (const c of [a, b]) {
    assert.match(c.res.written, /event: status\ndata: \{"enclave":"E1","injectId":"01.01","status":"complete"\}\n\n/);
  }
  await new Promise((r) => setTimeout(r, 60));
  assert.match(a.res.written, /: ping\n\n/);
  a.req.emit('close');
  assert.equal(hub.size(), 1);
  hub.close();
});
