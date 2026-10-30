/** '1430' → '14:30' */
export function hhmm(time) {
  const t = String(time ?? '');
  return t.length === 4 ? `${t.slice(0, 2)}:${t.slice(2)}` : t;
}
