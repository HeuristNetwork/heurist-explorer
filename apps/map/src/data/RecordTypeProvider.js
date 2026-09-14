/**
 * RecordTypeProvider.js - Resolve Heurist record types by concept code.
 *
 * @project Heurist mapping application
 * @license https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 */
export class RecordTypeProvider {
  constructor({ apiClient }) {
    this.apiClient = apiClient;
    this.cache = new Map();
  }

  async getIdByConceptCode(conceptCode, { signal } = {}) {
    if (this.cache.has(conceptCode)) return this.cache.get(conceptCode);
    const payload = await this.apiClient.get(`/rty/${encodeURIComponent(conceptCode)}`, {
      query: { details: 'rty_ID' }, signal
    });
    const id = extractRecordTypeId(payload);
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error(`Record type ${conceptCode} did not return a valid rty_ID`);
    }
    this.cache.set(conceptCode, id);
    return id;
  }
}

function extractRecordTypeId(payload) {
  if(Number.isInteger(payload)){
    return Number(payload);
  }
  const candidate = payload?.rty_ID ?? payload?.item?.rty_ID ?? payload?.items?.[0]?.rty_ID
    ?? payload?.records?.[0]?.rty_ID ?? payload?.records?.[0]?.rec_ID;
  const id = Number(candidate);
  return Number.isInteger(id) ? id : null;
}
