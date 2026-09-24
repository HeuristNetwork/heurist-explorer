/**
 * @file legacyRules.js
 * @brief Convert legacy expansion rules (codes, text or JSON queries) to canonical JSON rules.
 *
 * Part of the removable legacy Saved Filter conversion module (plan §4). Pure and DOM-free.
 * Output matches HRuleBuilder `encodeRuleQuery`: `{query:{t, "<link>[:<dty>]":[{t},{r}]}, levels}`.
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

import { parseJson, strictTextToJson } from './legacyQuery.js';

/** Legacy `codes[5]` → canonical link key. */
const LINK_TYPES = ['links', 'lt', 'lf', 'rt', 'rf', 'related'];

/** Legacy text rule verb → linktype. */
const TEXT_VERBS = Object.freeze({
  links: 0, linked_to: 1, linkedfrom: 2, related_to: 3, relatedfrom: 4, related: 5
});

/**
 * Convert a legacy ruleset.
 *
 * @param {*} rules Ruleset as JSON string, array, single rule object, or empty.
 * @param {string[]} [warnings] Warning sink.
 * @returns {Array<object>} Canonical rules; `[]` when there are none.
 */
export function convertLegacyRules(rules, warnings = []) {
  if (rules == null || rules === '') return [];

  let value = rules;
  if (typeof value === 'string') {
    value = parseJson(value);
    if (value === undefined) {
      warnings.push(`Expansion rules could not be read and were dropped: ${rules}`);
      return [];
    }
  }
  if (value && !Array.isArray(value) && typeof value === 'object') value = [value];
  if (!Array.isArray(value)) return [];

  return value.map((rule) => convertRule(rule, warnings)).filter(Boolean);
}

/** Convert one rule and its levels. */
function convertRule(rule, warnings) {
  if (!rule || typeof rule !== 'object') return null;

  let query = null;
  if (Array.isArray(rule.codes) && rule.codes.length === 6) query = queryFromCodes(rule.codes, warnings);
  else if (rule.query && typeof rule.query === 'object') query = rule.query;
  else if (typeof rule.query === 'string') {
    const codes = codesFromText(rule.query);
    query = codes ? queryFromCodes(codes, warnings) : parseJson(rule.query) ?? null;
  }

  if (!query) {
    warnings.push(`An expansion rule could not be read and was dropped: ${JSON.stringify(rule.query ?? rule)}`);
    return null;
  }

  const result = { query, levels: convertLegacyRules(rule.levels || [], warnings) };
  if (rule.ignore) result.ignore = true;
  return result;
}

/**
 * Build a canonical rule query from legacy codes (legacy ruleBuilder `getRulesJSON`).
 *
 * @param {Array} codes `[source_rt, dty_ID, rel_term_ID, target_rt, filter, linktype]`.
 * @param {string[]} warnings Warning sink.
 * @returns {object} Rule query.
 */
function queryFromCodes(codes, warnings) {
  const [source, field, term, target, filter, type] = codes;
  const linkType = Number(type) || 0;
  let key = LINK_TYPES[linkType] || 'links';
  if (linkType > 0 && Number(field) > 0) key = `${key}:${Number(field)}`;

  const query = Number(target) > 0 ? { t: Number(target) } : {};
  query[key] = [{ t: Number(source) }];
  if (linkType > 2 && Number(term) > 0) query[key].push({ r: Number(term) });

  if (filter) {
    const json = parseJson(filter) ?? strictTextToJson(filter);
    if (json) {
      for (const predicate of Array.isArray(json) ? json : [json]) Object.assign(query, predicate);
    } else {
      warnings.push(`Expansion rule filter could not be converted and was dropped: ${filter}`);
    }
  }

  return query;
}

/**
 * Recover codes from a legacy text rule such as `t:12 linkedfrom:16-90 `.
 * Relation text rules carry no relmarker field; they are converted without one.
 *
 * @param {string} text Legacy text rule query.
 * @returns {Array|null} Codes, or `null` when the text is not a legacy rule.
 */
function codesFromText(text) {
  const match = /^\s*(?:t:(\d+)\s+)?(links|linked_to|linkedfrom|related_to|relatedfrom|related):?(\d+)(?:-(\d+))?\s*(.*)$/i
    .exec(String(text || ''));
  if (!match) return null;

  const [, target = '', verb, source, suffix = '', filter = ''] = match;
  const linkType = TEXT_VERBS[verb.toLowerCase()];
  const isPointer = linkType === 1 || linkType === 2;
  return [source, isPointer ? suffix : '', isPointer ? '' : suffix, target, filter.trim(), linkType];
}
