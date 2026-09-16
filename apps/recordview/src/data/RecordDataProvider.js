/**
 * @file RecordDataProvider.js
 * @brief Fetches exactly one fully-resolved record by id, for the `builtin` render engine.
 *
 * Never queries the active DataSource/search — Record View only ever needs
 * the single displayed record's own fields, so `load()` always issues an
 * `ids:<id>` query for one record, regardless of what the shared selection
 * or any presentation module's DataSource currently is.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-recordview
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */
/** Fetches one fully-resolved record by id. */
export class RecordDataProvider {
  /** @param {{apiClient: object}} options Heurist API client. */
  constructor({ apiClient }) {
    this.apiClient = apiClient;
  }

  /**
   * Load exactly one record, with every detail value resolved.
   *
   * @param {{id: number|string, signal?: AbortSignal}} options Load options.
   * @returns {Promise<object|null>} The resolved record, or `null` when not found.
   * @throws {TypeError} When `id` is invalid, or the response is missing `records`.
   */
  async load({ id, signal } = {}) {
    const recordId = Number(id);
    if (!Number.isInteger(recordId) || recordId < 1) {
      throw new TypeError("A valid Heurist record id is required");
    }
    const response = await this.apiClient.post("/records", {
      signal,
      body: {
        q: `ids:${recordId}`,
        limit: 1,
        resolveDetails: 1,
      },
    });
    if (!response || !Array.isArray(response.records)) {
      throw new TypeError("Records API response is missing records");
    }
    return response.records[0] || null;
  }
}
