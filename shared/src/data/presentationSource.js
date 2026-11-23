/**
 * @file presentationSource.js
 * @brief Records of a presentation (crosstabs, later story map, report, export), see
 *        docs/development/presentation-sources.md: the source `current` (the current result AND the record type of the
 *        configuration) or `own` (the query of the configuration with its parameters). The selection is the value of
 *        the parameter `$SELECTED$`. No DOM.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { queryParameterNames, resolveQueryParameters } from './queryParameters.js';

/** Sources of a presentation instance. */
export const PRESENTATION_SOURCES = Object.freeze(['current', 'own']);

/** The parameter filled with the ids of the selected records. */
export const SELECTED_PARAMETER = 'SELECTED';

/**
 * A query (JSON, JSON text or a legacy text query) read for combining: an array or object, or the text.
 *
 * @param {*} query
 * @returns {Array|object|string|null}
 */
export function readQuery(query) {
  if (query == null) return null;
  if (typeof query !== 'string') return query;
  const text = query.trim();
  if (!text) return null;
  if (text.startsWith('[') || text.startsWith('{')) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text;
}

/**
 * The query AND the record type (`current` source, and the records a configuration counts).
 *
 * @param {*} query The query (null: none).
 * @param {number|string|null} rectype Record type id; none: the query unchanged.
 * @returns {Array|string|object|null}
 */
export function recordTypeQuery(query, rectype) {
  const value = readQuery(query);
  const type = Number(rectype) > 0 ? String(Number(rectype)) : '';
  if (value == null || !type) return value;
  if (typeof value === 'string') return `t:${type} ${value}`;
  return [{ t: type }, ...(Array.isArray(value) ? value : [value])];
}

/**
 * The own query of a presentation with its parameters filled in. `$SELECTED$` gets the selected record ids.
 *
 * @param {*} query Query template with `$NAME$` parameters.
 * @param {{values?: object, selection?: Array<number>, filterForm?: object|null}} [options]
 * @returns {{q: *, names: string[], missing: string[]}} `missing`: parameters without a value (the query must not run:
 *          a predicate without a value would be dropped and count too many records).
 */
export function ownQuery(query, { values = {}, selection = [], filterForm = null } = {}) {
  const value = readQuery(query);
  const names = value != null && typeof value === 'object' ? queryParameterNames(value) : [];
  if (!names.length) return { q: value, names, missing: [] };
  const given = {};
  for (const name of names) {
    const item = name === SELECTED_PARAMETER ? (selection || []).map(Number).filter((id) => id > 0).join(',') : values?.[name];
    if (item != null && item !== '' && !(Array.isArray(item) && !item.length)) given[name] = item;
  }
  const missing = names.filter((name) => !Object.hasOwn(given, name));
  return { q: resolveQueryParameters(value, given, filterForm).q, names, missing };
}
