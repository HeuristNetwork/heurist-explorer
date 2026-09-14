/**
 * MapDocumentListProvider.js - Search lightweight MapDocument records.
 *
 * @project Heurist mapping application
 * @license https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 */
const MAP_DOCUMENT_CONCEPT_CODE = '3-1019';

export class MapDocumentListProvider {
  constructor({ apiClient, recordTypes }) {
    this.apiClient = apiClient;
    this.recordTypes = recordTypes;
  }

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

function isNoDocumentsQuery(query) {
  if (query === false) return true;
  if (Array.isArray(query)) return query.length === 0;
  return typeof query === 'string' && query.trim().toLowerCase() === 'none';
}

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

function normalizeRecords(records) {
  return Array.isArray(records) ? records.map((record) => ({
    id: Number(record.rec_ID),
    recordTypeId: Number(record.rec_RecTypeID),
    title: String(record.rec_Title || `Map document ${record.rec_ID}`)
  })).filter((item) => Number.isInteger(item.id) && item.id > 0) : [];
}
