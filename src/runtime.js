// Where things live. .env and data/ always sit next to the app: in the repo folder when run
// from source (wherever you start it from), or next to the .exe when packaged. Pages come
// from public/ in the repo, or from inside the executable.
import { getAsset, isSea } from 'node:sea';
import { dirname, join, resolve } from 'node:path';

export const packaged = isSea();

/** The repo root when running from source; null when packaged (files are embedded). */
export const sourceRoot = packaged ? null : resolve(import.meta.dirname, '..');

/** Folder holding .env and data/. */
export const appDir = packaged ? dirname(process.execPath) : sourceRoot;

export const dataDir = join(appDir, 'data');

/** An embedded file (key like 'public/css/base.css'), or null if absent / not packaged. */
export function readAsset(key) {
  if (!packaged) return null;
  try {
    return Buffer.from(getAsset(key));
  } catch {
    return null;
  }
}
