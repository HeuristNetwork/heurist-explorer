/**
 * @file DatasetProvider.js
 * @brief Provides persisted Dataset definitions.
 * @project     Heurist academic knowledge management system
 * @package     heurist-data
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */
/** Provides normalized persisted Dataset definitions. */
export class DatasetProvider {
  constructor({ apiClient }) {
    this.apiClient = apiClient;
  }

  async load(datasetId, { signal } = {}) {
    const id = Number(datasetId);
    if (!Number.isInteger(id) || id < 1)
      throw new TypeError("Dataset ID must be positive");
    const response = await this.apiClient.get(`/records/dataset/${id}`, { signal });
    return response?.dataset || response;
  }
}
