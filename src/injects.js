import { readFileSync } from 'node:fs';
import { CATEGORIES, ICONS, LEGACY_CATEGORIES, LEGACY_DEFAULT_ICONS } from '../public/shared/catalog.js';

export const MAX_DAYS = 14;
const MAX_THEME = 80;
const TIME_RE = /^([01]\d|2[0-3])[0-5]\d$/;
// IDs end up in URLs (DELETE /api/injects/<id>), so keep them plain.
const ID_RE = /^[A-Za-z0-9._-]{1,20}$/;
const RESERVED_IDS = new Set(['__proto__', 'constructor', 'prototype']); // object keys with special meaning
const MAX_TITLE = 120;

/** A day's theme line: trimmed, may be empty. */
export function checkTheme(theme) {
  const clean = typeof theme === 'string' ? theme.trim() : '';
  if (clean.length > MAX_THEME) throw new Error(`theme must be ${MAX_THEME} characters or fewer`);
  return clean;
}

const dayRange = (dayCount) => (dayCount === 1 ? 'day must be 1' : `day must be 1 to ${dayCount}`);

/** Check one inject and return a clean, frozen copy. Throws Error with a readable message. */
export function checkInject(inject, { seen = new Set(), dayCount }) {
  const id = typeof inject?.id === 'string' ? inject.id.trim() : '';
  const where = `inject ${JSON.stringify(id || '?')}`;
  if (!ID_RE.test(id) || RESERVED_IDS.has(id)) throw new Error(`${where}: ID must be 1–20 letters, digits, dots or dashes (like 01.08a)`);
  if (seen.has(id)) throw new Error(`${where}: an inject with this ID already exists`);
  const day = Number(inject.day);
  if (!Number.isInteger(day) || day < 1 || day > dayCount) throw new Error(`${where}: ${dayRange(dayCount)}`);
  const time = String(inject.time ?? '').trim().replace(':', '');
  if (!TIME_RE.test(time)) throw new Error(`${where}: time must be a 24-hour time like 0830 or 14:30`);
  const title = typeof inject.title === 'string' ? inject.title.trim() : '';
  if (!title) throw new Error(`${where}: missing title`);
  if (title.length > MAX_TITLE) throw new Error(`${where}: title must be ${MAX_TITLE} characters or fewer`);
  if (!CATEGORIES.includes(inject.category)) {
    throw new Error(`${where}: category must be one of ${CATEGORIES.join(', ')}`);
  }
  const icon = inject.icon ?? '';
  if (icon !== '' && !ICONS.includes(icon)) throw new Error(`${where}: icon must be one of ${ICONS.join(', ')}, or none`);
  return Object.freeze({ id, day, time, title, category: inject.category, icon });
}

/** Older files: event-specific categories and no icon field. Map them to the general list. */
function upgradeLegacy(raw) {
  const legacy = LEGACY_CATEGORIES[raw?.category];
  const hasIcon = raw && typeof raw === 'object' && 'icon' in raw;
  return {
    ...raw,
    category: legacy?.category ?? raw?.category,
    icon: hasIcon ? raw.icon : (legacy?.icon ?? LEGACY_DEFAULT_ICONS[raw?.category] ?? ''),
  };
}

/** Days are numbered 1..N with no gaps. Older files without a days list get one from their injects. */
function readDays(rawDays, rawInjects) {
  const themes = new Map();
  for (const d of Array.isArray(rawDays) ? rawDays : []) themes.set(Number(d?.day), d?.theme);
  const fromDays = Math.max(0, ...themes.keys());
  const fromInjects = Math.max(0, ...rawInjects.map((i) => Number(i?.day) || 0));
  const count = Math.max(1, fromDays || fromInjects);
  if (count > MAX_DAYS) throw new Error(`at most ${MAX_DAYS} days`);
  return Array.from({ length: count }, (_, i) => Object.freeze({ day: i + 1, theme: checkTheme(themes.get(i + 1) ?? '') }));
}

/** Load and validate the inject list. File order is display order. */
export function loadInjects(path) {
  let doc;
  try {
    doc = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new Error(`Could not read inject list ${path}: ${err.message}`);
  }
  const rawInjects = Array.isArray(doc?.injects) ? doc.injects : [];
  try {
    const days = readDays(doc?.days, rawInjects);
    const seen = new Set();
    const injects = rawInjects.map((raw) => {
      const clean = checkInject(upgradeLegacy(raw), { seen, dayCount: days.length });
      seen.add(clean.id);
      return clean;
    });
    return Object.freeze({ days: Object.freeze(days), injects: Object.freeze(injects) });
  } catch (err) {
    throw new Error(`${path}: ${err.message}`);
  }
}
