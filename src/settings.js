// Exercise-wide settings changed on the Edit Platform tab. Saved to their own file and laid
// over the .env values: anything set here wins, anything never set here still comes from .env.
import { UserError } from './errors.js';
import { readJsonObject, writeJsonAtomic } from './files.js';
import {
  MAX_ENCLAVES,
  checkDate,
  checkEnclaveList,
  checkEnclaveName,
  checkExerciseName,
  checkTimeZone,
  checkUnitName,
} from './rules.js';

const CHECKS = Object.freeze({
  name: checkExerciseName,
  unitName: checkUnitName,
  day1Date: (value) => checkDate(value),
  timeZone: (value) => checkTimeZone(value),
  enclaves: (value) => checkEnclaveList(value, 'Saved column list'),
});

function readOverrides(file) {
  const raw = readJsonObject(file);
  const clean = {};
  for (const [key, check] of Object.entries(CHECKS)) {
    if (!(key in raw)) continue;
    try {
      clean[key] = check(raw[key]);
    } catch (err) {
      throw new Error(`${file}: ${err.message}. Fix or delete that line to use the .env value.`);
    }
  }
  return clean;
}

export function createSettings({ file, defaults }) {
  let overrides = readOverrides(file);
  const current = () => Object.freeze({ ...defaults, ...overrides });

  const save = (next) => {
    writeJsonAtomic(file, next);
    overrides = next;
  };

  return {
    get: current,
    hasEnclave: (name) => current().enclaves.includes(name),

    /** Change any of name, unitName, day1Date, timeZone. Only the fields sent are touched. */
    update(patch) {
      const changes = {};
      for (const key of ['name', 'unitName', 'day1Date', 'timeZone']) {
        if (patch && key in patch) changes[key] = CHECKS[key](patch[key]);
      }
      if (Object.keys(changes).length === 0) throw new UserError('Nothing to change');
      save({ ...overrides, ...changes });
      return current();
    },

    addEnclave(raw) {
      const name = checkEnclaveName(raw);
      const { enclaves } = current();
      if (enclaves.includes(name)) throw new UserError(`"${name}" is already on the list`);
      if (enclaves.length >= MAX_ENCLAVES) throw new UserError(`The board fits at most ${MAX_ENCLAVES}`);
      save({ ...overrides, enclaves: [...enclaves, name] });
      return name;
    },

    removeEnclave(name) {
      const { enclaves } = current();
      if (!enclaves.includes(name)) throw new UserError(`"${name}" is not on the list (someone may have removed it already)`, 404);
      if (enclaves.length === 1) throw new UserError('Cannot remove the last one');
      save({ ...overrides, enclaves: enclaves.filter((e) => e !== name) });
      return name;
    },
  };
}
