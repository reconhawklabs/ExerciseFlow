import { randomUUID } from 'node:crypto';
import { UserError } from './errors.js';
import { writeJsonAtomic } from './files.js';
import { MAX_DAYS, checkInject, checkTheme } from './injects.js';

/** A refused inject or day change; the message is safe to show to the user. */
export class InjectError extends UserError {
  constructor(message, status = 400) {
    super(message, status);
    this.name = 'InjectError';
  }
}

const comesAfter = (a, b) => a.day > b.day || (a.day === b.day && a.time > b.time);

/** Insert after every inject at or before its day/time, keeping hand-made order otherwise. */
function insertInOrder(injects, inject) {
  const at = injects.findIndex((other) => comesAfter(other, inject));
  return at === -1 ? [...injects, inject] : [...injects.slice(0, at), inject, ...injects.slice(at)];
}

// Turn a validation Error into one for the user: drop the 'inject "x": ' prefix, capitalise.
function userMessage(err) {
  const reason = err.message.replace(/^inject "[^"]*": /, '');
  return reason.charAt(0).toUpperCase() + reason.slice(1);
}

function asUserError(fn) {
  try {
    return fn();
  } catch (err) {
    throw new InjectError(userMessage(err));
  }
}

/**
 * The live inject list and its days, saved to `file` on every change.
 * Each change is one item, never a whole-list overwrite, so two editors can't undo each other.
 */
export function createInjectList({ file, doc }) {
  let current = doc;
  // Changes whenever day numbers shift (a day added or removed). Day-based changes may send the
  // version their page saw; a mismatch means the numbering moved underneath them.
  const boot = randomUUID().slice(0, 8);
  let dayChanges = 0;
  const daysRev = () => `${boot}.${dayChanges}`;
  const checkRev = (seen) => {
    if (seen !== undefined && seen !== null && seen !== daysRev()) {
      throw new InjectError('The days changed while you were editing (someone added or removed a day). Check the refreshed page and try again.', 409);
    }
  };

  const save = (changes) => {
    const next = Object.freeze({ ...current, ...changes });
    writeJsonAtomic(file, next);
    current = next;
  };

  const findDay = (day) => {
    const found = current.days.find((d) => d.day === Number(day));
    if (!found) throw new InjectError(`Day ${day} does not exist (someone may have removed it already)`, 404);
    return found;
  };

  return {
    get: () => ({ ...current, daysRev: daysRev() }),
    has: (id) => current.injects.some((i) => i.id === id),
    hasDay: (day) => current.days.some((d) => d.day === day),

    add(raw) {
      checkRev(raw?.daysRev);
      const seen = new Set(current.injects.map((i) => i.id));
      const inject = asUserError(() => checkInject(raw, { seen, dayCount: current.days.length }));
      save({ injects: Object.freeze(insertInOrder(current.injects, inject)) });
      return inject;
    },

    remove(id) {
      if (!current.injects.some((i) => i.id === id)) {
        throw new InjectError(`Inject ${id} is not on the list (someone may have removed it already)`, 404);
      }
      save({ injects: Object.freeze(current.injects.filter((i) => i.id !== id)) });
      return id;
    },

    addDay(rawTheme) {
      if (current.days.length >= MAX_DAYS) throw new InjectError(`An exercise can have at most ${MAX_DAYS} days`);
      const day = Object.freeze({ day: current.days.length + 1, theme: asUserError(() => checkTheme(rawTheme)) });
      save({ days: Object.freeze([...current.days, day]) });
      dayChanges += 1;
      return day;
    },

    setTheme(dayNumber, rawTheme, seenRev) {
      checkRev(seenRev);
      const target = findDay(dayNumber);
      const theme = asUserError(() => checkTheme(rawTheme));
      const updated = Object.freeze({ day: target.day, theme });
      save({ days: Object.freeze(current.days.map((d) => (d.day === target.day ? updated : d))) });
      return updated;
    },

    /** Removes the day and its injects (their progress is kept); later days move up by one. */
    removeDay(dayNumber, seenRev) {
      checkRev(seenRev);
      const target = findDay(dayNumber);
      if (current.days.length === 1) throw new InjectError('Cannot remove the last day');
      const shift = (n) => (n > target.day ? n - 1 : n);
      const removedInjects = current.injects.filter((i) => i.day === target.day).map((i) => i.id);
      const injects = current.injects
        .filter((i) => i.day !== target.day)
        .map((i) => (i.day > target.day ? Object.freeze({ ...i, day: shift(i.day) }) : i));
      const days = current.days
        .filter((d) => d.day !== target.day)
        .map((d) => Object.freeze({ day: shift(d.day), theme: d.theme }));
      save({ days: Object.freeze(days), injects: Object.freeze(injects) });
      dayChanges += 1;
      return { removedInjects };
    },
  };
}
