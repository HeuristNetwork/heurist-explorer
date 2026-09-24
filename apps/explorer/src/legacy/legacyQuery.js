/**
 * @file legacyQuery.js
 * @brief Legacy saved-filter query helpers: URL parameters, JSON query key rewrites, strict text → JSON.
 *
 * Part of the removable legacy Saved Filter conversion module (see
 * docs/development/Saved-Filter-Legacy-Conversion-Plan.md §14). Pure and DOM-free.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-explorer
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { parseTextQuery } from '../utils/parseTextQuery.js';

const URL_PARAMS = ['q', 'w', 'rules', 'rulesonly', 'notes', 'viewmode', 'db'];

const LINK_BASES = Object.freeze({
  lt: 'lt', linked_to: 'lt', linkedto: 'lt',
  lf: 'lf', linked_from: 'lf', linkedfrom: 'lf'
});

const RELATION_BASES = Object.freeze({
  rt: 'rt', related_to: 'rt', relatedto: 'rt',
  rf: 'rf', related_from: 'rf', relatedfrom: 'rf',
  related: 'related'
});

const RENAMED_BASES = Object.freeze({
  id: 'ids', ids: 'ids', type: 't', typeid: 't', typename: 't'
});

/** Keys whose values are nested predicate lists. */
const GROUP_BASES = new Set(['any', 'all', 'not']);

/**
 * Read legacy `?q=…&w=…&rules=…` parameters exactly like legacy `getUrlParameter`.
 *
 * @param {string} text Stored value beginning with `?`.
 * @returns {object} Known parameters that are present, plus `unknown` names.
 */
export function parseUrlParams(text) {
  const source = String(text || '');
  const result = {};

  for (const name of URL_PARAMS) {
    const match = new RegExp(`[?&]${name}=([^&#]*)`).exec(source);
    if (match) result[name] = safeDecode(match[1]).trim();
  }

  const unknown = [...source.matchAll(/[?&]([A-Za-z_]+)=/g)]
    .map((match) => match[1])
    .filter((name) => !URL_PARAMS.includes(name));
  if (unknown.length) result.unknown = [...new Set(unknown)];

  // DH-style damage: rules appended to q without "&rules=".
  if (result.q && result.rules === undefined) {
    const index = result.q.indexOf('[{"query"');
    if (index > 0) {
      result.rules = result.q.slice(index).trim();
      result.q = result.q.slice(0, index).trim();
    }
  }

  return result;
}

/**
 * Parse a JSON string, returning `undefined` when it is not JSON.
 *
 * @param {*} value Candidate value.
 * @returns {*} Parsed value, the value itself when not a string, or `undefined`.
 */
export function parseJson(value) {
  if (typeof value !== 'string') return value;
  const text = value.trim();
  if (!text || (text[0] !== '{' && text[0] !== '[')) return undefined;
  try { return JSON.parse(text); } catch { return undefined; }
}

/**
 * Normalize a legacy JSON query (object or array form) to the canonical array form with
 * legacy link/relation keys rewritten (plan §6).
 *
 * @param {object|Array} query Legacy JSON query.
 * @param {{dbdefs?: object|null, warnings?: string[]}} [context] Definitions and warning sink.
 * @returns {Array<object>} One predicate per array element.
 */
export function normalizeJsonQuery(query, context = {}) {
  const items = Array.isArray(query) ? query : [query];
  const result = [];

  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    for (const [key, value] of Object.entries(item)) {
      result.push(rewritePredicate(key, value, context));
    }
  }

  return result;
}

/**
 * Relation-type constraint for a legacy relmarker field: the root of its vocabulary.
 *
 * @param {number|string} fieldId Relmarker detail type id.
 * @param {{dbdefs?: object|null, warnings?: string[]}} context Definitions and warning sink.
 * @returns {object|null} `{r: rootId}` or `null` when the vocabulary is unknown.
 */
export function relationTypePredicate(fieldId, context = {}) {
  const id = Number(fieldId);
  if (!(id > 0)) return null;
  const root = context.dbdefs?.vocabRoot?.(id);
  if (root) return { r: Number(root) || root };
  context.warnings?.push(`Relationship type constraint of field ${id} could not be resolved and was dropped.`);
  return null;
}

/**
 * Convert legacy text to a JSON query only when every token is a plain `key:value`.
 * Text with OR/AND, parentheses, bare words or link/relation keys is refused.
 *
 * @param {string} text Legacy text query.
 * @returns {Array<object>|null} Query array, or `null` when it cannot be converted safely.
 */
export function strictTextToJson(text) {
  const source = String(text ?? '').trim();
  if (!source) return [];
  if (/[()[\]{}]/.test(source)) return null;

  const tokens = source.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
  for (const token of tokens) {
    const match = /^([A-Za-z_]+)(?::[A-Za-z0-9_,.\-]+)*:(?:"[^"]*"|[^\s"]+)$/.exec(token);
    if (!match) return null;
    const base = match[1].toLowerCase();
    if (base in LINK_BASES || base in RELATION_BASES || base === 'links') return null;
  }

  const parsed = parseTextQuery(source);
  return parsed.length === tokens.length ? parsed : null;
}

/** Rewrite one legacy predicate (recursively for nested lists). */
function rewritePredicate(key, value, context) {
  const parts = String(key).split(':');
  const base = parts[0].toLowerCase();
  const suffix = parts.slice(1).filter((part) => part !== '');

  if (base in LINK_BASES) {
    const field = suffix.at(-1);
    const newKey = field ? `${LINK_BASES[base]}:${field}` : LINK_BASES[base];
    return { [newKey]: nestedValue(value, context) };
  }

  if (base in RELATION_BASES) {
    if (!Array.isArray(value) && !(value && typeof value === 'object')) return { [key]: value };
    const nested = nestedValue(value, context);
    const relation = suffix.length ? relationTypePredicate(suffix.at(-1), context) : null;
    if (relation && Array.isArray(nested)) nested.splice(firstNonTypeIndex(nested), 0, relation);
    return { [RELATION_BASES[base]]: nested };
  }

  if (GROUP_BASES.has(base) && Array.isArray(value)) {
    // A multi-key object inside a group is one AND-ed operand, not several.
    return { [base]: value.map((item) => {
      const list = normalizeJsonQuery(item, context);
      return list.length === 1 ? list[0] : { all: list };
    }) };
  }

  const newBase = RENAMED_BASES[base] || base;
  const newKey = [newBase, ...parts.slice(1)].join(':');
  return { [newKey]: nestedValue(value, context) };
}

/** Normalize a nested predicate list; scalar values pass through. */
function nestedValue(value, context) {
  if (Array.isArray(value)) return normalizeJsonQuery(value, context);
  if (value && typeof value === 'object') return normalizeJsonQuery(value, context);
  return value;
}

/** Index after a leading `{t}` predicate, so injected constraints follow the type. */
function firstNonTypeIndex(list) {
  return list.length && Object.hasOwn(list[0], 't') ? 1 : 0;
}

/** decodeURIComponent that tolerates stray `%`. */
function safeDecode(value) {
  try { return decodeURIComponent(value); } catch { return value; }
}
