// Line icons (24×24, stroke = currentColor). Names match ICONS in /shared/catalog.js, plus 'endex'.
import { el, svg } from '/js/el.js';
import { CATEGORY_LABELS } from '/shared/catalog.js';

const PATHS = {
  flag: '<path d="M5 21V4"/><path d="M5 4h12l-2.5 4.5L17 13H5"/>',
  eye: '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.8"/>',
  scales: '<path d="M12 4v16M8 20h8M5 7.5h14"/><path d="M5 7.5 2.5 13a2.6 2.6 0 0 0 5 0z"/><path d="M19 7.5 16.5 13a2.6 2.6 0 0 0 5 0z"/>',
  chip: '<rect x="6" y="6" width="12" height="12" rx="1.5"/><rect x="9.5" y="9.5" width="5" height="5"/><path d="M9.5 2.5V6M14.5 2.5V6M9.5 18v3.5M14.5 18v3.5M2.5 9.5H6M2.5 14.5H6M18 9.5h3.5M18 14.5h3.5"/>',
  person: '<circle cx="12" cy="7.5" r="3.8"/><path d="M4.5 21c.6-4.2 3.7-6.8 7.5-6.8s6.9 2.6 7.5 6.8"/>',
  people: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c.5-3.6 3-5.8 6-5.8s5.5 2.2 6 5.8"/><circle cx="17" cy="9" r="2.6"/><path d="M16.5 14.3c2.5.2 4.2 2.2 4.5 5.2"/>',
  shield: '<path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6z"/>',
  bug: '<rect x="7.5" y="7.5" width="9" height="12" rx="4.5"/><path d="M12 11v8.5M9 5.5l1.5 2M15 5.5l-1.5 2M3.5 11h4M16.5 11h4M3.5 16h4M16.5 16h4"/>',
  network: '<circle cx="12" cy="5" r="2.2"/><circle cx="5" cy="19" r="2.2"/><circle cx="19" cy="19" r="2.2"/><path d="M12 7.2V12M12 12l-5.4 5.3M12 12l5.4 5.3"/>',
  server: '<rect x="4" y="4" width="16" height="7" rx="1.5"/><rect x="4" y="13" width="16" height="7" rx="1.5"/><path d="M7.5 7.5h.01M7.5 16.5h.01"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="1.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  mail: '<rect x="3" y="5.5" width="18" height="13" rx="1.5"/><path d="M3.5 6.5 12 13l8.5-6.5"/>',
  phone: '<path d="M5 3.5h3.5l1.8 4.5-2.3 1.5a11 11 0 0 0 6.5 6.5l1.5-2.3 4.5 1.8V19a1.5 1.5 0 0 1-1.6 1.5C10.5 20 4 13.5 3.5 5.1A1.5 1.5 0 0 1 5 3.5z"/>',
  radio: '<circle cx="12" cy="12" r="2"/><path d="M8 8a5.6 5.6 0 0 0 0 8M16 8a5.6 5.6 0 0 1 0 8M5 5a9.9 9.9 0 0 0 0 14M19 5a9.9 9.9 0 0 1 0 14"/>',
  alert: '<path d="M12 3.5 21.5 20h-19z"/><path d="M12 10v4.5M12 17.3h.01"/>',
  document: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  endex: '<path d="M5 21V3.5"/><path d="M5 4h14v9.5H5"/><path d="M9.7 4v9.5M14.3 4v9.5M5 8.75h14"/>',
};

/** An icon as an SVG node, or null for '' / unknown names (no icon). */
export function iconNode(name) {
  const body = PATHS[name];
  if (!body) return null;
  return svg(
    `<svg class="ic ic-${name}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`,
  );
}

/** The inject's icon cell (empty when it has none); the category shows as a tooltip. */
export function injectIcon(inject) {
  return el('span', { class: 'inj-icon', 'data-cat': inject.category, title: CATEGORY_LABELS[inject.category] ?? '' }, iconNode(inject.icon));
}
