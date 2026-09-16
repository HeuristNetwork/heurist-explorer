/**
 * @file QuerySourceProvider.js
 * @brief Provides persisted Query Source definitions.
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
/** Provides normalized persisted Query Source definitions. */
export class QuerySourceProvider {
  /** @param {{apiClient: object}} options Heurist API client. */
  constructor({ apiClient }) {
    this.apiClient = apiClient;
  }

  /**
   * Load a persisted Query Source definition by ID.
   *
   * @param {number|string} querySourceId Query Source record ID.
   * @param {{signal?: AbortSignal}} [options] Request options.
   * @returns {Promise<object>} The Query Source payload.
   * @throws {TypeError} When `querySourceId` is not a positive integer.
   */
  async load(querySourceId, { signal } = {}) {
    const id = Number(querySourceId);
    if (!Number.isInteger(id) || id < 1)
      throw new TypeError("Query Source ID must be positive");
    const response = await this.apiClient.get(`/records/querysource/${id}`, { signal });
    return response?.querySource || response;
  }
}
