/**
 * @file querySourceList.js
 * @brief The query sources of the database for a list (the ▾ of a query field, plan 27n1 §4; Saved filter of the CMS,
 *        plan 27j): id, name, whether the query has parameters, the query and its filter form. Moved from CmsDesigner.
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

import { RecordTypeProvider } from './RecordTypeProvider.js';
import { hasQueryParameters } from './queryParameters.js';
import { valueInLanguage } from './recordEditValues.js';

/** The record type of query sources (RT_QUERY_SOURCE): its global concept code. */
export const QUERY_SOURCE_CONCEPT_CODE = '3-1021';

/** DT_QUERY_STRING of a query source. */
export const QUERY_FIELD_CONCEPT_CODE = '2-12';

/** Parsed JSON, or the text itself. */
export function parseJsonText(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** The first value of a field of a record of `/records` (a value or `{value}`), as text. */
function firstText(record, field) {
  const value = field ? [record.details?.[field]].flat()[0] : null;
  return value == null ? '' : String(typeof value === 'object' ? value.value ?? '' : value);
}

/**
 * The query sources the user (or a visitor: `publicOnly`) can read, sorted by name.
 *
 * @param {object} options
 * @param {object} options.apiClient HeuristApiClient.
 * @param {object} options.dbdefs HDbDefs (field ids).
 * @param {boolean} [options.publicOnly=false] Only public ones (a website: visitors read them).
 * @param {number} [options.limit=1000]
 * @returns {Promise<Array<{id: number, title: string, parameterized: boolean, query: *, filterForm: object|null}>>}
 */
export async function listQuerySources({ apiClient, dbdefs, publicOnly = false, limit = 1000 }) {
  const typeId = await new RecordTypeProvider({ apiClient }).getIdByConceptCode(QUERY_SOURCE_CONCEPT_CODE);
  if (!typeId) return [];
  const queryField = Number(dbdefs?.localId?.('dty', QUERY_FIELD_CONCEPT_CODE)) || 0;
  // the caption: its name (DT_NAME, the value without a language), not the record title (2026-11-16)
  const nameField = Number(dbdefs?.dbconst?.('DT_NAME')) || 0;
  const formField = Number(dbdefs?.dbconst?.('DT_FILTER_FORM')) || 0;
  const answer = await apiClient.get('/records/', {
    query: { q: [{ t: String(typeId) }, ...(publicOnly ? [{ access: 'public' }] : [])],
      fields: ['rec_ID', 'rec_Title', queryField, nameField, formField].filter(Boolean).join(','), limit }
  });
  const title = (record) => valueInLanguage([record.details?.[nameField]].flat().filter((value) => value != null), '')
    || String(record.rec_Title ?? '').replace(/<[^>]*>/g, '').trim() || `#${record.rec_ID}`;
  return (answer?.records || []).map((record) => {
    const query = parseJsonText(firstText(record, queryField));
    const form = parseJsonText(firstText(record, formField));
    return { id: Number(record.rec_ID), title: title(record), parameterized: hasQueryParameters(query), query,
      filterForm: form && typeof form === 'object' ? form : null };
  }).sort((a, b) => a.title.localeCompare(b.title));
}
