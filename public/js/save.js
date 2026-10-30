// Changes sent to the server. Each returns the server's answer, or throws with a readable message.

async function send(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401) {
    location.href = '/login';
    throw new Error('Logged out');
  }
  if (!res.ok) {
    const info = await res.json().catch(() => ({}));
    throw new Error(info.error || `Save failed (${res.status})`);
  }
  return res.json();
}

/** Set one cell's status. Returns the saved cell. */
export const saveStatus = (enclave, injectId, status) => send('PUT', '/api/status', { enclave, injectId, status });

/** Add an inject. Returns { inject }. */
export const addInject = (inject) => send('POST', '/api/injects', inject);

/** Remove an inject by ID. Returns { removed }. */
export const removeInject = (id) => send('DELETE', `/api/injects/${encodeURIComponent(id)}`);

/** Change exercise name, column name and/or Day 1 date. Send only what changed. */
export const updateSettings = (changes) => send('PATCH', '/api/settings', changes);

export const addEnclave = (name) => send('POST', '/api/enclaves', { name });
export const removeEnclave = (name) => send('DELETE', `/api/enclaves/${encodeURIComponent(name)}`);

export const addDay = (theme) => send('POST', '/api/days', { theme });
// daysRev: the day-numbering version this page saw, so a stale page can't hit a renumbered day.
export const setDayTheme = (day, theme, daysRev) => send('PUT', `/api/days/${day}`, { theme, daysRev });
export const removeDay = (day, daysRev) => send('DELETE', `/api/days/${day}?daysRev=${encodeURIComponent(daysRev)}`);
