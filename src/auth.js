import { createHmac, timingSafeEqual } from 'node:crypto';

export const COOKIE_NAME = 'exflow';
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

function sameBytes(a, b) {
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Logins. `passwords` (see passwords.js) checks the shared password and supplies the secret that
 * signs the cookie. Before first-time setup there is no secret, so nothing verifies.
 */
export function createAuth({ passwords }) {
  const session = () => {
    const secret = passwords.sessionSecret();
    return secret ? createHmac('sha256', secret).update('exercise-flow-session').digest('base64url') : null;
  };

  return {
    /** Async. */
    checkPassword: (input) => passwords.check(input),
    token: () => session(),
    verify(value) {
      const current = session();
      return current !== null && sameBytes(Buffer.from(String(value ?? '')), Buffer.from(current));
    },
  };
}

export function readCookie(header) {
  for (const part of String(header ?? '').split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === COOKIE_NAME) return part.slice(eq + 1).trim();
  }
  return '';
}

export function buildCookie(value, secure) {
  const parts = [`${COOKIE_NAME}=${value}`, 'HttpOnly', 'SameSite=Lax', 'Path=/', `Max-Age=${MAX_AGE_SECONDS}`];
  return (secure ? [...parts, 'Secure'] : parts).join('; ');
}
