import { buildCookie, readCookie } from './auth.js';
import { UserError } from './errors.js';
import { BadRequest, goTo, readText, reply, replyJson } from './http.js';
import { createThrottle } from './throttle.js';

const PAGE_FILES = {
  '/': '/overview.html',
  '/progress': '/flow.html',
  '/edit': '/edit.html',
};
const DAY_PAGE_RE = /^\/day\/(\d{1,2})$/;
const OPEN_PREFIXES = ['/css/'];
const OPEN_FILES = ['/js/login.js', '/js/setup.js']; // the sign-in and setup pages need these before login
const ASSET_PREFIXES = ['/css/', '/js/', '/shared/'];

/** The path part of a request URL, or null if the URL can't be parsed (e.g. '//'). */
function pathOf(url) {
  try {
    return new URL(url, 'http://localhost').pathname;
  } catch {
    return null;
  }
}

function decodePath(raw) {
  if (raw === null) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

function cameOverHttps(req) {
  return String(req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim() === 'https';
}

// The tunnel (cloudflared) runs on this machine, so only a loopback peer may vouch for a visitor's address.
const LOOPBACK = Object.freeze(new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']));

/** Who is knocking: Cloudflare's reported visitor address when it came via the local tunnel, else the socket's. */
function clientKey(req, trustedProxies) {
  const peer = req.socket?.remoteAddress || 'unknown';
  if (!trustedProxies.has(peer)) return peer;
  return String(req.headers['cf-connecting-ip'] ?? '').trim() || peer;
}

// Per-visitor slowdown, plus a site-wide one so rotating fake addresses still gets slowed.
const EVERYONE = 'everyone';
const SITE_WIDE = Object.freeze({ freeTries: 30, firstWaitMs: 500, maxWaitMs: 5_000 });

const isOpenFile = (path) => OPEN_FILES.includes(path) || OPEN_PREFIXES.some((p) => path.startsWith(p));

/** '/api/days/3' with prefix '/api/days/' → '3'; null when the path doesn't start with it. */
const tail = (path, prefix) => (path.startsWith(prefix) ? path.slice(prefix.length) : null);

export function createApp({ settings, injectList, store, auth, hub, passwords, files, trustedProxies = LOOPBACK }) {
  const isLoggedIn = (req) => auth.verify(readCookie(req.headers.cookie));
  const perVisitor = createThrottle();
  const siteWide = createThrottle(SITE_WIDE);
  // Logins are checked one at a time, so a burst of parallel guesses can't all slip in
  // before the slowdown notices them (and the slow password check never piles up).
  let loginTurn = Promise.resolve();

  async function checkLogin(who, password) {
    if (perVisitor.waitMs(who) > 0 || siteWide.waitMs(EVERYONE) > 0) return 'wait';
    if (await auth.checkPassword(password)) {
      perVisitor.succeeded(who);
      return 'ok';
    }
    perVisitor.failed(who);
    siteWide.failed(EVERYONE);
    return 'wrong';
  }

  async function login(req, res) {
    const who = clientKey(req, trustedProxies);
    const password = new URLSearchParams(await readText(req)).get('password');
    const myTurn = loginTurn.then(() => checkLogin(who, password));
    loginTurn = myTurn.catch(() => {});
    const result = await myTurn;
    if (result === 'wait') return goTo(res, 303, '/login?error=wait');
    if (result === 'wrong') return goTo(res, 303, '/login?error=1');
    return goTo(res, 303, '/', { 'Set-Cookie': buildCookie(auth.token(), cameOverHttps(req)) });
  }

  // No password yet: the whole site is the setup page until one is chosen.
  async function setupMode(req, res, path) {
    if (path === '/setup' && req.method === 'POST') return finishSetup(req, res);
    if (path === '/setup') return files.serve(res, '/setup.html');
    if (path === '/api/brand') return replyJson(res, 200, { name: settings.get().name });
    if (isOpenFile(path)) return files.serve(res, path);
    if (path.startsWith('/api/')) return replyJson(res, 503, { error: 'Set up the password first' });
    return goTo(res, 302, '/setup');
  }

  async function finishSetup(req, res) {
    const form = new URLSearchParams(await readText(req));
    try {
      passwords.completeSetup({ code: form.get('code'), password: form.get('password'), confirm: form.get('confirm') });
    } catch (err) {
      if (err instanceof UserError) return goTo(res, 303, `/setup?error=${err.reason ?? 'code'}`);
      throw err;
    }
    // Signed in straight away, landing where the exercise gets its name.
    return goTo(res, 303, '/edit#platform', { 'Set-Cookie': buildCookie(auth.token(), cameOverHttps(req)) });
  }

  function pageFor(path) {
    if (PAGE_FILES[path]) return PAGE_FILES[path];
    const day = path.match(DAY_PAGE_RE);
    return day && injectList.hasDay(Number(day[1])) ? '/flow.html' : null;
  }

  async function route(req, res) {
    const path = decodePath(pathOf(req.url));
    if (path === null) return reply(res, 404, 'Not found');
    // Reject traversal before any prefix check, so an open prefix (e.g. /css/)
    // can never be used to walk into gated files.
    if (path.split('/').includes('..')) return reply(res, 404, 'Not found');

    if (passwords.needsSetup()) return setupMode(req, res, path);
    if (path === '/setup') return goTo(res, 302, '/login');
    if (path === '/login' && req.method === 'POST') return login(req, res);
    if (path === '/login') return files.serve(res, '/login.html');
    if (path === '/api/brand' && req.method === 'GET') return replyJson(res, 200, { name: settings.get().name });
    if (isOpenFile(path)) return files.serve(res, path);

    if (!isLoggedIn(req)) {
      if (path.startsWith('/api/')) return replyJson(res, 401, { error: 'Log in first' });
      return goTo(res, 302, '/login');
    }

    if (path.startsWith('/api/')) return api(req, res, path);
    const page = req.method === 'GET' ? pageFor(path) : null;
    if (page) return files.serve(res, page);
    if (ASSET_PREFIXES.some((p) => path.startsWith(p))) return files.serve(res, path);
    return reply(res, 404, 'Not found');
  }

  function snapshot() {
    const { name, unitName, enclaves, day1Date, timeZone } = settings.get();
    const { days, injects, daysRev } = injectList.get();
    return { name, unitName, enclaves, days, daysRev, injects, state: store.getState(), day1Date, timeZone };
  }

  async function readJson(req, shape) {
    try {
      return JSON.parse(await readText(req));
    } catch (err) {
      if (err instanceof BadRequest) throw err;
      throw new BadRequest(`Body must be JSON like ${shape}`);
    }
  }

  async function saveStatus(req, res) {
    const input = await readJson(req, '{"enclave","injectId","status"}');
    const cell = store.setStatus(input?.enclave, input?.injectId, input?.status);
    hub.broadcast('status', cell);
    return replyJson(res, 200, cell);
  }

  // Inject add/remove carries the new list; other structure changes tell pages to re-fetch.
  function injectsChanged(res, status, result) {
    const { days, injects, daysRev } = injectList.get();
    hub.broadcast('injects', { days, injects, daysRev });
    return replyJson(res, status, result);
  }

  function platformChanged(res, status, result) {
    hub.broadcast('platform', {});
    return replyJson(res, status, result);
  }

  const injectRoutes = {
    POST: async (req, res) =>
      injectsChanged(res, 201, { inject: injectList.add(await readJson(req, '{"id","day","time","title","category","icon"}')) }),
    DELETE: async (req, res, id) => injectsChanged(res, 200, { removed: injectList.remove(id) }),
  };

  const settingsRoutes = {
    PATCH: async (req, res) => platformChanged(res, 200, { settings: settings.update(await readJson(req, '{"name"}')) }),
  };

  const enclaveRoutes = {
    POST: async (req, res) => {
      const input = await readJson(req, '{"name"}');
      return platformChanged(res, 201, { added: settings.addEnclave(input?.name) });
    },
    DELETE: async (req, res, name) => platformChanged(res, 200, { removed: settings.removeEnclave(name) }),
  };

  const dayNumber = (raw) => {
    if (!/^\d{1,2}$/.test(raw ?? '')) throw new UserError('Not found', 404);
    return Number(raw);
  };

  const dayRoutes = {
    POST: async (req, res) => {
      const input = await readJson(req, '{"theme"}');
      return platformChanged(res, 201, { day: injectList.addDay(input?.theme) });
    },
    PUT: async (req, res, raw) => {
      const input = await readJson(req, '{"theme","daysRev"}');
      return platformChanged(res, 200, { day: injectList.setTheme(dayNumber(raw), input?.theme, input?.daysRev) });
    },
    // ?daysRev=<version the page saw>, so a stale page can't remove a renumbered day.
    DELETE: async (req, res, raw) => {
      const seen = new URL(req.url, 'http://localhost').searchParams.get('daysRev') ?? undefined;
      return platformChanged(res, 200, injectList.removeDay(dayNumber(raw), seen));
    },
  };

  // [collection path, item prefix, handlers]. Collection gets POST/PATCH; items get PUT/DELETE.
  const RESOURCES = [
    ['/api/injects', '/api/injects/', injectRoutes],
    ['/api/settings', null, settingsRoutes],
    ['/api/enclaves', '/api/enclaves/', enclaveRoutes],
    ['/api/days', '/api/days/', dayRoutes],
  ];

  async function api(req, res, path) {
    if (path === '/api/state' && req.method === 'GET') return replyJson(res, 200, snapshot());
    if (path === '/api/status' && req.method === 'PUT') return saveStatus(req, res);
    if (path === '/api/events' && req.method === 'GET') return hub.subscribe(req, res);
    for (const [collection, itemPrefix, handlers] of RESOURCES) {
      const handler = handlers[req.method];
      if (!handler) continue;
      if (path === collection && ['POST', 'PATCH'].includes(req.method)) return handler(req, res);
      const item = itemPrefix && tail(path, itemPrefix);
      if (item && ['PUT', 'DELETE'].includes(req.method)) return handler(req, res, item);
    }
    return replyJson(res, 404, { error: 'Not found' });
  }

  return (req, res) => {
    route(req, res).catch((err) => {
      if (res.headersSent) return res.destroy();
      if (err instanceof UserError) return replyJson(res, err.status, { error: err.message });
      console.error('Request failed:', req.method, req.url, err);
      return replyJson(res, 500, { error: 'Server error' });
    });
  };
}
