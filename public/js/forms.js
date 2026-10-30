// Small helpers for the edit-page forms. Live updates from other editors redraw the page,
// so typed-but-unsaved text and the last message live here, outside the page.
import { el } from '/js/el.js';

/** Typed values by field name. An untouched field shows the server's value. */
export function createDrafts() {
  let values = {};
  const has = (name) => Object.hasOwn(values, name);

  return {
    value: (name, fallback = '') => (has(name) ? values[name] : fallback),
    has,
    set(name, value) { values = { ...values, [name]: value }; },
    clear(...names) { values = Object.fromEntries(Object.entries(values).filter(([k]) => !names.includes(k))); },

    input(name, fallback, attrs = {}) {
      const node = el('input', { name, value: has(name) ? values[name] : fallback, autocomplete: 'off', ...attrs });
      node.addEventListener('input', () => { values = { ...values, [name]: node.value }; });
      return node;
    },

    select(name, fallback, options, onChange) {
      const current = has(name) ? values[name] : fallback;
      const node = el('select', { name });
      for (const [value, label] of options) {
        const opt = el('option', { value }, label);
        if (value === current) opt.selected = true;
        node.append(opt);
      }
      node.addEventListener('change', () => {
        values = { ...values, [name]: node.value };
        onChange?.(node.value);
      });
      return node;
    },
  };
}

/** One message line plus a busy flag, for a tab whose buttons each make one change. */
export function createRunner() {
  let notice = { text: '', kind: '' };
  let busy = false;

  return {
    get busy() { return busy; },
    note: () => el('p', { class: `mi-note save-note ${notice.kind}`, role: 'status' }, notice.text),
    say(text, kind = 'ok') { notice = { text, kind }; },

    /** Show `working`, run the change, then re-fetch so this page shows the result at once. */
    async run(view, working, action) {
      if (busy) return;
      busy = true;
      notice = { text: working, kind: 'saving' };
      view.redraw();
      try {
        notice = { text: await action(), kind: 'ok' };
      } catch (err) {
        notice = { text: err.message, kind: 'err' };
      }
      busy = false;
      await view.reload();
    },
  };
}

export const field = (label, control, hint) =>
  el('label', { class: 'mi-field' }, el('span', {}, label), control, hint ? el('small', { class: 'mi-hint' }, hint) : null);
