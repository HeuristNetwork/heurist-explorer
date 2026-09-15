/**
 * @file DatasetProvider.js
 * @brief Provides persisted Dataset definitions.
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
/** Provides normalized persisted Dataset definitions. */
export class DatasetProvider {
  /** @param {{apiClient: object}} options Heurist API client. */
  constructor({ apiClient }) {
    this.apiClient = apiClient;
  }

  /**
   * Load a persisted Dataset definition by ID.
   *
   * @param {number|string} datasetId Dataset record ID.
   * @param {{signal?: AbortSignal}} [options] Request options.
   * @returns {Promise<object>} The Dataset payload.
   * @throws {TypeError} When `datasetId` is not a positive integer.
   */
  async load(datasetId, { signal } = {}) {
    const id = Number(datasetId);
    if (!Number.isInteger(id) || id < 1)
      throw new TypeError("Dataset ID must be positive");
    const response = await this.apiClient.get(`/records/dataset/${id}`, { signal });
    return response?.dataset || response;
  }
}
