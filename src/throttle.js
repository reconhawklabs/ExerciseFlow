// Slows down repeated wrong passwords, per visitor. A few tries are free; after that each
// failure doubles the wait (1s, 2s, 4s… up to a cap). A correct password clears the record,
// and quiet records are forgotten so the table stays small.

const DEFAULTS = Object.freeze({
  freeTries: 5,
  firstWaitMs: 1_000,
  maxWaitMs: 60_000,
  forgetAfterMs: 10 * 60 * 1_000,
});

export function createThrottle(options = {}) {
  const { freeTries, firstWaitMs, maxWaitMs, forgetAfterMs } = { ...DEFAULTS, ...options };
  const now = options.now ?? (() => Date.now());
  let records = new Map(); // key → { failures, lastAt, notBefore }

  const forgetOld = () => {
    const cutoff = now() - forgetAfterMs;
    records = new Map([...records].filter(([, r]) => r.lastAt > cutoff));
  };

  // Using up the last free try starts the first wait; each failure after that doubles it.
  const waitFor = (failures) => {
    const over = failures - freeTries;
    return over < 0 ? 0 : Math.min(maxWaitMs, firstWaitMs * 2 ** over);
  };

  return {
    /** Milliseconds this visitor must still wait before another attempt is checked; 0 = go ahead. */
    waitMs(key) {
      forgetOld();
      const record = records.get(key);
      return record ? Math.max(0, record.notBefore - now()) : 0;
    },

    failed(key) {
      forgetOld();
      const failures = (records.get(key)?.failures ?? 0) + 1;
      const at = now();
      records = new Map(records).set(key, { failures, lastAt: at, notBefore: at + waitFor(failures) });
    },

    succeeded(key) {
      records = new Map([...records].filter(([k]) => k !== key));
    },

    size: () => records.size,
  };
}
