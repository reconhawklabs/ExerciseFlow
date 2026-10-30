// Builds a single executable for the current operating system: Node's runtime with the app
// and its pages embedded. On Windows: build/ExerciseFlow.exe. On Linux: build/ExerciseFlow-linux-x64.
//
//   npm run build:exe
//
// Steps: bundle the server into one file (esbuild) → describe it and the embedded files for
// Node's single-executable feature → copy the Node binary → inject the bundle (postject).
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, relative, resolve } from 'node:path';
import { build } from 'esbuild';
import { inject } from 'postject';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = join(ROOT, 'build');
const NAME = process.platform === 'win32' ? 'ExerciseFlow.exe' : `ExerciseFlow-${process.platform}-${process.arch}`;
const SEA_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

/** Every file under dir, as 'dir/sub/file' keys with forward slashes. */
function filesUnder(dir) {
  const out = {};
  const walk = (folder) => {
    for (const entry of readdirSync(folder)) {
      const full = join(folder, entry);
      if (statSync(full).isDirectory()) walk(full);
      else out[relative(ROOT, full).split('\\').join('/')] = full;
    }
  };
  walk(join(ROOT, dir));
  return out;
}

const step = (text) => console.log(`• ${text}`);

// Some Node builds (e.g. Linux distro packages) can't host an embedded app. Say so plainly
// instead of failing later with a cryptic "sentinel" error.
if (!readFileSync(process.execPath).includes(SEA_FUSE)) {
  console.error(`This Node.js (${process.execPath}) can't build single executables.`);
  console.error('Use the official Node.js 22 from https://nodejs.org, or let GitHub build it (see README).');
  process.exit(1);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);

step('Bundling the server');
await build({
  entryPoints: [join(ROOT, 'server.js')],
  outfile: join(OUT, 'bundle.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  logOverride: { 'empty-import-meta': 'silent' }, // import.meta is only used when running from source
});

step('Listing the files to embed');
const assets = { ...filesUnder('public'), 'data/sample-injects.json': join(ROOT, 'data/sample-injects.json') };
const seaConfig = {
  main: join(OUT, 'bundle.cjs'),
  output: join(OUT, 'sea.blob'),
  disableExperimentalSEAWarning: true,
  assets,
};
writeFileSync(join(OUT, 'sea-config.json'), JSON.stringify(seaConfig, null, 2));

step('Preparing the embedded app');
execFileSync(process.execPath, ['--experimental-sea-config', join(OUT, 'sea-config.json')], { stdio: 'inherit' });

step(`Copying the Node runtime (${process.version})`);
const exe = join(OUT, NAME);
copyFileSync(process.execPath, exe);
if (process.platform === 'darwin') execFileSync('codesign', ['--remove-signature', exe]);

step('Injecting the app into the runtime');
await inject(exe, 'NODE_SEA_BLOB', readFileSync(join(OUT, 'sea.blob')), {
  sentinelFuse: SEA_FUSE,
  ...(process.platform === 'darwin' ? { machoSegmentName: 'NODE_SEA' } : {}),
});
if (process.platform === 'darwin') execFileSync('codesign', ['--sign', '-', exe]);

for (const temp of ['bundle.cjs', 'sea.blob', 'sea-config.json']) rmSync(join(OUT, temp), { force: true });
console.log(`\nDone: ${relative(ROOT, exe)} (${Math.round(statSync(exe).size / 1024 / 1024)} MB)`);
console.log('Double-click it (or run it) to start. It keeps its files in a data/ folder next to it.');
