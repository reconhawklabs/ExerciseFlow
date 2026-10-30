import { STATUSES, STATUS_LABELS, statusOf } from '/shared/progress.js';
import { startLive } from '/js/live.js';
import { saveStatus } from '/js/save.js';
import { manageView } from '/js/manage.js';
import { injectIcon } from '/js/icons.js';
import { platformView } from '/js/platform.js';
import { navLinks } from '/js/topbar.js';
import { plural } from '/shared/catalog.js';
import { localClock, zoneLabel } from '/shared/time.js';
import { el } from '/js/el.js';
import { hhmm } from '/js/dom.js';

const main = document.getElementById('app');
let snap = null;
let live = null;

// Selected tab is kept in the URL hash: #e=<enclave>, #all, #injects or #platform.
function selectedTab() {
  let hash = '';
  try {
    hash = decodeURIComponent(location.hash.slice(1));
  } catch {
    // a mangled link: fall back to the first tab
  }
  if (hash === 'all') return { all: true };
  if (hash === 'injects') return { manage: true };
  if (hash === 'platform') return { platform: true };
  const m = hash.match(/^e=(.*)$/);
  if (m && snap?.enclaves.includes(m[1])) return { enclave: m[1] };
  return snap ? { enclave: snap.enclaves[0] } : { enclave: null };
}

/** 'changed 14:05 EDT' in the exercise time zone, or '' if never changed. */
function changedLabel(cell) {
  if (!cell?.changedAt) return '';
  const at = new Date(cell.changedAt);
  return `changed ${localClock(at, snap.timeZone)} ${zoneLabel(at, snap.timeZone)}`;
}

function statusSelect(enclave, inject, current) {
  const sel = el('select', { class: `st st-${current}`, 'aria-label': `${enclave} ${inject.id}` });
  for (const s of STATUSES) {
    const opt = el('option', { value: s }, STATUS_LABELS[s]);
    if (s === current) opt.selected = true;
    sel.append(opt);
  }
  sel.dataset.enclave = enclave;
  sel.dataset.inject = inject.id;
  sel.addEventListener('change', () => onChange(sel));
  return sel;
}

// Saves still in flight or failed, keyed by cell. Kept outside the page so a rebuild
// (another editor added/removed an inject) puts them back instead of losing them.
let pending = new Map();
const keyOf = (enclave, inject) => `${enclave}\n${inject}`;

function withPending(key, entry) {
  const next = new Map(pending);
  if (entry) next.set(key, entry);
  else next.delete(key);
  return next;
}

const hostOf = (sel) => sel?.closest('[data-note-host]');

// Paint one pending save onto whatever select is on screen for that cell now.
function showPending({ enclave, inject, status, error }) {
  const sel = selectFor(enclave, inject);
  if (!sel) return;
  sel.value = status;
  sel.className = `st st-${status}`;
  const note = hostOf(sel)?.querySelector('.save-note');
  if (!note) return;
  if (error) {
    note.className = 'save-note err';
    note.replaceChildren(document.createTextNode(`${error} `), retryButton(enclave, inject));
  } else {
    note.textContent = 'saving…';
    note.className = 'save-note saving';
  }
}

async function save(enclave, inject, status) {
  const key = keyOf(enclave, inject);
  pending = withPending(key, { enclave, inject, status });
  showPending(pending.get(key));
  try {
    const cell = await saveStatus(enclave, inject, status);
    if (pending.get(key)?.status !== status) return; // a newer change to this cell is on its way
    pending = withPending(key, null);
    const host = hostOf(selectFor(enclave, inject));
    const note = host?.querySelector('.save-note');
    if (note) { note.textContent = 'saved'; note.className = 'save-note ok'; }
    const changed = host?.querySelector('.changed');
    if (changed) changed.textContent = changedLabel(cell);
    setTimeout(() => { if (note && note.textContent === 'saved') note.textContent = ''; }, 2000);
  } catch (err) {
    if (pending.get(key)?.status !== status) return;
    pending = withPending(key, { enclave, inject, status, error: err.message });
    showPending(pending.get(key));
  }
}

const onChange = (sel) => save(sel.dataset.enclave, sel.dataset.inject, sel.value);

function retryButton(enclave, inject) {
  const btn = el('button', { class: 'retry', type: 'button' }, 'retry');
  btn.addEventListener('click', () => {
    const entry = pending.get(keyOf(enclave, inject));
    if (entry) save(enclave, inject, entry.status);
  });
  return btn;
}

function enclaveView(enclave) {
  const wrap = el('div', { class: 'edit-list' });
  let prevDay = null;
  for (const inject of snap.injects) {
    if (inject.day !== prevDay) {
      prevDay = inject.day;
      const theme = snap.days.find((d) => d.day === inject.day)?.theme ?? '';
      wrap.append(el('div', { class: 'edit-day' }, el('b', {}, `Day ${inject.day}`), el('span', {}, theme)));
    }
    const current = statusOf(snap.state, enclave, inject.id);
    const cell = snap.state?.[enclave]?.[inject.id];
    const row = el(
      'div',
      { class: 'edit-row', 'data-note-host': '' },
      injectIcon(inject),
      el('span', { class: 'inj-id num' }, inject.id),
      el('span', { class: 'inj-time num' }, hhmm(inject.time)),
      el('span', { class: 'edit-title' }, inject.title),
      statusSelect(enclave, inject, current),
      el('span', { class: 'changed' }, changedLabel(cell)),
      el('span', { class: 'save-note' }),
    );
    wrap.append(row);
  }
  return wrap;
}

function allView() {
  const table = el('table', { class: 'edit-table' });
  const head = el('tr', {}, el('th', { class: 'corner' }, 'Inject'));
  for (const name of snap.enclaves) head.append(el('th', { title: name }, name));
  table.append(el('thead', {}, head));
  const body = el('tbody', {});
  for (const inject of snap.injects) {
    const tr = el('tr', { 'data-note-host': '' });
    tr.append(
      el('th', { class: 'row-head' },
        injectIcon(inject),
        el('span', { class: 'inj-id num' }, inject.id),
        el('span', { class: 'edit-title' }, inject.title)),
    );
    for (const name of snap.enclaves) {
      tr.append(el('td', {}, statusSelect(name, inject, statusOf(snap.state, name, inject.id))));
    }
    body.append(tr);
  }
  table.append(body);
  return el('div', { class: 'edit-table-wrap' }, table);
}

function tabs(current) {
  const bar = el('nav', { class: 'edit-tabs' });
  for (const name of snap.enclaves) {
    bar.append(el('a', { href: `#e=${encodeURIComponent(name)}`, class: current.enclave === name ? 'on' : '' }, name));
  }
  bar.append(el('a', { href: '#all', class: current.all ? 'on' : '' }, `All ${plural(snap.unitName).toLowerCase()}`));
  bar.append(el('a', { href: '#injects', class: `tab-manage ${current.manage ? 'on' : ''}` }, 'Manage injects'));
  bar.append(el('a', { href: '#platform', class: `tab-platform ${current.platform ? 'on' : ''}` }, 'Edit platform'));
  return bar;
}

// Header: exercise name, page title, and one "View" link per day.
function drawHeader() {
  document.title = `Edit · ${snap.name}`;
  document.getElementById('brand-name').textContent = snap.name;
  const links = navLinks(snap.days).map(([, href, label]) => el('a', { href }, label));
  document.getElementById('edit-views').replaceChildren(el('span', {}, 'View:'), ...links);
}

const manageCallbacks = {
  redraw: () => draw(),
  reload: async () => { await live?.refresh(); draw(); },
};

function bodyFor(current) {
  if (current.manage) return manageView(snap, manageCallbacks);
  if (current.platform) return platformView(snap, manageCallbacks);
  return current.all ? allView() : enclaveView(current.enclave);
}

// A redraw rebuilds the page; put the cursor back where the editor was typing.
function focusKey() {
  const node = document.activeElement;
  if (!node || !main.contains(node)) return null;
  const attr = node.getAttribute('name') ? 'name' : 'aria-label';
  const value = node.getAttribute(attr);
  return value ? { selector: `[${attr}="${CSS.escape(value)}"]`, caret: node.selectionStart ?? null } : null;
}

function restoreFocus(key) {
  const node = key && main.querySelector(key.selector);
  if (!node || node.disabled) return;
  node.focus();
  if (key.caret !== null && typeof node.setSelectionRange === 'function') node.setSelectionRange(key.caret, key.caret);
}

function draw() {
  if (!snap) return;
  const key = focusKey();
  drawHeader();
  const current = selectedTab();
  main.replaceChildren(tabs(current), bodyFor(current));
  for (const entry of pending.values()) showPending(entry);
  restoreFocus(key);
}

const selectFor = (enclave, inject) =>
  main.querySelector(`select[data-enclave="${CSS.escape(enclave)}"][data-inject="${CSS.escape(inject)}"]`);

// Update one on-screen select to match the server, without disturbing a focused
// control or a cell that still has a save in flight / an error waiting to retry.
function patchCell(enclave, injectId, status, changedAt) {
  const sel = selectFor(enclave, injectId);
  if (!sel || sel === document.activeElement || pending.has(keyOf(enclave, injectId))) return;
  const host = hostOf(sel);
  sel.value = status;
  sel.className = `st st-${status}`;
  const changed = host?.querySelector('.changed');
  if (changed) changed.textContent = changedLabel({ changedAt });
}

// Everything except statuses: a change here means rows, columns or names changed.
const listKey = (s) => JSON.stringify({ ...s, state: null });

// Live updates. A single cell event patches that cell; a full refresh (reconnect)
// re-syncs every visible cell in place. Neither rebuilds the DOM, so a pending
// edit or retry button is never thrown away underneath the editor. A change to the
// structure (injects, days, enclaves, names) rebuilds the page, and draw() re-applies pending saves.
function onLive(next, cell) {
  const rebuild = snap === null || listKey(next) !== listKey(snap);
  snap = next;
  if (rebuild) return draw();
  if (cell) return patchCell(cell.enclave, cell.injectId, cell.status, cell.changedAt);
  for (const sel of main.querySelectorAll('select.st')) {
    const { enclave, inject } = sel.dataset;
    const c = snap.state?.[enclave]?.[inject];
    patchCell(enclave, inject, c?.status ?? 'not_started', c?.changedAt);
  }
}

window.addEventListener('hashchange', draw);
live = startLive(onLive);
