/**
 * @file writableRecordTypes.js
 * @brief System record types (plan 14): reports, map documents, layers and their
 *        sources, query sources, website pages.
 *
 * Until plan 21 Phase 5 only these types were written by the new record API and
 * editor (the server list `WritableRecordTypes` is removed; every type is edited in
 * HRecordEditor now). The list still marks the system types: their special fields,
 * the default pointer mode `dropdown_add` of pointers to them, and their exclusion
 * from unconstrained pointer fields and record lists (plan 21). Local ids come from
 * the definitions snapshot (`meta.dbconst`).
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

/** Code names of the writable record types. */
export const WRITABLE_RECORD_TYPE_CODES = Object.freeze([
  'RT_CUSTOM_REPORT', 'RT_REPORT_SCHEDULE',
  'RT_MAP_DOCUMENT', 'RT_MAP_LAYER',
  'RT_KML_SOURCE', 'RT_FILE_SOURCE', 'RT_SHP_SOURCE', 'RT_IMAGE_SOURCE', 'RT_TILED_IMAGE_SOURCE',
  'RT_QUERY_SOURCE',
  'RT_CMS_HOME', 'RT_CMS_PAGE'
]);

/** Fields that may have values in several languages (`fre:...` prefixes). */
export const MULTILANG_FIELD_CODES = Object.freeze(['DT_NAME', 'DT_SHORT_SUMMARY', 'DT_EXTENDED_DESCRIPTION']);

/**
 * Local ids of the writable record types.
 *
 * @param {object} dbdefs HDbDefs (needs `dbconst`).
 * @returns {number[]} Record type ids known in this database.
 */
export function writableRecordTypeIds(dbdefs) {
  return WRITABLE_RECORD_TYPE_CODES
    .map((code) => Number(dbdefs?.dbconst?.(code)) || 0)
    .filter((id) => id > 0);
}

/**
 * Whether records of a type are written by the new API and editor.
 *
 * @param {object} dbdefs HDbDefs.
 * @param {number|string} rectypeId Record type id.
 * @returns {boolean}
 */
export function isWritableRecordType(dbdefs, rectypeId) {
  const id = Number(rectypeId);
  return id > 0 && writableRecordTypeIds(dbdefs).includes(id);
}

/**
 * Local ids of the multilingual fields of a record type: DT_NAME, DT_SHORT_SUMMARY
 * and DT_EXTENDED_DESCRIPTION, except the content of a website page
 * (RT_CMS_PAGE / DT_EXTENDED_DESCRIPTION is one value: the page content).
 *
 * @param {object} dbdefs HDbDefs.
 * @param {number|string} rectypeId Record type id.
 * @returns {number[]} Field ids.
 */
export function multilangFieldIds(dbdefs, rectypeId) {
  const page = Number(dbdefs?.dbconst?.('RT_CMS_PAGE')) || 0;
  const content = Number(dbdefs?.dbconst?.('DT_EXTENDED_DESCRIPTION')) || 0;
  return MULTILANG_FIELD_CODES
    .map((code) => Number(dbdefs?.dbconst?.(code)) || 0)
    .filter((id) => id > 0 && !(id === content && page > 0 && Number(rectypeId) === page));
}
