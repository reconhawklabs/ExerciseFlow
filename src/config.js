import { checkDate, checkEnclaveList, checkExerciseName, checkTimeZone, checkUnitName, systemTimeZone } from './rules.js';

const DEFAULT_PORT = 8080;
// File names inside the data folder (an absolute path is used as is).
const DEFAULT_STATE_FILE = 'state.json';
const DEFAULT_SETTINGS_FILE = 'settings.json';
const DEFAULT_AUTH_FILE = 'auth.json';
const DEFAULT_ENCLAVES = Object.freeze(['Enclave 1', 'Enclave 2', 'Enclave 3', 'Enclave 4']);

function parseEnclaves(raw) {
  const names = String(raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (names.length === 0) return DEFAULT_ENCLAVES;
  return checkEnclaveList(names, 'ENCLAVES');
}

/** Empty = every network interface. '127.0.0.1' = this machine only (fine behind a local tunnel). */
function parseHost(raw) {
  const host = String(raw ?? '').trim();
  if (host && !/^[A-Za-z0-9.:[\]-]+$/.test(host)) throw new Error(`HOST must be an address like 127.0.0.1 (got "${host}")`);
  return host || null;
}

function parsePort(raw) {
  if (raw === undefined || raw === '') return DEFAULT_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be a number between 1 and 65535 (got "${raw}")`);
  }
  return port;
}

/** Run a check on an .env value, naming the setting in any error so the user knows which line to fix. */
function fromEnv(name, raw, fallback, check) {
  if (!String(raw ?? '').trim()) return fallback;
  try {
    return check(raw);
  } catch (err) {
    throw new Error(err.message.startsWith(name) ? err.message : `${name}: ${err.message}`);
  }
}
const fileOr = (raw, fallback) => String(raw ?? '').trim() || fallback;

/**
 * Read and validate the app settings from an environment object.
 * name, unitName, enclaves, day1Date and timeZone are starting values; the Edit Platform tab can override them.
 * password is null when APP_PASSWORD is unset: the first visit then asks the user to choose one.
 */
export function loadConfig(env) {
  const password = String(env.APP_PASSWORD ?? '').trim() || null;

  // Optional. Without it a random secret is created once and kept in data/.
  const sessionSecret = String(env.SESSION_SECRET ?? '').trim() || null;

  return Object.freeze({
    password,
    name: fromEnv('EXERCISE_NAME', env.EXERCISE_NAME, 'Exercise', checkExerciseName),
    unitName: fromEnv('UNIT_NAME', env.UNIT_NAME, 'Enclave', checkUnitName),
    enclaves: Object.freeze(fromEnv('ENCLAVES', env.ENCLAVES, DEFAULT_ENCLAVES, parseEnclaves)),
    timeZone: fromEnv('TIMEZONE', env.TIMEZONE, systemTimeZone(), (raw) => checkTimeZone(raw, 'TIMEZONE')),
    port: parsePort(env.PORT),
    host: parseHost(env.HOST),
    sessionSecret,
    day1Date: fromEnv('EXERCISE_DAY1_DATE', env.EXERCISE_DAY1_DATE, null, (raw) => checkDate(raw, 'EXERCISE_DAY1_DATE')),
    stateFile: fileOr(env.STATE_FILE, DEFAULT_STATE_FILE),
    settingsFile: fileOr(env.SETTINGS_FILE, DEFAULT_SETTINGS_FILE),
    authFile: fileOr(env.AUTH_FILE, DEFAULT_AUTH_FILE),
  });
}
