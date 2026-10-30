import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createThrottle } from '../src/throttle.js';

// Repeated wrong passwords from one visitor slow that visitor down, growing each time,
// without affecting anyone else or lasting forever.

test('a visitor gets free tries, then growing waits; success clears it; others are unaffected', () => {
  let now = 1_000_000;
  const t = createThrottle({ freeTries: 5, maxWaitMs: 60_000, forgetAfterMs: 600_000, now: () => now });
  for (let i = 0; i < 5; i += 1) {
    assert.equal(t.waitMs('1.2.3.4'), 0, `try ${i + 1} is free`);
    t.failed('1.2.3.4');
  }
  assert.equal(t.waitMs('1.2.3.4'), 1_000, 'first wait is a second');
  assert.equal(t.waitMs('9.9.9.9'), 0, 'someone else is not slowed');
  now += 500;
  assert.equal(t.waitMs('1.2.3.4'), 500, 'counts down');
  now += 500;
  assert.equal(t.waitMs('1.2.3.4'), 0);
  t.failed('1.2.3.4');
  assert.equal(t.waitMs('1.2.3.4'), 2_000, 'doubles');
  for (let i = 0; i < 10; i += 1) { now += 100_000; t.failed('1.2.3.4'); }
  assert.equal(t.waitMs('1.2.3.4'), 60_000, 'capped');
  now += 60_000;
  t.succeeded('1.2.3.4');
  assert.equal(t.waitMs('1.2.3.4'), 0, 'a correct password clears the record');
});

test('old records are forgotten so the table cannot grow without bound', () => {
  let now = 0;
  const t = createThrottle({ freeTries: 1, forgetAfterMs: 1_000, now: () => now });
  for (let i = 0; i < 1000; i += 1) { t.failed(`10.0.0.${i}`); t.failed(`10.0.0.${i}`); }
  assert.equal(t.waitMs('10.0.0.5') > 0, true);
  now += 1_001;
  assert.equal(t.waitMs('10.0.0.5'), 0, 'forgotten after the quiet period');
  assert.equal(t.size(), 0);
});
