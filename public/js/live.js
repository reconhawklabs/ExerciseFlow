// Keeps a page's copy of the exercise state current: full fetch on (re)connect, then live cell and inject-list updates.

async function fetchSnapshot() {
  const res = await fetch('/api/state', { cache: 'no-store' });
  if (res.status === 401) {
    location.href = '/login';
    throw new Error('Logged out');
  }
  if (!res.ok) throw new Error(`State request failed (${res.status})`);
  return res.json();
}

function withCell(snapshot, cell) {
  const { enclave, injectId, status, changedAt } = cell;
  const enclaveCells = { ...(snapshot.state[enclave] ?? {}), [injectId]: { status, changedAt } };
  return { ...snapshot, state: { ...snapshot.state, [enclave]: enclaveCells } };
}

function setLive(on) {
  document.body.dataset.live = on ? 'on' : 'off';
}

/** Call onUpdate(snapshot, changedCell|null) now and after every change. */
export function startLive(onUpdate) {
  let snapshot = null;

  const refresh = async () => {
    try {
      snapshot = await fetchSnapshot();
      onUpdate(snapshot, null);
    } catch (err) {
      console.error(err);
      setLive(false);
    }
  };

  // Paint from plain HTTP straight away, so the board shows even if the live
  // stream is slow, buffered by the tunnel, or never connects.
  refresh();

  const events = new EventSource('/api/events');
  events.addEventListener('open', () => {
    setLive(true);
    refresh();
  });
  events.addEventListener('error', () => {
    setLive(false);
    // EventSource retries on its own; re-fetching keeps the board current (and
    // handles a dropped session) even while the stream is down.
    refresh();
  });
  events.addEventListener('status', (event) => {
    if (!snapshot) return;
    const cell = JSON.parse(event.data);
    snapshot = withCell(snapshot, cell);
    onUpdate(snapshot, cell);
  });

  events.addEventListener('injects', (event) => {
    if (!snapshot) return;
    const { days, injects, daysRev } = JSON.parse(event.data);
    snapshot = { ...snapshot, days, injects, daysRev };
    onUpdate(snapshot, null);
  });

  // Days, enclaves or names changed: fetch everything again.
  events.addEventListener('platform', () => refresh());

  return { current: () => snapshot, refresh };
}
