// Pure progress math, shared by the browser and the Node tests.

export const STATUSES = Object.freeze(['not_started', 'in_progress', 'blocked', 'complete']);

export const STATUS_LABELS = Object.freeze({
  not_started: 'Not Started',
  in_progress: 'In Progress',
  blocked: 'Blocked',
  complete: 'Complete',
});

/** Status of one inject in one enclave; cells never set are not_started. */
export function statusOf(state, enclave, injectId) {
  return state?.[enclave]?.[injectId]?.status ?? 'not_started';
}

/** Count statuses over every inject × enclave cell. pct is floored. */
export function tally(injects, enclaves, state) {
  const counts = { not_started: 0, in_progress: 0, blocked: 0, complete: 0 };
  for (const enclave of enclaves) {
    for (const inject of injects) {
      counts[statusOf(state, enclave, inject.id)] += 1;
    }
  }
  const total = injects.length * enclaves.length;
  const pct = total === 0 ? 0 : Math.floor((counts.complete / total) * 100);
  return { total, ...counts, pct };
}

/** days: [{ day, theme }] — any number of them. */
export function summarize(injects, enclaves, state, days) {
  const byDay = Object.fromEntries(
    days.map(({ day }) => [day, tally(injects.filter((i) => i.day === day), enclaves, state)]),
  );
  const byEnclave = {};
  for (const enclave of enclaves) {
    byEnclave[enclave] = tally(injects, [enclave], state);
  }
  return { overall: tally(injects, enclaves, state), byDay, byEnclave };
}

/** How many injects, from the top, are complete without a gap. */
export function unbrokenCount(injects, enclave, state) {
  const firstOpen = injects.findIndex((i) => statusOf(state, enclave, i.id) !== 'complete');
  return firstOpen === -1 ? injects.length : firstOpen;
}
