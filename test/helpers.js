import { createServer } from 'node:http';
import { copyFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/config.js';
import { loadInjects } from '../src/injects.js';
import { createStore } from '../src/store.js';
import { createInjectList } from '../src/inject-list.js';
import { createSettings } from '../src/settings.js';
import { createAuth } from '../src/auth.js';
import { createPasswords } from '../src/passwords.js';
import { createStatic } from '../src/static.js';
import { createApp } from '../src/app.js';

export const PASSWORD = 'test-pass';
export const ENCLAVES = 'Enclave 1,Enclave 2,Enclave 3,Enclave 4';

/** Start the real app on a random port with temp copies of the data files. password: null = no .env password (setup mode). */
export async function startApp({ hub, password = PASSWORD, trustedProxies } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'app-'));
  const stateFile = join(dir, 'state.json');
  const injectsFile = join(dir, 'injects.json');
  copyFileSync('test/fixtures/legacy-injects.json', injectsFile);
  const config = loadConfig({
    ...(password === null ? {} : { APP_PASSWORD: password }),
    ENCLAVES,
    EXERCISE_DAY1_DATE: '2026-10-27',
    STATE_FILE: stateFile,
  });
  const { name, unitName, enclaves, day1Date, timeZone } = config;
  const settings = createSettings({ file: join(dir, 'settings.json'), defaults: { name, unitName, enclaves, day1Date, timeZone } });
  const injectList = createInjectList({ file: injectsFile, doc: loadInjects(injectsFile) });
  const store = createStore({ file: stateFile, hasEnclave: settings.hasEnclave, hasInject: injectList.has });
  const passwords = createPasswords({ file: join(dir, 'auth.json'), envPassword: config.password, envSecret: config.sessionSecret });
  const auth = createAuth({ passwords });
  const app = createApp({
    settings,
    injectList,
    store,
    auth,
    passwords,
    trustedProxies,
    hub: hub ?? { subscribe() {}, broadcast() {} },
    files: createStatic({ publicDir: 'public', readAsset: () => null }),
  });
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const close = () =>
    new Promise((resolve) => {
      server.closeAllConnections();
      server.close(resolve);
    });
  return { base, close, config, stateFile, injectList, passwords };
}

export async function login(base, password = PASSWORD, headers = {}) {
  return fetch(`${base}/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
    body: new URLSearchParams({ password }).toString(),
  });
}

export async function cookieFor(base) {
  const res = await login(base);
  return res.headers.get('set-cookie').split(';')[0];
}
