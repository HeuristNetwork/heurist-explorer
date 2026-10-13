/**
 * @file querySourceRecord.js
 * @brief Query Source record fields of a DataSource (save from the Query Source editor).
 *
 * Port of `_saveDatasourceAsSource` of the legacy wrapper
 * (heurist hclient/modules/explorer/HeuristModuleExplorer.js) to the write
 * format of the new record API (plan 14): `details` keyed by field id, arrays of
 * values, `[]` clears a field. Only the fields the Query Source editor owns are
 * given, so an update (PATCH) keeps every other field of the record (summary,
 * creators, licence...).
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

/** Title of a source saved without one. */
export const DEFAULT_SOURCE_TITLE = 'New Query Source';

/**
 * Fields of a Query Source record for a DataSource.
 *
 * @param {object} source DataSource (`title`, `request: {q, rules}`, `presentation: {filterForm, data, map, timeline}`).
 * @param {object} dbdefs HDbDefs (`dbconst`: field ids and the Yes/No terms).
 * @returns {{title: string, details: Object<string, Array>}} Title and `details` of the record.
 * @throws {Error} When a definition the source needs is missing.
 */
export function querySourceDetails(source, dbdefs) {
  const id = (name) => Number(dbdefs?.dbconst?.(name)) || 0;
  const details = {};
  const put = (name, values) => {
    const fieldId = id(name);
    if (fieldId > 0) details[String(fieldId)] = values;
  };
  const request = source?.request || {};
  const presentation = source?.presentation || {};

  const title = String(source?.title || '').trim() || DEFAULT_SOURCE_TITLE;
  put('DT_NAME', [title]);
  if (request.q != null) put('DT_QUERY_STRING', [json(request.q)]);
  if (request.rules != null) {
    const rules = Array.isArray(request.rules) ? request.rules : [request.rules];
    put('DT_EXPANSION_RULES', rules.length ? [json(rules)] : []);
  }
  if (presentation.filterForm != null) {
    if (!(id('DT_FILTER_FORM') > 0)) throw new Error('DT_FILTER_FORM is required to save the Filter Form layout');
    put('DT_FILTER_FORM', [json(presentation.filterForm)]);
  } else {
    put('DT_FILTER_FORM', []);
  }
  if (Array.isArray(presentation.data?.fields)) put('DT_TABLE_FIELDS', [json(presentation.data.fields)]);

  const map = presentation.map || {};
  put('DT_GEO_FIELDS', fieldCodes(map.geoFields));
  const yes = id('TRM_YES');
  const no = id('TRM_NO');
  if (!(yes > 0) || !(no > 0)) throw new Error('Query Source Yes/No term definitions are not available');
  put('DT_IS_LOADED_BY_EXTENT', [String(map.dynamicRequests === true ? yes : no)]);
  put('DT_GEO_OUTPUTMODE', [String(map.geoOutputMode === 'features' ? yes : no)]);
  put('DT_MINIMUM_ZOOM_LEVEL', zoom(map.minZoom));
  put('DT_MAXIMUM_ZOOM_LEVEL', zoom(map.maxZoom));
  put('DT_TIMELINE_FIELDS', fieldCodes(presentation.timeline?.fields));
  return { title, details };
}

/** @returns {string} The value as JSON text (strings as given). */
function json(value) {
  return typeof value === 'string' ? value : JSON.stringify(value == null ? [] : value);
}

/** @returns {string[]} Field codes of a field list (`'12'`, `{field}`, `{code}`). */
function fieldCodes(value) {
  return (Array.isArray(value) ? value : [])
    .map((item) => (typeof item === 'string' || typeof item === 'number'
      ? String(item) : String(item?.field || item?.code || '')))
    .filter(Boolean);
}

/** @returns {string[]} One zoom level, or none (clears the field). */
function zoom(value) {
  if (value === null || value === undefined || value === '') return [];
  const number = Number(value);
  return Number.isFinite(number) ? [String(number)] : [];
}
