// Limits and checks for exercise-wide settings, used for both .env values and the Edit Platform tab.
import { UserError } from './errors.js';
import { isTimeZone } from '../public/shared/time.js';

export const MAX_ENCLAVES = 15;
const MAX_NAME = 80;
const MAX_UNIT = 30;
const MAX_ENCLAVE_NAME = 40;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const RESERVED = new Set(['__proto__', 'constructor', 'prototype']);

function text(value, label, max) {
  const clean = typeof value === 'string' ? value.trim() : '';
  if (!clean) throw new UserError(`${label} cannot be empty`);
  if (clean.length > max) throw new UserError(`${label} must be ${max} characters or fewer`);
  return clean;
}

export const checkExerciseName = (value) => text(value, 'Exercise name', MAX_NAME);
export const checkUnitName = (value) => text(value, 'Column name', MAX_UNIT);

/** 'YYYY-MM-DD', or null when empty. */
export function checkDate(value, label = 'Day 1 date') {
  const clean = String(value ?? '').trim();
  if (!clean) return null;
  // Round-trip so impossible dates like 2026-02-31 are refused instead of rolling over.
  const parsed = DATE_RE.test(clean) ? new Date(`${clean}T00:00:00Z`) : null;
  if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== clean) {
    throw new UserError(`${label} must be a real date like 2026-10-27 (got "${clean}")`);
  }
  return clean;
}

/** An IANA time zone name like 'Europe/London' or 'America/New_York'. */
export function checkTimeZone(value, label = 'Time zone') {
  const clean = String(value ?? '').trim();
  if (!isTimeZone(clean)) throw new UserError(`${label} must be a time zone name like Europe/London (got "${clean}")`);
  return clean;
}

/** This computer's own time zone. */
export const systemTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

// Enclave names appear in URLs (DELETE /api/enclaves/<name>) and as object keys.
export function checkEnclaveName(value) {
  const name = text(value, 'Name', MAX_ENCLAVE_NAME);
  if (/[/\\\u0000-\u001f]/.test(name) || /^\.+$/.test(name) || RESERVED.has(name)) {
    throw new UserError(`Name "${name}" can't contain slashes or be only dots`);
  }
  return name;
}

/** A full list: 1 to MAX_ENCLAVES valid, distinct names. */
export function checkEnclaveList(names, label = 'Column list') {
  if (!Array.isArray(names) || names.length < 1 || names.length > MAX_ENCLAVES) {
    throw new UserError(`${label} must have 1 to ${MAX_ENCLAVES} names (got ${names?.length ?? 0})`);
  }
  const seen = new Set();
  return names.map((raw) => {
    const name = checkEnclaveName(raw);
    if (seen.has(name)) throw new UserError(`${label} has a duplicate name: "${name}"`);
    seen.add(name);
    return name;
  });
}
