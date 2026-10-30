import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STATUSES, statusOf, tally, summarize, unbrokenCount } from '../public/shared/progress.js';

const inj = (id, day) => ({ id, day, time: '0800', title: id, category: 'WHITE' });
const cell = (status) => ({ status, changedAt: '2026-10-27T12:00:00.000Z' });

test('status list is fixed', () => {
  assert.deepEqual(STATUSES, ['not_started', 'in_progress', 'blocked', 'complete']);
});

test('missing cells are not_started', () => {
  assert.equal(statusOf({}, 'E1', '01.01'), 'not_started');
});

test('tally counts each status and floors the percentage', () => {
  const injects = Array.from({ length: 29 }, (_, i) => inj(`i${i}`, 1));
  const enclaves = ['E1', 'E2', 'E3', 'E4', 'E5', 'E6'];
  const all = Object.fromEntries(
    enclaves.map((e) => [e, Object.fromEntries(injects.map((i) => [i.id, cell('complete')]))]),
  );
  assert.equal(tally(injects, enclaves, all).pct, 100);
  const almost = { ...all, E6: { ...all.E6, i28: cell('blocked') } };
  const t = tally(injects, enclaves, almost);
  assert.equal(t.total, 174);
  assert.equal(t.complete, 173);
  assert.equal(t.blocked, 1);
  assert.equal(t.pct, 99);
  const mixed = { E1: { i0: cell('in_progress'), i1: cell('blocked') } };
  const m = tally(injects, ['E1'], mixed);
  assert.deepEqual(
    [m.complete, m.in_progress, m.blocked, m.not_started, m.pct],
    [0, 1, 1, 27, 0],
  );
  assert.equal(tally([], ['E1'], {}).pct, 0);
});

test('summarize splits by day and enclave', () => {
  const injects = [inj('a', 1), inj('b', 1), inj('c', 2), inj('d', 3), inj('e', 5)];
  const state = { E1: { a: cell('complete'), c: cell('complete') } };
  const days = [1, 2, 3, 4, 5].map((day) => ({ day, theme: '' }));
  const s = summarize(injects.slice(0, 4), ['E1', 'E2'], state, days);
  assert.equal(summarize(injects, ['E1'], state, days).byDay[5].total, 1, 'any number of days');
  assert.equal(s.byDay[4].total, 0);
  assert.equal(s.overall.total, 8);
  assert.equal(s.overall.complete, 2);
  assert.equal(s.byDay[1].total, 4);
  assert.equal(s.byDay[2].total, 2);
  assert.equal(s.byDay[2].pct, 50);
  assert.equal(s.byDay[3].complete, 0);
  assert.equal(s.byEnclave.E1.total, 4);
  assert.equal(s.byEnclave.E1.pct, 50);
  assert.equal(s.byEnclave.E2.pct, 0);
});

test('unbroken progress stops at the first incomplete inject', () => {
  const injects = [inj('a', 1), inj('b', 1), inj('c', 1), inj('d', 1)];
  const st = (list) => ({ E1: Object.fromEntries(list.map((s, i) => [injects[i].id, cell(s)])) });
  assert.equal(unbrokenCount(injects, 'E1', st(['complete', 'complete', 'blocked', 'complete'])), 2);
  assert.equal(unbrokenCount(injects, 'E1', st(['in_progress', 'complete', 'complete', 'complete'])), 0);
  assert.equal(unbrokenCount(injects, 'E1', st(['complete', 'complete', 'complete', 'complete'])), 4);
});
