// "Edit platform" tab: exercise name, what columns are called, Day 1 date, days, and enclaves.
// Saved on the server over the .env values; every open page updates straight away.
import { plural } from '/shared/catalog.js';
import { addDay, addEnclave, removeDay, removeEnclave, setDayTheme, updateSettings } from '/js/save.js';
import { createDrafts, createRunner, field } from '/js/forms.js';
import { el } from '/js/el.js';

const drafts = createDrafts();
const runner = createRunner();

const button = (label, attrs = {}) => el('button', { type: 'button', class: 'mi-remove', disabled: runner.busy, ...attrs }, label);

// Every zone the browser knows, plus the saved one in case the list lacks it (e.g. 'UTC').
function zoneOptions(current) {
  const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  const all = zones.includes(current) ? zones : [current, ...zones];
  return all.map((zone) => [zone, zone.replaceAll('_', ' ')]);
}

function detailsForm(snap, view) {
  const saved = { 'p-name': snap.name, 'p-unit': snap.unitName, 'p-date': snap.day1Date ?? '', 'p-tz': snap.timeZone };
  const form = el(
    'form',
    { class: 'pf-form pf-details' },
    field('Exercise name', drafts.input('p-name', saved['p-name'], { maxlength: 80, required: true }), 'Shown in the top bar, page titles and sign-in page.'),
    field('Column name', drafts.input('p-unit', saved['p-unit'], { maxlength: 30, required: true }), 'What each column is called: Enclave, Lane, Team…'),
    field('Day 1 date', drafts.input('p-date', saved['p-date'], { type: 'date' }), 'Optional. Shows "DAY N" in the top bar.'),
    field('Time zone', drafts.select('p-tz', saved['p-tz'], zoneOptions(saved['p-tz'])), 'Used for the clock and for when each day starts.'),
    el('button', { type: 'submit', class: 'mi-add', disabled: runner.busy }, 'Save details'),
  );
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    // Send only what this editor changed, so it can't undo someone else's change to another field.
    const keys = { 'p-name': 'name', 'p-unit': 'unitName', 'p-date': 'day1Date', 'p-tz': 'timeZone' };
    const changes = Object.fromEntries(
      Object.entries(keys)
        .filter(([input]) => drafts.has(input) && drafts.value(input) !== saved[input])
        .map(([input, key]) => [key, drafts.value(input)]),
    );
    if (Object.keys(changes).length === 0) {
      runner.say('Nothing changed.', 'ok');
      return view.redraw();
    }
    await runner.run(view, 'Saving…', async () => {
      await updateSettings(changes);
      drafts.clear(...Object.keys(keys));
      return 'Saved. Every open board shows the new details.';
    });
  });
  return form;
}

function dayRow(day, snap, view) {
  const name = `p-theme-${day.day}`;
  const count = snap.injects.filter((i) => i.day === day.day).length;
  const theme = drafts.input(name, day.theme, { maxlength: 80, placeholder: 'Theme (optional)', 'aria-label': `Day ${day.day} theme` });
  const save = button('Save', { 'aria-label': `Save Day ${day.day} theme` });
  save.addEventListener('click', () =>
    runner.run(view, `Saving Day ${day.day}…`, async () => {
      await setDayTheme(day.day, drafts.value(name, day.theme), snap.daysRev);
      drafts.clear(name);
      return `Saved Day ${day.day}.`;
    }),
  );
  const remove = button('Remove', { 'aria-label': `Remove Day ${day.day}`, disabled: runner.busy || snap.days.length === 1 });
  remove.addEventListener('click', async () => {
    const later = snap.days.length > day.day ? ` Later days move up one (Day ${day.day + 1} becomes Day ${day.day}).` : '';
    const injects = count ? ` and its ${count} inject${count === 1 ? '' : 's'}` : '';
    const kept = count ? '\n\nTheir progress is kept, so adding an inject back with the same ID restores it.' : '';
    const ok = confirm(`Remove Day ${day.day}${injects}?${later}${kept}`);
    if (!ok) return;
    await runner.run(view, `Removing Day ${day.day}…`, async () => {
      const { removedInjects } = await removeDay(day.day, snap.daysRev);
      drafts.clear(...snap.days.map((d) => `p-theme-${d.day}`)); // day numbers shifted
      return `Removed Day ${day.day}${removedInjects.length ? ` and ${removedInjects.length} injects` : ''}.`;
    });
  });
  return el('div', { class: 'pf-row' }, el('b', { class: 'pf-day' }, `Day ${day.day}`), theme, el('span', { class: 'mi-cat' }, `${count} injects`), save, remove);
}

function addRow(name, placeholder, label, onAdd, attrs = {}) {
  const input = drafts.input(name, '', { placeholder, 'aria-label': placeholder, ...attrs });
  const form = el('form', { class: 'pf-row pf-add' }, input, el('button', { type: 'submit', class: 'mi-add', disabled: runner.busy }, label));
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    onAdd(drafts.value(name));
  });
  return form;
}

function daysSection(snap, view) {
  const add = addRow('p-newday', 'Theme for the new day (optional)', 'Add day', (theme) =>
    runner.run(view, 'Adding a day…', async () => {
      const { day } = await addDay(theme);
      drafts.clear('p-newday');
      return `Added Day ${day.day}. Its page is /day/${day.day}.`;
    }), { maxlength: 80 });
  return el(
    'section',
    { class: 'pf-section' },
    el('h2', { class: 'mi-head' }, `Days (${snap.days.length})`),
    snap.days.map((day) => dayRow(day, snap, view)),
    add,
  );
}

function unitRow(name, snap, view) {
  const remove = button('Remove', { 'aria-label': `Remove ${name}`, disabled: runner.busy || snap.enclaves.length === 1 });
  remove.addEventListener('click', async () => {
    const ok = confirm(`Remove "${name}" from every board?\n\nIts progress is kept and comes back if you add "${name}" again.`);
    if (!ok) return;
    await runner.run(view, `Removing ${name}…`, async () => {
      await removeEnclave(name);
      return `Removed ${name}. Add it back with the same name to restore its progress.`;
    });
  });
  return el('div', { class: 'pf-row' }, el('span', { class: 'pf-unit' }, name), remove);
}

function unitsSection(snap, view) {
  const units = plural(snap.unitName);
  const add = addRow('p-newunit', `New ${snap.unitName.toLowerCase()} name`, `Add ${snap.unitName.toLowerCase()}`, (name) =>
    runner.run(view, `Adding ${name}…`, async () => {
      const { added } = await addEnclave(name);
      drafts.clear('p-newunit');
      return `Added ${added}. It's the last column on every board.`;
    }), { maxlength: 40 });
  return el(
    'section',
    { class: 'pf-section' },
    el('h2', { class: 'mi-head' }, `${units} (${snap.enclaves.length})`),
    snap.enclaves.map((name) => unitRow(name, snap, view)),
    add,
  );
}

/** view.redraw() repaints from the current data; view.reload() re-fetches, then repaints. */
export function platformView(snap, view) {
  return el(
    'div',
    { class: 'mi pf' },
    el('p', { class: 'mi-hint' }, 'Changes here are saved on the server and take priority over the .env file. Every open page updates straight away.'),
    runner.note(),
    el('h2', { class: 'mi-head' }, 'Exercise details'),
    detailsForm(snap, view),
    el('div', { class: 'pf-cols' }, daysSection(snap, view), unitsSection(snap, view)),
  );
}
