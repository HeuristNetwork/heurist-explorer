/**
 * @file recordManagerFilters.js
 * @brief Built-in filters of the record manager (plan 21 §7.1): a parameterized
 *        query and its filter form, as a Query Source has them (`{query, filterForm}`).
 *
 * - files (RT_REGISTERED_FILE, `/files`): file name, URL, name (caption), file type,
 *   MIME type, size range; the `/files` query takes local field ids, so the query is
 *   built from the concept codes (a field the database lacks is left out);
 * - users and groups (RT_SYS_USER, RT_SYS_GROUP, `/sys`): none, the list's own search box
 *   (no tags; plan 24 review);
 * - generic (every other record type, for now also the other system types): title and tag.
 *
 * Text parameters are direct inputs; terms and tags are lists. Other filters are
 * defined when the manager is used for a particular type; the admin configuration
 * (§7.2, later) may replace them by a Query Source or the admin's own filter.
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

/** Fields of the files filter: parameter, concept code of the field (null: a header predicate), label, presentation. */
const FILE_FILTER_FIELDS = Object.freeze([
  { name: 'FILENAME', concept: '2-1185', label: 'File name' },
  { name: 'URL', predicate: 'url', label: 'URL' },
  { name: 'CAPTION', concept: '2-1', label: 'Name' },
  // Source: local, external, tiled, IIIF; File type: the extension, or a group of them (2026-10-27)
  { name: 'SOURCE', concept: '2-1186', label: 'Source', mode: 'select' },
  { name: 'FILETYPE', concept: '2-29', label: 'File type', mode: 'select' },
  { name: 'SIZE', concept: '2-67', label: 'Size (bytes)', range: 'SIZE_TO' }
]);

/** Concept code of the registered file record type. */
const FILE_RECTYPE_CODE = 'RT_REGISTERED_FILE';

/** Record types without a built-in filter (the list's search box): users and groups. */
const NO_FILTER_RECTYPE_CODES = Object.freeze(['RT_SYS_USER', 'RT_SYS_GROUP']);

/**
 * The built-in filter of a list of record types: files for RT_REGISTERED_FILE, none for
 * users and groups, else generic.
 *
 * @param {object|null} dbdefs HDbDefs (`dbconst`, `localId`).
 * @param {Array<number|string>} [recordTypes] Record types of the manager.
 * @returns {{id: string, query: Array<object>, filterForm: object}|null} The filter, or null
 *          when no field of it exists (or for users and groups).
 */
export function builtinRecordFilter(dbdefs, recordTypes = []) {
  const files = Number(dbdefs?.dbconst?.(FILE_RECTYPE_CODE)) || 0;
  const types = (recordTypes || []).map(Number).filter((id) => id > 0);
  if (files > 0 && types.length > 0 && types.every((id) => id === files)) return fileFilter(dbdefs);
  const plain = NO_FILTER_RECTYPE_CODES.map((code) => Number(dbdefs?.dbconst?.(code)) || 0).filter((id) => id > 0);
  if (types.length > 0 && types.every((id) => plain.includes(id))) return null;
  return genericFilter();
}

/**
 * Generic filter: title (direct input) and tag (the user's tags).
 *
 * @returns {{id: string, query: Array<object>, filterForm: object}}
 */
export function genericFilter() {
  return {
    id: 'generic',
    query: [{ title: '$TITLE$' }, { tag: '$TAG$' }],
    filterForm: layout([
      { input: 'TITLE', label: 'Title' },
      { input: 'TAG', label: 'Tag', mode: 'select' }
    ])
  };
}

/**
 * Files filter: file name, URL, name, file type, MIME type, size range.
 *
 * @param {object|null} dbdefs HDbDefs.
 * @returns {{id: string, query: Array<object>, filterForm: object}|null}
 */
export function fileFilter(dbdefs) {
  const query = [];
  const children = [];
  for (const field of FILE_FILTER_FIELDS) {
    let key = field.predicate || null;
    if (!key) {
      const id = Number(dbdefs?.localId?.('dty', field.concept)) || 0;
      if (!(id > 0)) continue;
      key = `f:${id}`;
    }
    query.push({ [key]: field.range ? `$${field.name}$<>$${field.range}$` : `$${field.name}$` });
    children.push({ input: field.name, label: field.label, ...(field.mode ? { mode: field.mode } : {}) });
  }
  if (!query.length) return null;
  return { id: 'files', query, filterForm: layout(children) };
}

/** Filter form layout of one section. */
function layout(children) {
  return {
    version: 1,
    settings: { orientation: 'vertical' },
    groups: [{ id: 'main', type: 'section', children }]
  };
}
