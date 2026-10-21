/**
 * @file editFormSchema.js
 * @brief The JSON of HEditForm (plan 14a): normalising a form definition, the
 *        `showWhen` conditions, and values in and out of the form.
 *
 *   {format: 'heurist-edit-form/1', localized, groups: [{id, type: 'tabs'|'accordion'|'group',
 *    label, help, showWhen, slot, columns, inner, newTabs, open, explanation, children: [field]}]}
 *   field: {name, type, label, help, req, max, default, terms, vocabulary, mode, minValue, maxValue,
 *           step, maxLength, pattern, patternMessage, rows, width, targetTypes, geoKind, multilang,
 *           readOnly, clearable, showWhen, special, dty?}
 *
 * `max` is the number of values (1 default, 0 any); `minValue` / `maxValue` limit a number.
 * `width` is a number of characters (as rst_DisplayWidth) or a CSS length ("400px",
 * "20em", "50%"); it sets the width of the input of every field type.
 *
 * Groups are a flat list. An `inner` group (`group` or `accordion`) is a part of the
 * previous outer group: a heading with its fields, or a collapsible section, inside
 * it (the legacy inner separators). Consecutive `tabs` groups are one tab set;
 * `newTabs` starts another one. `open`: an accordion is open (default: the first
 * outer accordion of the form). `explanation`: the heading and help are a text
 * of their own (the legacy explanation separator).
 *
 * The record edit structure (recordEditStructure.js) is the same JSON with `dty`
 * instead of `name`: a field without a name gets `String(dty)`.
 *
 * Values of the form: `{name: value}`; a repeatable field (`max` 0 or more than 1)
 * or a multilingual one has an array. A dotted name ("toolbar.position") is a
 * nested object. A value hidden from the public is `{value, hidden: true}`, a
 * translation is `"xxx:text"` (the record value format). Numbers and booleans are
 * native here; the record editor keeps the record format (recordEditValues.js).
 *
 * Inside the form a field has a state `{values: [entry], translations: [{lang, value, hidden}]}`,
 * entry `{value, hidden, label?, file?}` (as HEditField.getState()).
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

import { splitLanguage, unpackValue } from './recordEditValues.js';
import { extentToWkt, isExtent } from '../utils/geoExtent.js';

/** Format name of the form JSON. */
export const EDIT_FORM_FORMAT = 'heurist-edit-form/1';

/** Field types of the form (record field types plus color, json and special). */
export const EDIT_FIELD_TYPES = Object.freeze([
  'freetext', 'blocktext', 'url', 'integer', 'float', 'year', 'date', 'boolean', 'enum', 'relationtype',
  'resource', 'file', 'geo', 'color', 'json', 'special', 'relmarker'
]);

const KNOWN_TYPES = new Set(EDIT_FIELD_TYPES);
const GROUP_TYPES = new Set(['tabs', 'accordion', 'group']);
const REQUIREMENTS = new Set(['required', 'recommended', 'optional']);
const NUMERIC_TYPES = new Set(['integer', 'float', 'year']);

/**
 * A form definition with every property set: defaults, a name for every field,
 * unknown field types as freetext. Problems are listed, not thrown.
 *
 * @param {object} json Form JSON (or a record edit structure).
 * @returns {{form: object, warnings: string[]}} The normalised form and the problems found.
 */
export function normalizeEditForm(json) {
  const warnings = [];
  const source = json && typeof json === 'object' ? json : {};
  if (source.format && source.format !== EDIT_FORM_FORMAT) warnings.push(`Unknown format "${source.format}"`);
  const names = new Set();
  let hasOuter = false;
  const groups = (Array.isArray(source.groups) ? source.groups : []).map((group, index) => {
    const type = GROUP_TYPES.has(group?.type) ? group.type : 'group';
    if (group?.type && type !== group.type) warnings.push(`Group ${index + 1}: unknown type "${group.type}"`);
    // an inner group needs an outer group before it; tabs are never inner
    const inner = group?.inner === true && hasOuter && type !== 'tabs';
    if (group?.inner === true && !inner) warnings.push(`Group ${index + 1}: not an inner group`);
    if (!inner) hasOuter = true;
    const children = [];
    for (const [position, item] of (Array.isArray(group?.children) ? group.children : []).entries()) {
      const field = normalizeField(item, warnings, `Group ${index + 1}, field ${position + 1}`);
      if (!field) continue;
      if (names.has(field.name)) warnings.push(`Field "${field.name}" is defined twice`);
      names.add(field.name);
      children.push(field);
    }
    return {
      id: group?.id != null && group.id !== '' ? String(group.id) : `g${index + 1}`,
      type,
      label: group?.label ?? null,
      help: String(group?.help ?? ''),
      showWhen: conditionOf(group?.showWhen),
      slot: group?.slot ? String(group.slot) : null,
      // fields in a grid of n columns, row by row (e.g. from / to pairs)
      columns: Number(group?.columns) > 1 ? Math.min(Math.floor(Number(group.columns)), 6) : 1,
      inner,
      newTabs: type === 'tabs' && !inner && group?.newTabs === true,
      open: typeof group?.open === 'boolean' ? group.open : null,
      explanation: group?.explanation === true,
      children,
      ...(group?.nonStandard ? { nonStandard: true } : {})
    };
  });
  return {
    form: { format: EDIT_FORM_FORMAT, localized: source.localized === true, ...(source.rty ? { rty: source.rty } : {}), groups },
    warnings
  };
}

/**
 * One field with every property set.
 *
 * @param {object} item Field JSON.
 * @param {string[]} warnings Problems found (appended).
 * @param {string} where Position for the messages.
 * @returns {object|null} Field, or null when it has neither name nor dty.
 */
function normalizeField(item, warnings, where) {
  if (!item || typeof item !== 'object') return null;
  const dty = Number(item.dty) > 0 ? Number(item.dty) : null;
  const name = String(item.name ?? (dty ? String(dty) : '')).trim();
  if (!name) {
    warnings.push(`${where}: no name`);
    return null;
  }
  let type = String(item.type || 'freetext');
  if (!KNOWN_TYPES.has(type)) {
    warnings.push(`Field "${name}": unknown type "${type}", shown as text`);
    type = 'freetext';
  }
  let req = String(item.req || (item.required === true ? 'required' : 'optional')).toLowerCase();
  if (!REQUIREMENTS.has(req)) req = 'optional';
  const terms = Array.isArray(item.terms)
    ? item.terms.map((term) => (term && typeof term === 'object'
      ? { id: term.id, label: String(term.label ?? term.id), depth: Number(term.depth) || 1 }
      : { id: term, label: String(term), depth: 1 }))
    : null;
  const number = (value) => (value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value));
  return {
    ...item,
    name,
    dty,
    type,
    label: String(item.label ?? name),
    help: String(item.help ?? ''),
    req,
    max: Math.max(0, Number(item.max ?? 1) || 0),
    default: item.default ?? null,
    terms,
    vocabulary: Number(item.vocabulary) > 0 ? Number(item.vocabulary) : null,
    mode: ['select', 'radio', 'checkbox'].includes(item.mode) ? item.mode : null,
    minValue: number(item.minValue),
    maxValue: number(item.maxValue),
    step: number(item.step),
    maxLength: Number(item.maxLength) > 0 ? Number(item.maxLength) : null,
    pattern: item.pattern ? String(item.pattern) : null,
    patternMessage: item.patternMessage ? String(item.patternMessage) : '',
    rows: Number(item.rows ?? item.height) > 0 ? Number(item.rows ?? item.height) : null,
    width: widthOf(item.width),
    targetTypes: Array.isArray(item.targetTypes) ? item.targetTypes.map(Number).filter((id) => id > 0) : [],
    geoKind: item.geoKind === 'extent' ? 'extent' : 'feature',
    multilang: item.multilang === true,
    readOnly: item.readOnly === true,
    // false: no clear button (a setting that always has a value; single value fields only)
    clearable: item.clearable !== false,
    showWhen: conditionOf(item.showWhen),
    special: item.special ?? null
  };
}

/** CSS lengths accepted as a field width. */
const CSS_WIDTH = /^\d+(\.\d+)?(px|em|rem|ch|%)$/;

/**
 * Width of a field: a number of characters, or a CSS length.
 *
 * @param {*} value `width` of the JSON (20, "20", "400px").
 * @returns {number|string} Characters (0: no width), or the CSS length.
 */
export function widthOf(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (CSS_WIDTH.test(text)) return text;
  return Math.max(0, Number(text) || 0);
}

/**
 * CSS width of a field's input.
 *
 * @param {number|string} width Normalised width (widthOf).
 * @returns {string} CSS length, or '' when the field has no width.
 */
export function cssWidth(width) {
  if (typeof width === 'string' && CSS_WIDTH.test(width)) return width;
  const characters = Number(width) || 0;
  return characters > 0 ? `${Math.min(characters, 200)}ch` : '';
}

/** @returns {object|null} A showWhen condition (a plain object), or null. */
function conditionOf(value) {
  return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length ? { ...value } : null;
}

/**
 * Every field of a form, in form order.
 *
 * @param {{groups: Array<object>}} form Normalised form.
 * @returns {Array<object>} Fields.
 */
export function formFields(form) {
  return (form?.groups || []).flatMap((group) => group.children || []);
}

/**
 * @param {object} field Normalised field.
 * @returns {boolean} Whether the value of the field is a list in the output.
 */
export function isListField(field) {
  return field.multilang === true || field.max !== 1;
}

/**
 * Whether a `showWhen` condition holds: every listed field has one of the listed
 * values (a list means "any of"; a list value of the field matches when one of its
 * values does). No condition: always.
 *
 * @param {object|null} condition `{name: value | [values]}`.
 * @param {object} values Current form values (`getValues` shape, flat by field name).
 * @returns {boolean}
 */
export function isVisible(condition, values) {
  if (!condition) return true;
  for (const [name, expected] of Object.entries(condition)) {
    const wanted = (Array.isArray(expected) ? expected : [expected]).map(comparable);
    const actual = values?.[name];
    const present = (Array.isArray(actual) ? actual : [actual]).map((item) => comparable(plainValue(item)));
    if (!present.some((item) => wanted.includes(item))) return false;
  }
  return true;
}

/** @returns {string} A value compared as text ("1" = 1, "true" = true; empty = ""). */
function comparable(value) {
  return value === null || value === undefined ? '' : String(value);
}

/** @returns {*} The value of a `{value, hidden}` item. */
function plainValue(item) {
  return item && typeof item === 'object' && 'value' in item ? item.value : item;
}

/**
 * Output value of one field from its state.
 *
 * @param {object} field Normalised field.
 * @param {{values: Array<object>, translations?: Array<object>}} state Field state.
 * @returns {*} Scalar (or null) for a single value field, an array otherwise.
 */
export function stateToValue(field, state) {
  const list = [];
  for (const entry of state?.values || []) {
    const value = nativeValue(field, entry?.value);
    if (value === null) continue;
    list.push(entry.hidden ? { value, hidden: true } : value);
  }
  for (const translation of state?.translations || []) {
    const text = String(translation.value ?? '');
    if (!translation.lang || !text.trim()) continue;
    const value = `${translation.lang}:${text}`;
    list.push(translation.hidden ? { value, hidden: true } : value);
  }
  return isListField(field) ? list : list[0] ?? null;
}

/**
 * State of one field from an output value (or a default value).
 *
 * @param {object} field Normalised field.
 * @param {*} value Scalar, array, `{value, hidden}` items, or resolved record values.
 * @returns {{values: Array<object>, translations: Array<object>}}
 */
export function valueToState(field, value) {
  const values = [];
  const translations = [];
  const items = value === null || value === undefined ? [] : Array.isArray(value) ? value : [value];
  for (const item of items) {
    const raw = field.type === 'json' && item && typeof item === 'object' && !('value' in item) ? JSON.stringify(item, null, 2) : item;
    // a static term list may have text ids: not the numeric term id of a record value
    const entry = field.terms && (field.type === 'enum' || field.type === 'relationtype')
      ? staticTermEntry(raw)
      : field.type === 'geo' && (isExtent(raw) || isExtent(raw?.value))
        ? { value: isExtent(raw) ? raw : raw.value, hidden: Boolean(raw?.hidden) }
      : unpackValue(field.type, typeof raw === 'number' || typeof raw === 'boolean' ? String(raw) : raw);
    if (!entry) continue;
    if (field.type === 'json' && entry.value && typeof entry.value === 'object') entry.value = JSON.stringify(entry.value, null, 2);
    if (field.multilang && typeof entry.value === 'string') {
      const { lang, text } = splitLanguage(entry.value);
      if (lang) {
        translations.push({ lang, value: text, hidden: entry.hidden });
        continue;
      }
    }
    values.push(entry);
  }
  return { values, translations };
}

/** @returns {{value: *, hidden: boolean}|null} Entry of a value of a static term list. */
function staticTermEntry(raw) {
  const hidden = Boolean(raw && typeof raw === 'object' && raw.hidden);
  const value = raw && typeof raw === 'object' ? raw.value ?? raw.trm_ID ?? null : raw;
  return value === null || value === undefined || value === '' ? null : { value, hidden };
}

/**
 * The value of an input as the form gives it: numbers, booleans, term ids as
 * defined, text as typed; empty values are null.
 *
 * @param {object} field Normalised field.
 * @param {*} value Input value.
 * @returns {*} Value, or null when empty.
 */
export function nativeValue(field, value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  if (NUMERIC_TYPES.has(field.type)) {
    const number = Number(value);
    return Number.isFinite(number) ? number : String(value);
  }
  if (field.type === 'boolean') {
    const text = String(value).toLowerCase();
    return text === 'true' ? true : text === 'false' ? false : null;
  }
  if (field.type === 'enum' || field.type === 'relationtype') {
    // a static term list keeps the type of its ids; a vocabulary has numeric term ids
    const term = (field.terms || []).find((item) => String(item.id) === String(value));
    if (term) return term.id;
    const number = Number(value);
    return field.terms ? value : Number.isFinite(number) ? number : value;
  }
  if (field.type === 'geo') {
    // extent: the bounding box {west, south, east, north}; feature: WKT
    if (field.geoKind === 'extent') return isExtent(value) ? value : String(value);
    return isExtent(value) ? extentToWkt(value) : String(value);
  }
  if (field.type === 'resource' || field.type === 'file') {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  }
  return value;
}

/**
 * States of every field from form values (missing fields: their default value).
 *
 * @param {object} form Normalised form.
 * @param {object|null} values Values (nested by dotted names), or null for the defaults.
 * @returns {Map<string, {values: Array<object>, translations: Array<object>}>} By field name.
 */
export function formStates(form, values = null) {
  const result = new Map();
  for (const field of formFields(form)) {
    const value = values ? getPath(values, field.name) : undefined;
    result.set(field.name, valueToState(field, value === undefined ? defaultValue(field) : value));
  }
  return result;
}

/**
 * The default value of a field (`default`; "today" for a date field).
 *
 * @param {object} field Normalised field.
 * @returns {*} Value, or null.
 */
export function defaultValue(field) {
  const value = field.default;
  if (value === null || value === undefined || value === '') return null;
  if (field.type === 'date' && value === 'today') return new Date().toISOString().slice(0, 10);
  return value;
}

/**
 * Form values from the field states: visible fields only, dotted names nested.
 *
 * @param {object} form Normalised form.
 * @param {Map<string, object>} states Field states by name.
 * @param {(field: object) => boolean} [isShown] Whether a field is shown (default: all).
 * @returns {object} Values.
 */
export function formValues(form, states, isShown = () => true) {
  const result = {};
  for (const field of formFields(form)) {
    if (field.type === 'relmarker' || !isShown(field)) continue;
    setPath(result, field.name, stateToValue(field, states.get(field.name)));
  }
  return result;
}

/**
 * Flat values by field name (for showWhen), without the visibility of fields.
 *
 * @param {object} form Normalised form.
 * @param {Map<string, object>} states Field states by name.
 * @returns {Object<string, *>} Values by full field name.
 */
export function flatValues(form, states) {
  const result = {};
  for (const field of formFields(form)) result[field.name] = stateToValue(field, states.get(field.name));
  return result;
}

/**
 * Read a dotted path of an object ("a.b" → object.a.b; a key with the dot itself wins).
 *
 * @param {object} object Source.
 * @param {string} path Name.
 * @returns {*} Value, or undefined.
 */
export function getPath(object, path) {
  if (!object || typeof object !== 'object') return undefined;
  if (Object.prototype.hasOwnProperty.call(object, path)) return object[path];
  let current = object;
  for (const part of String(path).split('.')) {
    if (!current || typeof current !== 'object' || !Object.prototype.hasOwnProperty.call(current, part)) return undefined;
    current = current[part];
  }
  return current;
}

/**
 * Write a dotted path into an object, creating the nested objects.
 *
 * @param {object} object Target.
 * @param {string} path Name.
 * @param {*} value Value.
 * @returns {void}
 */
export function setPath(object, path, value) {
  const parts = String(path).split('.');
  let current = object;
  for (const part of parts.slice(0, -1)) {
    if (!current[part] || typeof current[part] !== 'object' || Array.isArray(current[part])) current[part] = {};
    current = current[part];
  }
  current[parts[parts.length - 1]] = value;
}
