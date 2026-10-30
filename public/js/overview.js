import { summarize } from '/shared/progress.js';
import { startLive } from '/js/live.js';
import { createTopbar } from '/js/topbar.js';
import { plural } from '/shared/catalog.js';
import { stackedBar, statusLegend } from '/js/bars.js';
import { el } from '/js/el.js';

const main = document.getElementById('app');
const topbar = createTopbar(document.getElementById('topbar'), { active: 'overview', pageTitle: 'Exercise Overview' });

const pctText = (t) => el('span', { class: t.pct ? 'ov-pct num' : 'ov-pct num zero' }, `${t.pct}%`);

function statBox(label, value, tone = '') {
  return el('div', { class: 'kpi' }, el('div', { class: 'kpi-l' }, label), el('div', { class: `kpi-v num ${tone}` }, value));
}

function dayLine(day, tally, eventCount, units) {
  const note =
    tally.total && tally.pct === 100
      ? `${eventCount} injects · all ${units} done`
      : `${eventCount} injects · ${tally.complete} of ${tally.total} done`;
  return el(
    'div',
    { class: 'ov-row ov-day' },
    el('span', { class: 'ov-name' }, `Day ${day}`),
    stackedBar(tally, true),
    pctText(tally),
    el('span', { class: 'ov-sub' }, note),
  );
}

function enclaveLine(name, tally) {
  return el(
    'div',
    { class: 'ov-row ov-enc' },
    el('span', { class: 'ov-name', title: name }, name),
    stackedBar(tally),
    pctText(tally),
  );
}

function draw(snap) {
  topbar.update(snap);
  const units = plural(snap.unitName);
  const s = summarize(snap.injects, snap.enclaves, snap.state, snap.days);
  const countFor = (day) => snap.injects.filter((i) => i.day === day).length;

  const stats = el(
    'section',
    { class: 'ov-kpis' },
    statBox('Injects complete', el('span', {}, `${s.overall.pct}`, el('small', {}, '%'))),
    statBox(units, snap.enclaves.length),
    statBox('In progress', s.overall.in_progress, 'tone-progress'),
    statBox('Blocked', s.overall.blocked, 'tone-blocked'),
  );
  const days = el(
    'section',
    { class: 'ov-panel ov-days' },
    el('h2', {}, 'Progress by day'),
    el('div', { class: 'ov-list' }, snap.days.map(({ day }) => dayLine(day, s.byDay[day], countFor(day), units.toLowerCase()))),
    statusLegend(),
  );
  const enclaves = el(
    'section',
    { class: 'ov-panel ov-encs' },
    el('h2', {}, `Progress by ${snap.unitName.toLowerCase()} · all ${snap.injects.length} injects`),
    el('div', { class: 'ov-list' }, snap.enclaves.map((name) => enclaveLine(name, s.byEnclave[name]))),
  );
  main.replaceChildren(stats, days, enclaves);
  main.style.setProperty('--enclave-count', snap.enclaves.length);
}

startLive(draw);
