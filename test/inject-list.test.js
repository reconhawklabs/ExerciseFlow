import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadInjects } from '../src/injects.js';
import { createInjectList, InjectError } from '../src/inject-list.js';

function freshList() {
  const file = join(mkdtempSync(join(tmpdir(), 'injlist-')), 'injects.json');
  copyFileSync('test/fixtures/legacy-injects.json', file);
  return { file, list: createInjectList({ file, doc: loadInjects(file) }) };
}

const NEW = { id: '01.03a', day: 1, time: '09:45', title: 'Phishing Follow-up', category: 'RED', icon: 'chip' };

test('an added inject lands in day/time order, is saved, and survives a restart', () => {
  const { file, list } = freshList();
  const added = list.add(NEW);
  assert.deepEqual(added, { ...NEW, time: '0945' });
  const ids = list.get().injects.map((i) => i.id);
  assert.equal(ids[ids.indexOf('01.03') + 1], '01.03a', 'sits after 09:30, before 10:30');
  assert.ok(list.has('01.03a'));

  const reloaded = loadInjects(file);
  assert.deepEqual(reloaded.injects.map((i) => i.id), ids);
  assert.equal(reloaded.days.length, 3, 'day themes are kept');
});

test('a bad inject is refused with a clear message and nothing is written', () => {
  const { file, list } = freshList();
  const before = readFileSync(file, 'utf8');
  const cases = [
    [{ ...NEW, id: '01.01' }, /already exists/],
    [{ ...NEW, id: '' }, /ID/],
    [{ ...NEW, id: '01/03' }, /ID/],
    [{ ...NEW, id: '__proto__' }, /ID/],
    [{ ...NEW, day: 4 }, /day/i],
    [{ ...NEW, category: 'AI_RED' }, /category/i],
    [{ ...NEW, time: '2530' }, /time/i],
    [{ ...NEW, time: '930' }, /time/i],
    [{ ...NEW, title: '  ' }, /title/i],
    [{ ...NEW, category: 'BLUE' }, /category/i],
  ];
  for (const [input, message] of cases) {
    assert.throws(() => list.add(input), (err) => err instanceof InjectError && message.test(err.message), JSON.stringify(input));
  }
  assert.equal(readFileSync(file, 'utf8'), before);
  assert.equal(list.get().injects.length, 12);
});

test('remove deletes and saves; unknown IDs are refused; the list may become empty', () => {
  const { file, list } = freshList();
  list.remove('01.02a');
  assert.equal(list.has('01.02a'), false);
  assert.equal(loadInjects(file).injects.length, 11);

  assert.throws(() => list.remove('01.02a'), (err) => err instanceof InjectError && err.status === 404);

  for (const { id } of list.get().injects) list.remove(id);
  assert.equal(loadInjects(file).injects.length, 0, 'a new exercise can start from nothing');
});

test('days can be added and renamed; removing a day takes its injects and moves later days up', () => {
  const { file, list } = freshList();
  const day3Ids = list.get().injects.filter((i) => i.day === 3).map((i) => i.id);

  assert.deepEqual(list.addDay('  Recovery  '), { day: 4, theme: 'Recovery' });
  list.add({ ...NEW, id: '04.01', day: 4 });
  list.setTheme(1, 'Kickoff');
  assert.throws(() => list.add({ ...NEW, id: '05.01', day: 5 }), /day must be 1 to 4/i);

  const { removedInjects } = list.removeDay(2);
  assert.equal(removedInjects.length, 4);
  const { days, injects } = loadInjects(file);
  assert.deepEqual(days.map((d) => [d.day, d.theme]), [
    [1, 'Kickoff'],
    [2, 'Charlie phase'],
    [3, 'Recovery'],
  ]);
  assert.deepEqual(injects.filter((i) => i.day === 2).map((i) => i.id), day3Ids, 'old Day 3 is now Day 2');
  assert.equal(injects.find((i) => i.id === '04.01').day, 3);

  assert.throws(() => list.removeDay(9), (err) => err instanceof InjectError && err.status === 404);
  list.removeDay(1);
  list.removeDay(1);
  assert.throws(() => list.removeDay(1), /last day/);
});

test('older inject files load with general categories and keep their icons', () => {
  const { injects } = loadInjects('test/fixtures/legacy-injects.json');
  const byId = Object.fromEntries(injects.map((i) => [i.id, i]));
  assert.deepEqual([byId['01.02a'].category, byId['01.02a'].icon], ['RED', 'chip']);
  assert.deepEqual([byId['01.04'].category, byId['01.04'].icon], ['RED', 'person']);
  assert.deepEqual([byId['01.01'].category, byId['01.01'].icon], ['WHITE', 'flag']);
  assert.equal(injects.some((i) => /AI_RED|INPERSON_RED/.test(i.category)), false);

  const { list } = freshList();
  assert.equal(list.add({ ...NEW, icon: '' }).icon, '', 'icon is optional');
  assert.throws(() => list.add({ ...NEW, id: 'x1', icon: 'unicorn' }), /icon/i);
  assert.equal(list.add({ ...NEW, id: 'x2', category: 'GOLD', icon: 'shield' }).category, 'GOLD');
});

test('a change made from an out-of-date view of the days is refused, not applied to the wrong day', () => {
  const { list } = freshList();
  const seen = list.get().daysRev; // what both editors' pages show
  list.removeDay(2); // editor A: old Day 3 is now Day 2

  // Editor B still sees the old numbering; each of these would hit the wrong day.
  const stale = (fn) => assert.throws(fn, (err) => err instanceof InjectError && err.status === 409 && /days changed/i.test(err.message));
  stale(() => list.removeDay(2, seen));
  stale(() => list.setTheme(2, 'Oops', seen));
  stale(() => list.add({ ...NEW, id: '02.99', day: 2, daysRev: seen }));
  assert.equal(list.get().days.length, 2, 'nothing else was removed');

  const fresh = list.get().daysRev;
  assert.notEqual(fresh, seen);
  list.setTheme(2, 'Fine', fresh);
  list.setTheme(2, 'Theme edits leave the numbering alone', fresh);
  assert.equal(list.add({ ...NEW, id: '02.99', day: 2, daysRev: fresh }).day, 2);
});
