import { STATUS_LABELS } from '/shared/progress.js';
import { el } from '/js/el.js';

const SEGMENTS = ['complete', 'in_progress', 'blocked'];

/** Stacked bar: complete, then in progress, then blocked, on a not-started track. */
export function stackedBar(tally, thick = false) {
  const bar = el('div', { class: thick ? 'bar bar-thick' : 'bar' });
  for (const key of SEGMENTS) {
    if (!tally.total || !tally[key]) continue;
    bar.append(el('i', { class: `seg seg-${key}`, style: { width: `${(tally[key] / tally.total) * 100}%` } }));
  }
  return bar;
}

export function statusLegend() {
  return el(
    'div',
    { class: 'legend' },
    ['complete', 'in_progress', 'blocked', 'not_started'].map((k) => el('span', { class: `lg lg-${k}` }, STATUS_LABELS[k])),
  );
}
