// Inject categories and icon choices, shared by the server (validation) and the browser (labels).

export const CATEGORY_LABELS = Object.freeze({
  WHITE: 'White Cell',
  GOLD: 'Gold Cell',
  EXCON: 'EXCON',
  INTEL: 'Intel / Fusion',
  LEGAL: 'Legal',
  RED: 'Red Team',
  OTHER: 'Other',
});
export const CATEGORIES = Object.freeze(Object.keys(CATEGORY_LABELS));

/** Optional per-inject icon. '' means no icon. */
export const ICON_LABELS = Object.freeze({
  flag: 'Flag',
  eye: 'Eye',
  scales: 'Scales',
  chip: 'Chip / AI',
  person: 'Person',
  people: 'Group',
  shield: 'Shield',
  bug: 'Bug',
  network: 'Network',
  server: 'Server',
  lock: 'Lock',
  mail: 'Email',
  phone: 'Phone',
  radio: 'Radio',
  alert: 'Alert',
  document: 'Document',
  clock: 'Clock',
});
export const ICONS = Object.freeze(Object.keys(ICON_LABELS));

// Older inject files used event-specific categories and no icon field.
export const LEGACY_CATEGORIES = Object.freeze({
  AI_RED: Object.freeze({ category: 'RED', icon: 'chip' }),
  INPERSON_RED: Object.freeze({ category: 'RED', icon: 'person' }),
});
export const LEGACY_DEFAULT_ICONS = Object.freeze({ WHITE: 'flag', INTEL: 'eye', LEGAL: 'scales' });

/** 'Enclave' → 'Enclaves', 'Lane' → 'Lanes', 'Party' → 'Parties', 'Class' → 'Classes'. */
export function plural(word) {
  const w = String(word ?? '');
  if (/[^aeiou]y$/i.test(w)) return `${w.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/i.test(w)) return `${w}es`;
  return `${w}s`;
}
