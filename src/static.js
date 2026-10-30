// Serves the pages, scripts and styles: from the public/ folder when running from source,
// or from files embedded in the executable when packaged.
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { TYPES, reply } from './http.js';

const contentType = (path) => TYPES[extname(path)] ?? 'application/octet-stream';

/**
 * publicDir: folder on disk, or null to use embedded files.
 * readAsset(key): returns a Buffer for 'public/<path>' or null.
 */
export function createStatic({ publicDir, readAsset }) {
  async function fromDisk(urlPath) {
    const root = resolve(publicDir);
    const target = resolve(root, `.${urlPath}`);
    if (!target.startsWith(root + sep)) return null; // outside public/
    try {
      return await readFile(target);
    } catch {
      return null;
    }
  }

  return {
    /** Send the file at urlPath (e.g. '/css/base.css'); 404 if there is no such file. */
    async serve(res, urlPath) {
      const body = publicDir ? await fromDisk(urlPath) : readAsset(`public${urlPath}`);
      if (body === null) return reply(res, 404, 'Not found');
      return reply(res, 200, body, { 'Content-Type': contentType(urlPath) });
    },
  };
}
