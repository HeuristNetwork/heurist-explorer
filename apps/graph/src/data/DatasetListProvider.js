/**
 * @file DatasetListProvider.js
 * @brief Search lightweight Dataset records through the standard records API.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-graph
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */
export const DATASET_CONCEPT_CODE = "2-1100";

/** Provides lightweight persisted Dataset records for selectors. */
export class DatasetListProvider {
  /**
   * @param {object} options Provider dependencies.
   * @param {object} options.apiClient Heurist API client.
   * @param {object} options.recordTypes Record type provider, used to resolve the Dataset record type ID.
   * @param {Function|null} [options.onUnavailable] Called once if the database has no Dataset record type.
   */
  constructor({ apiClient, recordTypes, onUnavailable = null }) {
    this.apiClient = apiClient;
    this.recordTypes = recordTypes;
    this.onUnavailable = onUnavailable;
    this.available = true;
  }

  /**
   * List Dataset records, optionally restricted to specific IDs or an extra query.
   *
   * Databases without the optional Dataset record type return an empty result instead of
   * throwing, after which the provider is marked unavailable and `onUnavailable` fires once.
   *
   * @param {object} [options] Search options.
   * @param {Array<number|string>|null} [options.ids] When given, restrict results to these Dataset IDs.
   * @param {object|string|null} [options.query] Extra query merged with the Dataset record-type filter.
   * @param {AbortSignal} [options.signal] Abort signal for cancellation.
   * @returns {Promise<{items: Array<object>, pagination: object|null, recordTypeId: number|null}>} Matching datasets.
   * @throws {Error} When the lookup fails for a reason other than a missing Dataset definition.
   */
  async list({ ids = null, query = null, signal } = {}) {
    const normalizedIds = normalizeIds(ids);
    const empty = { items: [], pagination: null, recordTypeId: null };
    if (!this.available) return empty;
    let recordTypeId;
    try {
      recordTypeId = await this.recordTypes.getIdByConceptCode(DATASET_CONCEPT_CODE, { signal });
    } catch (error) {
      // Older databases lack the optional Dataset definition. Do not suppress
      // authentication, connection, or records-search failures.
      if (error?.name === 'AbortError' || !/\bDefinition not found\b/i.test(error?.message || '')) throw error;
      this.available = false;
      this.onUnavailable?.();
      return empty;
    }
    if (Array.isArray(ids) && normalizedIds.length === 0) {
      return { items: [], pagination: null, recordTypeId };
    }
    const q = normalizeDatasetQuery(query, recordTypeId, normalizedIds);
    const payload = await this.apiClient.get("/records/", {
      query: { fields: "rec_Title", q: JSON.stringify(q) },
      signal,
    });
    return {
      items: normalizeRecords(payload?.records),
      pagination: payload?.pagination ?? null,
      recordTypeId,
    };
  }
}

/** Merge a raw query (object, JSON string, or plain text) with the Dataset record-type filter and IDs. */
function normalizeDatasetQuery(query, recordTypeId, ids) {
  let value = {};
  if (query && typeof query === "object" && !Array.isArray(query))
    value = { ...query };
  else if (typeof query === "string" && query.trim()) {
    try {
      value = JSON.parse(query);
    } catch {
      value = { q: query.trim() };
    }
  }
  value.t = recordTypeId;
  if (ids.length) value.ids = ids;
  return value;
}

/** Normalize a value into a de-duplicated array of positive integer IDs. */
function normalizeIds(value) {
  const values = Array.isArray(value) ? value : value == null ? [] : [value];
  const ids = values.map(Number);
  if (ids.some((id) => !Number.isInteger(id) || id < 1)) {
    throw new TypeError("Dataset IDs must be positive integers");
  }
  return [...new Set(ids)];
}

/** Normalize raw record API results into `{id, recordTypeId, title}` entries. */
function normalizeRecords(records) {
  return Array.isArray(records)
    ? records
        .map((record) => ({
          id: Number(record.rec_ID),
          recordTypeId: Number(record.rec_RecTypeID),
          title: String(record.rec_Title || `Dataset ${record.rec_ID}`),
        }))
        .filter((item) => Number.isInteger(item.id) && item.id > 0)
    : [];
}
