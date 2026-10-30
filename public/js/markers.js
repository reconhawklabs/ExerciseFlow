import { svg } from '/js/el.js';

// One marker per cell, showing how far a column (enclave, lane, team…) has handled that inject.
const SHAPES = {
  complete: '<svg viewBox="0 0 24 24" class="mk mk-complete" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M7.5 12.3l3 3 6-6.3" fill="none" stroke-width="2.2"/></svg>',
  in_progress: '<svg viewBox="0 0 24 24" class="mk mk-progress" aria-hidden="true"><circle cx="12" cy="12" r="9" class="mk-ring"/><path d="M12 3 a9 9 0 0 1 9 9" fill="none" class="mk-arc"/></svg>',
  blocked: '<svg viewBox="0 0 24 24" class="mk mk-blocked" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M7.5 12h9" stroke-width="2.2"/></svg>',
  not_started: '<svg viewBox="0 0 24 24" class="mk mk-idle" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke-width="1.5"/></svg>',
};

export function marker(status) {
  return svg(SHAPES[status] ?? SHAPES.not_started);
}
