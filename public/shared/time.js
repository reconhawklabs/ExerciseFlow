// Exercise time: one time zone for everyone (set on Edit platform), whatever each viewer's own zone.
// Shared by the server (validation) and the browser (clock, "DAY N").

const DAY_MS = 24 * 60 * 60 * 1000;

// Building a formatter is slow; keep one per zone and purpose.
let formatters = new Map();
function formatter(kind, timeZone) {
  const key = `${kind}|${timeZone}`;
  if (!formatters.has(key)) {
    const options = {
      date: ['en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }],
      clock: ['en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }],
      zone: ['en-US', { timeZone, timeZoneName: 'short' }],
    }[kind];
    formatters = new Map(formatters).set(key, new Intl.DateTimeFormat(...options));
  }
  return formatters.get(key);
}

/** true for names like 'Europe/London' or 'UTC'. */
export function isTimeZone(name) {
  if (typeof name !== 'string' || !name.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: name });
    return true;
  } catch {
    return false;
  }
}

/** 'YYYY-MM-DD' in the given zone. */
export const localDate = (now, timeZone) => formatter('date', timeZone).format(now);

/** 'HH:MM' (24-hour) in the given zone. */
export const localClock = (now, timeZone) => formatter('clock', timeZone).format(now);

/** Short zone name for display: 'EDT', 'GMT+2', 'UTC'. */
export function zoneLabel(now, timeZone) {
  return formatter('zone', timeZone).formatToParts(now).find((p) => p.type === 'timeZoneName')?.value ?? timeZone;
}

/** 1..dayCount on exercise days (calendar of the given zone), otherwise null. */
export function exerciseDay(day1Date, now, dayCount, timeZone) {
  if (!day1Date) return null;
  const diff = Math.round(
    (Date.parse(`${localDate(now, timeZone)}T00:00:00Z`) - Date.parse(`${day1Date}T00:00:00Z`)) / DAY_MS,
  );
  return diff >= 0 && diff < dayCount ? diff + 1 : null;
}
