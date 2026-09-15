/**
 * @file DatasetLoader.js
 * @brief Loads persisted Dataset definitions and records.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-data
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { Dataset } from "../../core/Dataset.js";

/** Loads a persisted Dataset and its selected record page. */
export class DatasetLoader {
  /**
   * @param {object} options Loader dependencies.
   * @param {object} options.datasetProvider Provider used to load the persisted Dataset definition.
   * @param {object} options.recordDataProvider Provider used to load the Dataset's record page.
   */
  constructor({ datasetProvider, recordDataProvider }) {
    this.datasetProvider = datasetProvider;
    this.recordDataProvider = recordDataProvider;
  }

  /**
   * Load a persisted Dataset and one page of its records.
   *
   * @param {object} [options] Load options.
   * @param {number|string} options.datasetId Dataset record ID.
   * @param {Array<string>} [options.additionalFields] Extra presentation-only fields to request.
   * @param {boolean} [options.includeDatasetFields=true] Include the dataset's own configured fields.
   * @param {number} [options.limit] Page size.
   * @param {number} [options.offset] Result offset.
   * @param {string} [options.sort] Sort specification.
   * @param {string} [options.filter] Extra filter expression.
   * @param {AbortSignal} [options.signal] Abort signal for cancellation.
   * @returns {Promise<{dataset: Dataset, response: object}>} The loaded dataset and its record page.
   */
  async load({
    datasetId,
    additionalFields = [],
    includeDatasetFields = true,
    limit,
    offset,
    sort,
    filter,
    signal,
  } = {}) {
    const dataset = new Dataset(
      await this.datasetProvider.load(datasetId, { signal }),
    );
    const response = await this.recordDataProvider.load({
      query: dataset.source.query,
      fields: [
        ...(includeDatasetFields ? dataset.getFieldCodes() : []),
        ...additionalFields,
      ],
      limit,
      offset,
      sort,
      filter,
      signal,
    });
    return { dataset, response };
  }
}
