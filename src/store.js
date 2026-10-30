import { STATUSES } from '../public/shared/progress.js';
import { UserError } from './errors.js';
import { readJsonObject, writeJsonAtomic } from './files.js';

/** A rejected status update; the message is safe to show to the user. */
export class StoreError extends UserError {
  constructor(message) {
    super(message, 400);
    this.name = 'StoreError';
  }
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Keep every well-formed cell. Cells of removed enclaves and injects are kept on purpose,
 * so re-adding one with the same name or ID restores its progress.
 */
function cleanState(raw) {
  const enclaves = Object.entries(raw)
    .filter(([, cells]) => isObject(cells))
    .map(([enclave, cells]) => [
      enclave,
      Object.fromEntries(
        Object.entries(cells)
          .filter(([, cell]) => cell && STATUSES.includes(cell.status))
          .map(([id, cell]) => [id, { status: cell.status, changedAt: String(cell.changedAt ?? '') }]),
      ),
    ])
    .filter(([, cells]) => Object.keys(cells).length > 0);
  return Object.fromEntries(enclaves);
}

const copyState = (state) => JSON.parse(JSON.stringify(state));

/** hasEnclave(name) / hasInject(id) say what is on the board right now (both can change while running). */
export function createStore({ file, hasEnclave, hasInject }) {
  let state = cleanState(readJsonObject(file));

  return {
    getState() {
      return copyState(state);
    },

    setStatus(enclave, injectId, status, now = new Date()) {
      if (!hasEnclave(enclave)) throw new StoreError(`Unknown column: ${enclave} (it may have been removed)`);
      if (!hasInject(injectId)) throw new StoreError(`Unknown inject: ${injectId} (it may have been removed)`);
      if (!STATUSES.includes(status)) throw new StoreError(`Unknown status: ${status}`);
      const cell = { status, changedAt: now.toISOString() };
      const next = { ...state, [enclave]: { ...state[enclave], [injectId]: cell } };
      writeJsonAtomic(file, next);
      state = next;
      return { enclave, injectId, ...cell };
    },
  };
}
