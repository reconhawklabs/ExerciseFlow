import { statusOf, tally, unbrokenCount, STATUS_LABELS } from '/shared/progress.js';
import { startLive } from '/js/live.js';
import { createTopbar } from '/js/topbar.js';
import { iconNode, injectIcon } from '/js/icons.js';
import { marker } from '/js/markers.js';
import { stackedBar, statusLegend } from '/js/bars.js';
import { el } from '/js/el.js';
import { hhmm } from '/js/dom.js';

const main = document.getElementById('app');

// Which view: /progress shows every event; /day/N shows one day.
function scope() {
  const m = location.pathname.match(/^\/day\/(\d+)$/);
  return m ? { day: Number(m[1]), nav: `day${m[1]}` } : { day: null, nav: 'progress' };
}

const { day: viewDay, nav } = scope();
const topbar = createTopbar(document.getElementById('topbar'), {
  active: nav,
  pageTitle: viewDay === null ? 'Inject Progress' : `Day ${viewDay}`,
});

const endName = (day, dayCount) => (day === null || day === dayCount ? 'ENDEX' : `End of Day ${day}`);

function labelCell(inject) {
  return el(
    'div',
    { class: 'row-label' },
    injectIcon(inject),
    el('span', { class: 'inj-id num' }, inject.id),
    el('span', { class: 'inj-time num' }, hhmm(inject.time)),
    el('span', { class: 'inj-title', title: inject.title }, inject.title),
  );
}

// A marker plus the vertical flow-line stubs above and below it.
// lineAbove / lineBelow: 'on' (reached) or 'off' (dim).
function flowCell(status, titleText, lineAbove, lineBelow) {
  return el(
    'div',
    { class: `cell cell-${status}`, title: titleText },
    el('span', { class: `flow-stub stub-up ${lineAbove}` }),
    el('span', { class: `flow-stub stub-down ${lineBelow}` }),
    marker(status),
  );
}

function allComplete(injects, enclave, state) {
  return injects.length > 0 && injects.every((i) => statusOf(state, enclave, i.id) === 'complete');
}

function missingDay(day) {
  return el('p', { class: 'flow-missing' }, `Day ${day} is no longer part of this exercise. `, el('a', { href: '/progress' }, 'See all injects'));
}

function draw(snap) {
  topbar.update(snap);
  const day = viewDay;
  if (day !== null && !snap.days.some((d) => d.day === day)) return main.replaceChildren(missingDay(day));
  const ending = endName(day, snap.days.length);
  const injects = day === null ? snap.injects : snap.injects.filter((i) => i.day === day);
  const reached = Object.fromEntries(snap.enclaves.map((name) => [name, unbrokenCount(injects, name, snap.state)]));
  const lastRow = injects.length; // index of the ENDEX / end-of-day row

  const grid = el('div', { class: 'flow-grid' });
  grid.style.setProperty('--enclaves', snap.enclaves.length);
  grid.style.setProperty('--rows', injects.length + 1);

  // Header row
  grid.append(el('div', { class: 'row-label col-head' }, el('span', { class: 'col-title' }, 'Event')));
  for (const name of snap.enclaves) {
    const t = tally(injects, [name], snap.state);
    grid.append(
      el('div', { class: 'col-head', title: name }, el('span', { class: 'col-name' }, name), el('span', { class: 'col-pct num' }, `${t.pct}%`)),
    );
  }

  // Inject rows (with day separators on the all-events view)
  let prevDay = null;
  injects.forEach((inject, row) => {
    if (day === null && inject.day !== prevDay) {
      prevDay = inject.day;
      const theme = snap.days.find((d) => d.day === inject.day)?.theme ?? '';
      grid.append(el('div', { class: 'day-sep' }, el('span', {}, `Day ${inject.day}`), el('span', { class: 'day-theme' }, theme)));
    }
    grid.append(labelCell(inject));
    for (const name of snap.enclaves) {
      const st = statusOf(snap.state, name, inject.id);
      const up = row > 0 && row <= reached[name] ? 'on' : 'off';
      const down = row + 1 <= reached[name] ? 'on' : 'off';
      grid.append(flowCell(st, `${name} · ${inject.id} ${inject.title} · ${STATUS_LABELS[st]}`, up, down));
    }
  });

  // ENDEX / end-of-day row
  grid.append(el('div', { class: 'row-label row-end' }, el('span', { class: 'inj-icon' }, iconNode('endex')), el('span', { class: 'end-name' }, ending)));
  for (const name of snap.enclaves) {
    const done = allComplete(injects, name, snap.state);
    const up = lastRow <= reached[name] ? 'on' : 'off';
    grid.append(flowCell(done ? 'complete' : 'not_started', `${name} · ${ending}`, up, 'off'));
  }

  const parts = [grid, el('footer', { class: 'flow-legend' }, statusLegend())];
  if (day !== null) parts.unshift(dayHeader(day, injects, snap.enclaves, snap.state));
  main.replaceChildren(...parts);
}

function dayHeader(day, injects, enclaves, state) {
  const t = tally(injects, enclaves, state);
  return el(
    'div',
    { class: 'day-head' },
    el('span', { class: 'ov-name' }, `Day ${day}`),
    stackedBar(t, true),
    el('span', { class: t.pct ? 'ov-pct num' : 'ov-pct num zero' }, `${t.pct}%`),
  );
}

startLive(draw);
