import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTimeZone, localDate, localClock, zoneLabel, exerciseDay } from '../public/shared/time.js';

const NY = 'America/New_York';

test('exercise day follows the exercise time zone, not the viewer’s', () => {
  const d1 = '2026-10-27';
  assert.equal(exerciseDay(d1, new Date('2026-10-27T12:00:00Z'), 3, NY), 1);
  assert.equal(exerciseDay(d1, new Date('2026-10-28T15:00:00Z'), 3, NY), 2);
  assert.equal(exerciseDay(d1, new Date('2026-10-29T15:00:00Z'), 3, NY), 3);
  assert.equal(exerciseDay(d1, new Date('2026-10-28T02:30:00Z'), 3, NY), 1, '22:30 in New York is still the 27th');
  assert.equal(exerciseDay(d1, new Date('2026-10-28T02:30:00Z'), 3, 'Europe/Berlin'), 2, 'but already the 28th in Berlin');
  assert.equal(exerciseDay(d1, new Date('2026-10-30T15:00:00Z'), 3, NY), null);
  assert.equal(exerciseDay(d1, new Date('2026-10-26T15:00:00Z'), 3, NY), null);
  assert.equal(exerciseDay(null, new Date('2026-10-27T12:00:00Z'), 3, NY), null);
  assert.equal(exerciseDay(d1, new Date('2026-10-30T15:00:00Z'), 5, NY), 4, 'longer exercises count further');
  assert.equal(exerciseDay(d1, new Date('2026-10-28T15:00:00Z'), 1, NY), null, 'one-day exercise');
});

test('date, 24-hour clock and zone label are in the given zone', () => {
  assert.equal(localDate(new Date('2026-10-28T02:30:00Z'), NY), '2026-10-27');
  assert.equal(localClock(new Date('2026-10-27T15:42:00Z'), NY), '11:42');
  assert.equal(localClock(new Date('2026-10-27T04:05:00Z'), NY), '00:05');
  assert.equal(localClock(new Date('2026-10-27T15:42:00Z'), 'Asia/Tokyo'), '00:42');
  assert.equal(zoneLabel(new Date('2026-10-27T15:42:00Z'), NY), 'EDT');
  assert.equal(zoneLabel(new Date('2026-12-01T15:42:00Z'), NY), 'EST');
});

test('only real time zone names are accepted', () => {
  assert.equal(isTimeZone('Europe/London'), true);
  assert.equal(isTimeZone('UTC'), true);
  assert.equal(isTimeZone('Mars/Olympus'), false);
  assert.equal(isTimeZone(''), false);
  assert.equal(isTimeZone(undefined), false);
});
