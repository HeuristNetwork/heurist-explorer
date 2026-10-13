/**
 * @file recordEditValues.js
 * @brief Values of the record editor: from a loaded record (write format of
 *        plan 14) to editable field values and back to a request body.
 *
 * A loaded record has `details` keyed by field id, arrays of compact or
 * resolved values; `{value, hidden:true}` marks a value hidden from the public.
 * The editor keeps per field `{values: [entry], translations: [{lang, value, hidden}]}`,
 * entry `{value, hidden, label?, file?}`: compact value (text, term id, record id,
 * ulf_ID, date text, WKT) plus what is shown for it. Translations are the values
 * of a multilingual field with a language prefix ("fre:Nom").
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

import { extentToWkt, isExtent } from '../utils/geoExtent.js';
import { structureFields } from './recordEditStructure.js';

/** Common 2-letter language codes accepted as prefixes (3-letter codes are always accepted). */
const TWO_LETTER_LANGUAGES = new Set([
  'ar', 'cs', 'da', 'de', 'el', 'en', 'es', 'fa', 'fi', 'fr', 'he', 'hi', 'hu', 'id', 'it', 'ja', 'ko',
  'nl', 'no', 'pl', 'pt', 'ro', 'ru', 'sv', 'tr', 'uk', 'vi', 'zh'
]);

/** Headers a save sends back unchanged when the editor does not show them. */
const KEPT_HEADERS = ['rec_URL', 'rec_ScratchPad', 'rec_Modified'];

/**
 * Language prefix of a value.
 *
 * @param {*} value Field value.
 * @returns {{lang: string|null, text: string}} `lang` as written (e.g. "fre", "*"), or null.
 */
export function splitLanguage(value) {
  const text = String(value ?? '');
  const match = /^(\*|[A-Za-z]{2,3}):(.*)$/s.exec(text);
  if (!match) return { lang: null, text };
  const code = match[1];
  if (code.length === 2 && !TWO_LETTER_LANGUAGES.has(code.toLowerCase())) return { lang: null, text };
  return { lang: code, text: match[2] };
}

/**
 * Editable entry of one stored value.
 *
 * @param {string} type Field type.
 * @param {*} raw Stored value (compact or resolved object).
 * @returns {{value: *, hidden: boolean, label?: string, file?: object}|null} Null for an empty value.
 */
export function unpackValue(type, raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  const hidden = Boolean(raw && typeof raw === 'object' && raw.hidden);
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    if (type === 'geo' || raw.geo) {
      const geo = raw.geo || {};
      return { value: String(geo.wkt ?? raw.value ?? ''), hidden, geoType: geo.type || null };
    }
    if (type === 'resource') {
      return { value: Number(raw.rec_ID ?? raw.value) || null, hidden, label: raw.rec_Title || '' };
    }
    if (type === 'enum' || type === 'relationtype') {
      return { value: Number(raw.trm_ID ?? raw.value) || null, hidden, label: raw.trm_Label || '' };
    }
    if (type === 'file') {
      const file = raw.file || null;
      return {
        value: Number(file?.ulf_ID ?? raw.value) || null,
        hidden,
        label: file?.ulf_OrigFileName || file?.ulf_ExternalFileReference || '',
        file
      };
    }
    return { value: raw.value ?? '', hidden };
  }
  if (type === 'resource' || type === 'enum' || type === 'relationtype' || type === 'file') {
    return { value: Number(raw) || null, hidden };
  }
  return { value: raw, hidden };
}

/**
 * Editable values of every field of the structure.
 *
 * @param {object|null} record Loaded record (null: new record).
 * @param {{groups: Array<object>}} structure Edit structure.
 * @returns {Map<number, {values: Array<object>, translations: Array<object>}>} By field id.
 */
export function recordFieldValues(record, structure) {
  const result = new Map();
  for (const field of structureFields(structure)) {
    const raw = record?.details?.[String(field.dty)] || [];
    const values = [];
    const translations = [];
    for (const item of Array.isArray(raw) ? raw : [raw]) {
      const entry = unpackValue(field.type, item);
      if (!entry) continue;
      if (field.multilang && typeof entry.value === 'string') {
        const { lang, text } = splitLanguage(entry.value);
        if (lang) {
          translations.push({ lang, value: text, hidden: entry.hidden });
          continue;
        }
      }
      values.push(entry);
    }
    result.set(field.dty, { values, translations });
  }
  return result;
}

/**
 * Values of a new record: the default values of the structure (none for separators
 * and special defaults such as "increment_new_values_by_1").
 *
 * @param {{groups: Array<object>}} structure Edit structure.
 * @returns {Map<number, {values: Array<object>, translations: Array<object>}>}
 */
export function defaultFieldValues(structure) {
  const result = new Map();
  for (const field of structureFields(structure)) {
    const text = String(field.default ?? '').trim();
    const usable = text !== '' && !/^increment_new_values/i.test(text) && field.type !== 'relmarker';
    const entry = usable ? unpackValue(field.type, text === 'today' && field.type === 'date' ? today() : text) : null;
    result.set(field.dty, { values: entry ? [entry] : [], translations: [] });
  }
  return result;
}

/**
 * Request value of one entry: compact, `{value, hidden:true}` when hidden,
 * geo as `{geo:{type, wkt}}`.
 *
 * @param {string} type Field type.
 * @param {{value: *, hidden?: boolean, geoType?: string}} entry Editor entry.
 * @returns {*} Value for `details`, or null when empty.
 */
export function packValue(type, entry) {
  let value = entry?.value;
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) return null;
  if (type === 'geo') {
    const wkt = isExtent(value) ? extentToWkt(value) : String(value);
    const geo = { wkt };
    if (entry.geoType && !isExtent(value)) geo.type = entry.geoType;
    return entry.hidden ? { geo, hidden: true } : { geo };
  }
  if (typeof value === 'number') value = String(value);
  return entry.hidden ? { value, hidden: true } : value;
}

/**
 * `details` of a request body from the editor values: every field of the
 * structure, `[]` for an empty one (PUT clears it); translations follow the
 * values with their language prefix.
 *
 * @param {Map<number, {values: Array<object>, translations: Array<object>}>} fields Editor values.
 * @param {{groups: Array<object>}} structure Edit structure.
 * @returns {Object<string, Array>} Details.
 */
export function fieldsToDetails(fields, structure) {
  const details = {};
  for (const field of structureFields(structure)) {
    if (field.type === 'relmarker') continue;
    const state = fields.get(field.dty) || { values: [], translations: [] };
    const list = [];
    for (const entry of state.values || []) {
      const value = packValue(field.type, entry);
      if (value !== null) list.push(value);
    }
    for (const translation of state.translations || []) {
      const text = String(translation.value ?? '');
      if (!translation.lang || !text.trim()) continue;
      const value = `${translation.lang}:${text}`;
      list.push(translation.hidden ? { value, hidden: true } : value);
    }
    details[String(field.dty)] = list;
  }
  return details;
}

/**
 * Request body of a save (POST insert or PUT replace).
 *
 * @param {object} options
 * @param {object|null} options.record Loaded record (null: new record).
 * @param {number} options.rectypeId Record type.
 * @param {{owner: number, visibility: string, viewGroups: number[], editGroups: number[]}} options.header Ownership.
 * @param {Map} options.fields Editor values.
 * @param {{groups: Array<object>}} options.structure Edit structure.
 * @returns {object} Record in the write format.
 */
export function buildRecordBody({ record, rectypeId, header, fields, structure }) {
  const body = {
    rec_ID: String(Number(record?.rec_ID) || 0),
    rec_RecTypeID: String(Number(record?.rec_RecTypeID ?? rectypeId) || 0),
    rec_OwnerUGrpID: String(Number(header?.owner) || 0),
    rec_NonOwnerVisibility: header?.visibility || 'viewable',
    rec_NonOwnerVisibilityGroups: (header?.visibility === 'viewable' ? header?.viewGroups || [] : []).map(String),
    rec_EditGroups: (header?.editGroups || []).map(String)
  };
  for (const name of KEPT_HEADERS) {
    if (record && record[name] !== undefined) body[name] = record[name];
  }
  // fields of the stored record that are not in the structure (kept by PUT only when sent)
  const known = new Set(structureFields(structure).map((field) => String(field.dty)));
  const details = fieldsToDetails(fields, structure);
  for (const [key, values] of Object.entries(record?.details || {})) {
    if (!known.has(key) && /^\d+$/.test(key)) details[key] = values;
  }
  body.details = details;
  return body;
}

/** @returns {string} Today as YYYY-MM-DD (default value "today" of date fields). */
function today() {
  const now = new Date();
  const pad = (number) => String(number).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
