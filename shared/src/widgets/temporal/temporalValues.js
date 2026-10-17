/**
 * @file temporalValues.js
 * @brief Values of the temporal editor (plan 19): a stored date value (plain date
 *        text or temporal JSON) to the values of one of the four forms, and back.
 *
 * Kinds (the tabs of the editor, as legacy editTemporalObject):
 * - `s` Simple date: `{timestamp:{in, type:"s", circa|before|after}}`; a date alone is
 *   stored as plain text (`1969-05-03`, `1624`, `-375`);
 * - `r` Simple range: `{start:{earliest}, end:{latest}, profile}`;
 * - `p` Fuzzy range: `{start:{earliest, latest, profile}, end:{earliest, latest, profile}}`;
 * - `c` Radiometric: `{timestamp:{in, type:"c", bp, deviation | deviation_negative/positive},
 *   native, labcode, calibrated}`.
 * Common: `determination` (0-3), `comment`. `estMinDate` / `estMaxDate` are not written:
 * the server computes them on save. Only the Gregorian calendar is edited; a value with
 * another calendar is read only. The legacy plain string (`|VER=1|...`) is not read.
 *
 * No DOM here (tested with node --test).
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { parseDate } from '../../utils/temporal.js';

/** The kinds of the editor, in tab order. */
export const TEMPORAL_KINDS = Object.freeze(['s', 'r', 'p', 'c']);

/** Present year of radiocarbon dates (BP = years before 1950). */
const BP_YEAR = 1950;

/** Date fields of each kind (checked as dates). */
const DATE_FIELDS = Object.freeze({
  s: ['date'],
  r: ['earliest', 'latest'],
  p: ['tpq', 'pdb', 'pde', 'taq'],
  c: []
});

/**
 * Whether a stored value is a temporal object (JSON), not a plain date.
 *
 * @param {*} value Stored value.
 * @returns {boolean} True for temporal JSON text or an object.
 */
export function isTemporalObject(value) {
  if (value && typeof value === 'object') return true;
  return typeof value === 'string' && value.trim().startsWith('{');
}

/**
 * The form of a stored value.
 *
 * @param {string|object|null} value Plain date text, temporal JSON text or object.
 * @returns {{kind: string, values: object, readOnly?: boolean, note?: string}}
 *          `note` is an English message (translated by the editor).
 */
export function temporalToForm(value) {
  if (value === null || value === undefined || value === '') return { kind: 's', values: {} };
  let date = value;
  if (typeof value === 'string') {
    const text = value.trim();
    if (text.startsWith('|VER=')) {
      return { kind: 's', values: {}, note: 'The old temporal format is not supported. Enter the date again.' };
    }
    if (!text.startsWith('{')) {
      // plain date text; unreadable text goes to the comment, as legacy did
      return parseDate(text)
        ? { kind: 's', values: { date: text } }
        : { kind: 's', values: { comment: text }, note: 'The value is not a date. It is put in the comment.' };
    }
    try {
      date = JSON.parse(text);
    } catch {
      return { kind: 's', values: {}, note: 'The value is not valid JSON.' };
    }
  }
  if (Array.isArray(date)) date = date[0];
  if (!date || typeof date !== 'object') return { kind: 's', values: {} };

  const common = {};
  const determination = Number(date.determination);
  if (determination > 0) common.determination = determination;
  if (date.comment) common.comment = String(date.comment);
  const result = fromObject(date, common);

  const calendar = String(date.calendar || '').trim();
  if (calendar && calendar.toLowerCase() !== 'gregorian') {
    result.readOnly = true;
    result.calendar = calendar;
    result.native = String(date.native || '');
  }
  return result;
}

/** Form of a parsed temporal object. */
function fromObject(date, common) {
  const timestamp = date.timestamp;
  if (timestamp && typeof timestamp === 'object') {
    if (timestamp.type === 'c') return { kind: 'c', values: { ...common, ...radiometricValues(date) } };
    if (timestamp.deviation) {
      // an old fuzzy date (date ± deviation): a simple range of its limits, as legacy
      const earliest = date.estMinDate != null ? decimalToYMD(date.estMinDate) : '';
      const latest = date.estMaxDate != null ? decimalToYMD(date.estMaxDate) : '';
      const values = { ...common, earliest, latest };
      if (Number(timestamp.profile) > 0) values.profile = Number(timestamp.profile);
      return earliest && latest
        ? { kind: 'r', values }
        : { kind: 'r', values, note: 'The limits of this date (date ± deviation) are not known. Enter the range again.' };
    }
    return { kind: 's', values: { ...common, ...simpleValues(timestamp) } };
  }

  const start = date.start && typeof date.start === 'object' ? date.start : {};
  const end = date.end && typeof date.end === 'object' ? date.end : {};
  const tpq = text(start.earliest ?? start.in);
  const taq = text(end.latest ?? end.in);
  const pdb = text(start.latest);
  const pde = text(end.earliest);
  if (pdb || pde) {
    const values = { ...common, tpq, pdb, pde, taq };
    if (Number(start.profile) > 0) values.startProfile = Number(start.profile);
    if (Number(end.profile) > 0) values.endProfile = Number(end.profile);
    return { kind: 'p', values };
  }
  const values = { ...common, earliest: tpq, latest: taq };
  if (Number(date.profile) > 0) values.profile = Number(date.profile);
  return { kind: 'r', values };
}

/** Simple date values of a timestamp: date, time, time zone, precision. */
function simpleValues(timestamp) {
  const values = { ...splitDateTime(text(timestamp.in)) };
  values.approx = timestamp.circa ? 'circa' : timestamp.before ? 'before' : timestamp.after ? 'after' : 'exact';
  return values;
}

/** Radiometric values of a temporal object. */
function radiometricValues(date) {
  const timestamp = date.timestamp;
  const year = Number.parseInt(timestamp.in, 10);
  const bp = timestamp.bp === true || timestamp.bp === 1 || timestamp.bp === '1' || timestamp.bp === 'true';
  const values = { meanType: bp ? 'bp' : 'bce' };
  if (Number.isFinite(year)) values.mean = bp ? BP_YEAR - year : -year;
  if (timestamp.deviation) {
    values.devType = 'sym';
    values.dev = deviationYears(timestamp.deviation);
  } else if (timestamp.deviation_negative || timestamp.deviation_positive) {
    values.devType = 'asym';
    values.devNeg = deviationYears(timestamp.deviation_negative);
    values.devPos = deviationYears(timestamp.deviation_positive);
  } else {
    values.devType = 'sym';
  }
  if (date.labcode) values.labcode = String(date.labcode);
  values.calibrated = Boolean(date.calibrated) && date.calibrated !== '0';
  return values;
}

/**
 * The stored value of a form: plain date text for a simple date without anything
 * else, otherwise temporal JSON text.
 *
 * @param {string} kind `s`, `r`, `p` or `c`.
 * @param {object} values Form values.
 * @returns {string} The value ('' when there is no date).
 */
export function formToTemporal(kind, values = {}) {
  let date;
  switch (kind) {
    case 'r':
      date = {
        start: { earliest: text(values.earliest) },
        end: { latest: text(values.latest) }
      };
      if (Number(values.profile) > 0) date.profile = Number(values.profile);
      break;
    case 'p':
      date = { start: { earliest: text(values.tpq) }, end: {} };
      if (text(values.pdb)) date.start.latest = text(values.pdb);
      if (Number(values.startProfile) > 0) date.start.profile = Number(values.startProfile);
      if (text(values.pde)) date.end.earliest = text(values.pde);
      date.end.latest = text(values.taq);
      if (Number(values.endProfile) > 0) date.end.profile = Number(values.endProfile);
      break;
    case 'c':
      date = radiometricObject(values);
      break;
    default: {
      const dateText = text(values.date);
      if (!dateText) return '';
      const approx = ['circa', 'before', 'after'].includes(values.approx) ? values.approx : null;
      const plain = !approx && !text(values.time) && !text(values.comment) && !(Number(values.determination) > 0);
      if (plain) return dateText;
      date = { timestamp: { in: joinDateTime(dateText, text(values.time), text(values.zone)), type: 's' } };
      if (approx) date.timestamp[approx] = true;
    }
  }
  if (kind !== 'c' && Number(values.determination) > 0) date.determination = Number(values.determination);
  if (text(values.comment)) date.comment = text(values.comment);
  return JSON.stringify(date);
}

/** Temporal object of the radiometric values. */
function radiometricObject(values) {
  const mean = Number.parseInt(values.mean, 10);
  const bp = values.meanType === 'bp';
  const timestamp = { in: bp ? BP_YEAR - mean : -mean, type: 'c', bp };
  if (values.devType === 'asym') {
    if (Number(values.devNeg) > 0) timestamp.deviation_negative = `P${Number.parseInt(values.devNeg, 10)}Y`;
    if (Number(values.devPos) > 0) timestamp.deviation_positive = `P${Number.parseInt(values.devPos, 10)}Y`;
  } else if (Number(values.dev) > 0) {
    timestamp.deviation = `P${Number.parseInt(values.dev, 10)}Y`;
  }
  const date = { timestamp, native: `${mean} ${bp ? 'BP' : 'BCE'}` };
  if (text(values.labcode)) date.labcode = text(values.labcode);
  if (values.calibrated === true || values.calibrated === 'true' || values.calibrated === 1) date.calibrated = 1;
  return date;
}

/**
 * Check the values of a form (the field checks of HEditForm come first).
 *
 * @param {string} kind `s`, `r`, `p` or `c`.
 * @param {object} values Form values.
 * @returns {Array<{field: string, message: string}>} Problems (English messages).
 */
export function validateTemporal(kind, values = {}) {
  const problems = [];
  for (const name of DATE_FIELDS[kind] || []) {
    if (text(values[name]) && !parseDate(text(values[name]))) {
      problems.push({ field: name, message: 'Enter a year (1624), yyyy-mm or yyyy-mm-dd; minus for BCE (-375)' });
    }
  }
  if (problems.length) return problems;
  const required = (name, message) => {
    if (!text(values[name])) problems.push({ field: name, message });
  };
  if (kind === 's') {
    required('date', 'Enter a date');
  } else if (kind === 'r') {
    required('earliest', 'Both earliest and latest estimates are required');
    required('latest', 'Both earliest and latest estimates are required');
    if (!problems.length && dateKey(values.earliest) >= dateKey(values.latest)) {
      problems.push({ field: 'latest', message: 'Earliest estimate needs to be before latest estimate' });
    }
  } else if (kind === 'p') {
    required('tpq', 'Terminus Post Quem is required');
    required('taq', 'Terminus Ante Quem is required');
    if (!problems.length) {
      const order = ['tpq', 'pdb', 'pde', 'taq'].filter((name) => text(values[name]));
      for (let index = 1; index < order.length; index++) {
        if (dateKey(values[order[index - 1]]) > dateKey(values[order[index]])) {
          problems.push({ field: order[index], message: 'The dates must be in order: TPQ, probable begin, probable end, TAQ' });
          break;
        }
      }
      if (!problems.length && dateKey(values.tpq) >= dateKey(values.taq)) {
        problems.push({ field: 'taq', message: 'Terminus Post Quem needs to be before Terminus Ante Quem' });
      }
    }
  } else if (kind === 'c') {
    if (!Number.isFinite(Number.parseInt(values.mean, 10))) problems.push({ field: 'mean', message: 'Enter the mean date' });
  }
  return problems;
}

/**
 * Distance between two dates in the Gregorian calendar, as PHP DateTime::diff
 * (the legacy "Range" line of the simple range).
 *
 * @param {string} from Earlier date text.
 * @param {string} to Later date text.
 * @returns {{years: number, months: number, days: number}|null} Null when a date is not readable or not later.
 */
export function rangeApart(from, to) {
  const a = parseDate(text(from));
  const b = parseDate(text(to));
  if (!a || !b || dateKey(from) >= dateKey(to)) return null;
  const start = { year: a.year, month: a.month || 1, day: a.day || 1 };
  const end = { year: b.year, month: b.month || 1, day: b.day || 1 };
  // whole months from the start (the day kept, or the last day of a shorter month), then days
  let months = (end.year - start.year) * 12 + (end.month - start.month);
  let step = addMonths(start, months);
  if (dayNumber(step) > dayNumber(end)) step = addMonths(start, --months);
  return { years: Math.floor(months / 12), months: months % 12, days: dayNumber(end) - dayNumber(step) };
}

/** A date plus a number of months; the day is kept or becomes the last day of the month. */
function addMonths(date, months) {
  const index = date.year * 12 + (date.month - 1) + months;
  const year = Math.floor(index / 12);
  const month = index - year * 12 + 1;
  return { year, month, day: Math.min(date.day, daysInMonth(year, month)) };
}

/** Day number of a proleptic Gregorian date (any year; days from civil). */
function dayNumber({ year, month, day }) {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yearOfEra = y - era * 400;
  const dayOfYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra;
}

/**
 * Decimal date (YYYY.MMDD, estMinDate / estMaxDate) to date text, keeping its
 * precision (port of Temporal::decimalToYMD without `$upper`).
 *
 * @param {number|string} decimal Decimal date.
 * @returns {string} `1850`, `1850-07`, `1850-07-15`, `-0100-04`.
 */
export function decimalToYMD(decimal) {
  const raw = String(decimal ?? '').trim();
  const source = /^-?\d+(\.\d+)?$/.test(raw) ? raw : Number(decimal).toFixed(4);
  const negative = source.startsWith('-');
  const [whole, fraction = ''] = source.replace(/^-/, '').split('.');
  const digits = fraction.slice(0, 4).padEnd(4, '0');
  const year = Number(whole) * (negative ? -1 : 1);
  const month = Number(digits.slice(0, 2));
  const day = Number(digits.slice(2, 4));
  if (month < 1) return String(year);
  const yearText = `${year < 0 ? '-' : ''}${String(Math.abs(year)).padStart(4, '0')}`;
  const result = `${yearText}-${String(month).padStart(2, '0')}`;
  return day > 0 ? `${result}-${String(day).padStart(2, '0')}` : result;
}

/** Date, time and time zone of a timestamp text (`1969-05-03 10:20:00 +2`). */
function splitDateTime(value) {
  const match = /^(-?[^\sT]+)(?:[\sT]+(\d{1,2}(?::\d{2}){0,2}))?(?:\s*(?:UTC|GMT)?\s*([+-]\d{1,2}(?::?\d{2})?|Z))?$/i.exec(value);
  if (!match) return { date: value };
  const values = { date: match[1] };
  if (match[2]) values.time = match[2];
  if (match[3]) values.zone = match[3];
  return values;
}

/** Timestamp text of a date, time and time zone (the zone only with a time, as legacy). */
function joinDateTime(date, time, zone) {
  if (!time) return date;
  const offset = zone && !/^[+-]|^z$/i.test(zone) ? `+${zone}` : zone;
  return offset ? `${date} ${time} ${offset}` : `${date} ${time}`;
}

/** Years of an ISO duration (`P10Y`), '' when none. */
function deviationYears(value) {
  const match = /^P(\d+)Y/i.exec(String(value || ''));
  return match ? Number(match[1]) : '';
}

/** Sort key of a date text: year, month and day as one number (0 when not given). */
function dateKey(value) {
  const date = parseDate(text(value));
  return date ? date.year * 10000 + (date.month || 0) * 100 + (date.day || 0) : Number.NaN;
}

/** Days of a month (proleptic Gregorian). */
function daysInMonth(year, month) {
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

/** Trimmed text of a value ('' for null). */
function text(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}
