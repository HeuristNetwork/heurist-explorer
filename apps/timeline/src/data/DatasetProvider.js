/**
 * @file DatasetProvider.js
 * @brief Retrieves and validates persisted dataset-based timeline sources.
 * @project     Heurist academic knowledge management system
 * @package     heurist-timeline
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

/**
 * Loads the persisted dataset presentation document used as a timeline source.
 */
export class DatasetProvider {
  /**
   * Creates a dataset provider using the supplied API client.
   *
   * @param {{ apiClient: object }} options - Client options.
   */
  constructor({ apiClient }) {
    this.apiClient = apiClient;
  }

  /**
   * Loads a dataset by ID and validates that it exposes a query source.
   *
   * @param {number|string} datasetId - The dataset identifier.
   * @param {{ signal?: AbortSignal }} [options={}] - Operation options.
   * @returns {Promise<object>} The fetched dataset payload.
   * @throws {TypeError} If the dataset ID is invalid or the dataset lacks a query source.
   */
  async load(datasetId, { signal } = {}) {
    const id = Number(datasetId);

    if (!Number.isInteger(id) || id < 1) {
      throw new TypeError("Dataset ID must be positive");
    }

    const value = await this.apiClient.get(`/records/dataset/${id}`, { signal });

    if (!value?.source?.query) {
      throw new TypeError(`Dataset ${id} has no source query`);
    }

    return value;
  }
}

