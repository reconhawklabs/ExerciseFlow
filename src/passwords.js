// The shared password. Either fixed in .env (APP_PASSWORD), or chosen on the first visit and
// saved as a salted hash in data/auth.json. Never stored in plain text.
import { createHash, randomBytes, randomInt, scrypt, scryptSync, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { UserError } from './errors.js';
import { writeJsonAtomic } from './files.js';

export const MIN_PASSWORD_LENGTH = 8;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I to misread
const KEY_BYTES = 64;
const FILE_MODE = 0o600;
const WRONG_CODES_BEFORE_NEW_CODE = 50;
const scryptAsync = promisify(scrypt);

function makeCode() {
  const group = () => Array.from({ length: 5 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
  return `${group()}-${group()}`;
}

const normalizeCode = (raw) => String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const sameBytes = (a, b) => a.length === b.length && timingSafeEqual(a, b);
const sha256 = (value) => createHash('sha256').update(value).digest();

function readStored(file) {
  if (!existsSync(file)) return null;
  try {
    const doc = JSON.parse(readFileSync(file, 'utf8'));
    if (/^[0-9a-f]{32}$/.test(doc?.salt) && /^[0-9a-f]{128}$/.test(doc?.hash) && /^[0-9a-f]{64}$/.test(doc?.secret)) {
      return doc;
    }
  } catch {
    // fall through to the error below
  }
  throw new Error(`${file} is not a valid password file. Delete it to run first-time setup again, or set APP_PASSWORD in .env.`);
}

/** A random cookie-signing secret for .env-password mode, kept in session.json next to auth.json. */
function sessionSecretFor(authFile) {
  const file = join(dirname(authFile), 'session.json');
  if (existsSync(file)) {
    const saved = JSON.parse(readFileSync(file, 'utf8'))?.secret;
    if (/^[0-9a-f]{64}$/.test(saved)) return saved;
  }
  const secret = randomBytes(32).toString('hex');
  writeJsonAtomic(file, { secret }, { mode: FILE_MODE });
  return secret;
}

/**
 * envPassword set: it is the password and the saved file is ignored.
 * Otherwise the saved file is used, and until it exists the app needs setup.
 * onNewCode(code) is called if the setup code is replaced after too many wrong guesses;
 * onSetup() once the password has been chosen.
 */
export function createPasswords({ file, envPassword = null, envSecret = null, onNewCode = () => {}, onSetup = () => {} }) {
  const env = envPassword ? { hash: sha256(envPassword.trim()), secret: envSecret || sessionSecretFor(file) } : null;
  let stored = env ? null : readStored(file);
  let code = makeCode();
  let wrongCodes = 0;
  const needsSetup = () => !env && !stored;

  const wrongCode = () => {
    wrongCodes += 1;
    if (wrongCodes >= WRONG_CODES_BEFORE_NEW_CODE) {
      code = makeCode();
      wrongCodes = 0;
      onNewCode(code);
    }
    throw new UserError('That setup code is not right', 400, 'code');
  };

  return {
    needsSetup,
    /** true when APP_PASSWORD is set and a password saved by first-time setup is being ignored. */
    ignoringSaved: () => Boolean(env) && existsSync(file),
    /** One-time code printed in the server window; the setup page asks for it. */
    setupCode: () => code,
    /** Secret that signs login cookies; null before setup. */
    sessionSecret: () => env?.secret ?? stored?.secret ?? null,

    /** Async: the saved-password check is deliberately slow, so it runs off the main thread. */
    async check(input) {
      const value = String(input ?? '').trim();
      if (!value) return false;
      if (env) return sameBytes(sha256(value), env.hash);
      if (!stored) return false;
      const derived = await scryptAsync(value, Buffer.from(stored.salt, 'hex'), KEY_BYTES);
      return sameBytes(derived, Buffer.from(stored.hash, 'hex'));
    },

    /** Throws UserError with .reason 'done' | 'code' | 'short' | 'mismatch'. */
    completeSetup({ code: given, password, confirm }) {
      if (!needsSetup()) throw new UserError('The password is already set up', 409, 'done');
      if (normalizeCode(given) !== normalizeCode(code)) wrongCode();
      const value = String(password ?? '').trim();
      if (value.length < MIN_PASSWORD_LENGTH) {
        throw new UserError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`, 400, 'short');
      }
      if (value !== String(confirm ?? '').trim()) throw new UserError('The two passwords do not match', 400, 'mismatch');
      const salt = randomBytes(16);
      const doc = {
        salt: salt.toString('hex'),
        hash: scryptSync(value, salt, KEY_BYTES).toString('hex'),
        secret: randomBytes(32).toString('hex'),
      };
      writeJsonAtomic(file, doc, { mode: FILE_MODE });
      stored = doc;
      onSetup();
    },
  };
}
