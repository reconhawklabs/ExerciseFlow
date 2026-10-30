// "Manage injects" tab on the edit page: add and remove injects.
import { CATEGORY_LABELS, ICON_LABELS } from '/shared/catalog.js';
import { iconNode, injectIcon } from '/js/icons.js';
import { addInject, removeInject } from '/js/save.js';
import { createDrafts, createRunner, field } from '/js/forms.js';
import { el } from '/js/el.js';
import { hhmm } from '/js/dom.js';

const drafts = createDrafts();
const runner = createRunner();
const ICON_OPTIONS = [['', 'No icon'], ...Object.entries(ICON_LABELS)];

function iconPicker() {
  const preview = el('span', { class: 'mi-icon-preview', 'aria-hidden': 'true' }, iconNode(drafts.value('icon')));
  const pick = drafts.select('icon', '', ICON_OPTIONS, (name) => preview.replaceChildren(...[iconNode(name)].filter(Boolean)));
  return el('span', { class: 'mi-icon-pick' }, preview, pick);
}

function addForm(snap, view) {
  // A day removed by another editor can't stay selected.
  if (!snap.days.some((d) => String(d.day) === drafts.value('day', '1'))) drafts.clear('day');
  const dayOptions = snap.days.map(({ day, theme }) => [String(day), theme ? `Day ${day} · ${theme}` : `Day ${day}`]);
  const form = el(
    'form',
    { class: 'mi-form' },
    field('ID', drafts.input('id', '', { placeholder: '01.08', maxlength: 20, required: true, class: 'num' })),
    field('Day', drafts.select('day', '1', dayOptions)),
    field('Time', drafts.input('time', '', { placeholder: '0830', maxlength: 5, inputmode: 'numeric', required: true, class: 'num' })),
    field('Title', drafts.input('title', '', { placeholder: 'What happens', maxlength: 120, required: true })),
    field('Category', drafts.select('category', 'WHITE', Object.entries(CATEGORY_LABELS))),
    field('Icon (optional)', iconPicker()),
    el('button', { type: 'submit', class: 'mi-add', disabled: runner.busy }, runner.busy ? 'Adding…' : 'Add inject'),
  );
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const inject = {
      id: drafts.value('id'),
      day: Number(drafts.value('day', '1')),
      time: drafts.value('time'),
      title: drafts.value('title'),
      category: drafts.value('category', 'WHITE'),
      icon: drafts.value('icon', ''),
      daysRev: snap.daysRev, // refused if days were renumbered since this page loaded
    };
    await runner.run(view, 'Adding…', async () => {
      const { inject: added } = await addInject(inject);
      drafts.clear('id', 'time', 'title'); // keep day, category and icon for the next one
      return `Added ${added.id} (Day ${added.day}, ${hhmm(added.time)}).`;
    });
    document.querySelector('.mi-form [name="id"]')?.focus();
  });
  return form;
}

function removeButton(inject, view) {
  const btn = el('button', { type: 'button', class: 'mi-remove', disabled: runner.busy, 'aria-label': `Remove ${inject.id}` }, 'Remove');
  btn.addEventListener('click', async () => {
    const ok = confirm(
      `Remove inject ${inject.id} "${inject.title}"?\n\nIt disappears from every board. ` +
        `Its progress is kept, so adding ${inject.id} back restores it.`,
    );
    if (!ok) return;
    await runner.run(view, `Removing ${inject.id}…`, async () => {
      await removeInject(inject.id);
      return `Removed ${inject.id}. Add it back with the same ID to restore its progress.`;
    });
  });
  return btn;
}

function injectRows(snap, view) {
  const wrap = el('div', { class: 'edit-list' });
  for (const { day, theme } of snap.days) {
    const injects = snap.injects.filter((i) => i.day === day);
    wrap.append(el('div', { class: 'edit-day' }, el('b', {}, `Day ${day}`), el('span', {}, theme), injects.length ? null : el('i', {}, 'no injects yet')));
    for (const inject of injects) {
      wrap.append(
        el(
          'div',
          { class: 'edit-row mi-row' },
          injectIcon(inject),
          el('span', { class: 'inj-id num' }, inject.id),
          el('span', { class: 'inj-time num' }, hhmm(inject.time)),
          el('span', { class: 'edit-title' }, inject.title),
          el('span', { class: 'mi-cat' }, CATEGORY_LABELS[inject.category] ?? inject.category),
          removeButton(inject, view),
        ),
      );
    }
  }
  return wrap;
}

/** view.redraw() repaints from the current data; view.reload() re-fetches, then repaints. */
export function manageView(snap, view) {
  return el(
    'div',
    { class: 'mi' },
    el('h2', { class: 'mi-head' }, 'Add an inject'),
    addForm(snap, view),
    runner.note(),
    el('h2', { class: 'mi-head' }, `Current injects (${snap.injects.length})`),
    el('p', { class: 'mi-hint' }, 'New injects are placed by day and time. Changes show on every board straight away. Add or remove days on the Edit platform tab.'),
    injectRows(snap, view),
  );
}
