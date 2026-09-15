/**
 * @file MapDocumentListProvider.js
 * @brief Search lightweight MapDocument records.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-map
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */
const MAP_DOCUMENT_CONCEPT_CODE = '3-1019';

/** Searches lightweight persisted MapDocument records for selectors. */
export class MapDocumentListProvider {
  /**
   * @param {object} options Provider dependencies.
   * @param {object} options.apiClient Heurist API client.
   * @param {object} options.recordTypes Record type provider, used to resolve the MapDocument record type ID.
   */
  constructor({ apiClient, recordTypes }) {
    this.apiClient = apiClient;
    this.recordTypes = recordTypes;
  }

  /**
   * Search MapDocument records.
   *
   * @param {*} [query] `null`/`''` for all documents, `false`/`'none'`/`[]` for none, IDs, a Heurist query string, or a query object.
   * @param {{signal?: AbortSignal}} [options] Request options.
   * @returns {Promise<{items: Array<object>, pagination: object|null, recordTypeId: number}>} Matching documents.
   * @throws {TypeError} When `query` is not a supported shape.
   */
  async search(query = null, { signal } = {}) {
    const recordTypeId = await this.recordTypes.getIdByConceptCode(
      MAP_DOCUMENT_CONCEPT_CODE, { signal }
    );
    if (isNoDocumentsQuery(query)) {
      return { items: [], pagination: null, recordTypeId };
    }
    const request = normalizeDocumentQuery(query, recordTypeId);
    const payload = await this.apiClient.get('/records/', {
      query: { fields: 'rec_Title', ...request }, signal
    });
    return {
      items: normalizeRecords(payload?.records),
      pagination: payload?.pagination ?? null,
      recordTypeId
    };
  }
}

/** Merge a query (IDs, string, or object) with the MapDocument record-type filter into an executable request. */
function normalizeDocumentQuery(query, recordTypeId) {
  if (query == null || query === '') return { q: JSON.stringify({ t: recordTypeId }) };

  const ids = normalizeIds(query);
  if (ids) return { q: JSON.stringify({ t: recordTypeId, ids: ids }) };

  if (typeof query === 'string') return { q: query.trim() };
  if (typeof query === 'object') {
    const objectQuery = { ...query, t: recordTypeId };
    if (Array.isArray(objectQuery.ids)) objectQuery.ids = normalizeIds(objectQuery.ids) || [];
    return { q: JSON.stringify(objectQuery) };
  }
  throw new TypeError('MapDocument query must be null, IDs, a Heurist query, or an object');
}

/** Whether a query value explicitly requests zero documents. */
function isNoDocumentsQuery(query) {
  if (query === false) return true;
  if (Array.isArray(query)) return query.length === 0;
  return typeof query === 'string' && query.trim().toLowerCase() === 'none';
}

/** Normalize a query value (array, number, comma-separated string, or `{ids}` object) to a positive-integer ID list, or `null` when not ID-shaped. */
function normalizeIds(query) {
  let values = null;
  if (Array.isArray(query)) values = query;
  else if (typeof query === 'number') values = [query];
  else if (typeof query === 'string' && /^\d+(?:\s*,\s*\d+)*$/.test(query.trim())) {
    values = query.split(',');
  } else if (query && typeof query === 'object' && Array.isArray(query.ids)) {
    values = query.ids;
  }
  if (!values) return null;
  return [...new Set(values.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
}

/** Normalize raw record API results into `{id, recordTypeId, title}` entries. */
function normalizeRecords(records) {
  return Array.isArray(records) ? records.map((record) => ({
    id: Number(record.rec_ID),
    recordTypeId: Number(record.rec_RecTypeID),
    title: String(record.rec_Title || `Map document ${record.rec_ID}`)
  })).filter((item) => Number.isInteger(item.id) && item.id > 0) : [];
}
