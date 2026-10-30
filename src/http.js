import { readFile } from 'node:fs/promises';
import { UserError } from './errors.js';
import { extname, resolve, sep } from 'node:path';

export const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

export const MAX_BODY_BYTES = 10 * 1024;

/** Malformed request (bad JSON, body too large). */
export class BadRequest extends UserError {}

// Browser safety nets: only our own scripts/styles run, no sniffing, no framing.
const SAFETY_HEADERS = Object.freeze({
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
});

export function reply(res, status, body = '', headers = {}) {
  res.writeHead(status, { ...SAFETY_HEADERS, ...headers });
  res.end(body);
}

export function replyJson(res, status, data) {
  reply(res, status, JSON.stringify(data), { 'Content-Type': TYPES['.json'] });
}

export function goTo(res, status, location, headers = {}) {
  reply(res, status, '', { Location: location, ...headers });
}

export async function readText(req) {
  const parts = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new BadRequest('Request body too large');
    parts.push(chunk);
  }
  return Buffer.concat(parts).toString('utf8');
}
