import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** Write JSON so a crash mid-write never leaves a half-written file. mode: e.g. 0o600 for secrets. */
export function writeJsonAtomic(file, data, { mode } = {}) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, mode === undefined ? {} : { mode });
  if (mode !== undefined) chmodSync(tmp, mode); // mode above is ignored if a stale .tmp already existed
  renameSync(tmp, file);
}

/** Read a JSON object; a missing file is {}. An unreadable one is moved aside (never deleted) and treated as {}. */
export function readJsonObject(file) {
  if (!existsSync(file)) return {};
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    throw new Error('not an object');
  } catch (err) {
    const aside = `${file}.corrupt-${Date.now()}`;
    renameSync(file, aside);
    console.error(`${file} was unreadable (${err.message}); moved to ${aside}, starting empty.`);
    return {};
  }
}
