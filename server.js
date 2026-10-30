import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { loadConfig } from './src/config.js';
import { loadInjects } from './src/injects.js';
import { createInjectList } from './src/inject-list.js';
import { createSettings } from './src/settings.js';
import { createStore } from './src/store.js';
import { createAuth } from './src/auth.js';
import { createPasswords } from './src/passwords.js';
import { createHub } from './src/hub.js';
import { createApp } from './src/app.js';
import { createStatic } from './src/static.js';
import { writeJsonAtomic } from './src/files.js';
import { appDir, dataDir, packaged, readAsset, sourceRoot } from './src/runtime.js';

const SAMPLE_INJECTS = 'data/sample-injects.json';

/**
 * Stop with a message. A double-clicked .exe closes its window on exit, so there we
 * wait for Enter first; otherwise the user would never see why it didn't start.
 */
function fatal(message) {
  console.error(`\nCould not start: ${message}\n`);
  if (packaged && process.platform === 'win32' && process.stdin.isTTY) {
    console.error('Press Enter to close this window.');
    process.stdin.once('data', () => process.exit(1));
    return;
  }
  process.exit(1);
}

/** The shipped sample list: embedded when packaged, from the repo when run from source. */
function sampleInjects() {
  const raw = packaged ? readAsset(SAMPLE_INJECTS) : readFileSync(join(sourceRoot, SAMPLE_INJECTS));
  return JSON.parse(raw.toString('utf8'));
}

const inData = (file) => resolve(dataDir, file);

function startup() {
  const envFile = join(appDir, '.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const config = loadConfig(process.env);

  const injectsFile = inData('injects.json');
  if (!existsSync(injectsFile)) writeJsonAtomic(injectsFile, sampleInjects());

  const { name, unitName, enclaves, day1Date, timeZone } = config;
  const settings = createSettings({ file: inData(config.settingsFile), defaults: { name, unitName, enclaves, day1Date, timeZone } });
  const injectList = createInjectList({ file: injectsFile, doc: loadInjects(injectsFile) });
  const passwords = createPasswords({
    file: inData(config.authFile),
    envPassword: config.password,
    envSecret: config.sessionSecret,
    onNewCode: (code) => console.log(`\nToo many wrong setup codes. The new setup code is:  ${code}\n`),
    onSetup: () => console.log('\nPassword saved. Share the address and password with your team.\n'),
  });
  const store = createStore({ file: inData(config.stateFile), hasEnclave: settings.hasEnclave, hasInject: injectList.has });
  return { config, settings, injectList, passwords, store };
}

/** IPv4 addresses other computers on the network can use, e.g. ['192.168.1.20']. */
function lanAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal)
    .map((a) => a.address);
}

/** Linux without a desktop (a server, SSH session): there is no browser to open. */
const hasDesktop = () =>
  process.platform !== 'linux' || Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);

/** Open the default browser when run as the executable. Any failure is harmless: the address is printed. */
function openBrowser(url) {
  if (!hasDesktop()) return;
  const [cmd, args] =
    process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : process.platform === 'darwin' ? ['open', [url]]
    : ['xdg-open', [url]];
  try {
    // A missing command shows up as an 'error' event, which would otherwise crash the app.
    spawn(cmd, args, { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
  } catch {
    // the address is printed anyway
  }
}

function announce({ config, settings, passwords }) {
  const { port, host } = config;
  const local = `http://${host && host !== '0.0.0.0' && host !== '::' ? host : 'localhost'}:${port}`;
  const others = host ? [] : lanAddresses().map((ip) => `http://${ip}:${port}`);
  const s = settings.get();
  console.log(`\nExercise Flow is running — ${s.name}`);
  console.log(`  On this computer:   ${local}`);
  if (others.length) console.log(`  On other computers: ${others.join('   ')}`);
  console.log(`  Files are kept in:  ${dataDir}`);
  if (passwords.ignoringSaved()) console.log('  Using APP_PASSWORD from .env (the password saved by first-time setup is ignored).');
  if (passwords.needsSetup()) {
    console.log('\nNo password is set yet. Open the address above and enter this setup code to choose one:\n');
    console.log(`    ${passwords.setupCode()}\n`);
  }
  console.log('Keep this window open while the exercise runs. Close it (or press Ctrl+C) to stop.\n');
  return local;
}

let parts = null;
try {
  parts = startup();
} catch (err) {
  fatal(err.message);
}

if (parts) {
  const { settings, injectList, passwords, store, config } = parts;
  const auth = createAuth({ passwords });
  const hub = createHub();
  const files = createStatic({ publicDir: packaged ? null : join(sourceRoot, 'public'), readAsset });
  const app = createApp({ settings, injectList, store, auth, hub, passwords, files });

  const server = createServer(app);
  server.on('error', (err) =>
    fatal(
      err.code === 'EADDRINUSE'
        ? `port ${config.port} is already in use. Is Exercise Flow already running? (Set PORT in .env to use another port.)`
        : err.message,
    ),
  );
  server.listen(config.port, config.host ?? undefined, () => {
    const url = announce(parts);
    if (packaged && !process.env.NO_BROWSER) openBrowser(url);
  });
}
