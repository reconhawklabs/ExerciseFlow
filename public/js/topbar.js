import { exerciseDay, localClock, zoneLabel } from '/shared/time.js';
import { el } from '/js/el.js';

const HIDE_KEY = 'exflow.hideNames';

function applyHideNames(hidden) {
  document.body.classList.toggle('hide-names', hidden);
}

export function namesHidden() {
  return localStorage.getItem(HIDE_KEY) === '1';
}

/** Overview, Inject Progress, then one link per day. */
export function navLinks(days) {
  return [
    ['overview', '/', 'Overview'],
    ['progress', '/progress', 'Inject Progress'],
    ...days.map(({ day }) => [`day${day}`, `/day/${day}`, `Day ${day}`]),
  ];
}

/**
 * Top bar for the viewing pages. Call update(snapshot) on every change: the exercise name,
 * day links and "DAY N" all come from the server. The Edit link hides with inject names,
 * so a screen shown to participants doesn't offer it.
 */
export function createTopbar(host, { active, pageTitle }) {
  host.className = 'topbar';
  host.innerHTML = `
    <div class="tb-brand"><b></b><span>Exercise Flow</span></div>
    <nav class="tb-nav"></nav>
    <div class="tb-right">
      <a class="tb-edit" href="/edit">Edit</a>
      <label class="tb-hide"><input type="checkbox" id="hide-names"> Hide inject names</label>
      <span class="tb-day num" id="tb-day"></span>
      <span class="tb-clock num" id="tb-clock"></span>
      <span class="tb-live" title="Live updates"></span>
    </div>`;

  const toggle = host.querySelector('#hide-names');
  toggle.checked = namesHidden();
  applyHideNames(toggle.checked);
  toggle.addEventListener('change', () => {
    localStorage.setItem(HIDE_KEY, toggle.checked ? '1' : '0');
    applyHideNames(toggle.checked);
  });

  // Until the server answers, show the viewer's own zone.
  let calendar = { day1Date: null, dayCount: 0, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
  const tick = () => {
    const now = new Date();
    const day = exerciseDay(calendar.day1Date, now, calendar.dayCount, calendar.timeZone);
    host.querySelector('#tb-day').textContent = day ? `DAY ${day}` : '';
    host.querySelector('#tb-clock').textContent = `${localClock(now, calendar.timeZone)} ${zoneLabel(now, calendar.timeZone)}`;
  };
  tick();
  setInterval(tick, 10_000);

  return {
    update(snap) {
      host.querySelector('.tb-brand b').textContent = snap.name;
      document.title = `${pageTitle} · ${snap.name}`;
      const links = navLinks(snap.days).map(([key, href, label]) => el('a', { href, class: key === active ? 'on' : '' }, label));
      host.querySelector('.tb-nav').replaceChildren(...links);
      calendar = { day1Date: snap.day1Date, dayCount: snap.days.length, timeZone: snap.timeZone };
      tick();
    },
  };
}
