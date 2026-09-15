/**
 * @file DatasetLoader.js
 * @brief Loads persisted Dataset definitions and records.
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

import { Dataset } from "../../core/Dataset.js";

/** Loads a persisted Dataset and its selected record page. */
export class DatasetLoader {
  /**
   * @param {object} options Loader dependencies.
   * @param {object} options.datasetProvider Loads persisted Dataset definitions.
   * @param {object} options.recordDataProvider Loads the dataset's selected-field record page.
   */
  constructor({ datasetProvider, recordDataProvider }) {
    this.datasetProvider = datasetProvider;
    this.recordDataProvider = recordDataProvider;
  }

  /**
   * Load a persisted Dataset and its selected record page.
   *
   * @param {object} options Load options.
   * @param {number|string} options.datasetId Dataset record id.
   * @param {Array<string>} [options.additionalFields] Extra field codes to request beyond the dataset's own.
   * @param {boolean} [options.includeDatasetFields=true] Include the dataset's own configured fields.
   * @param {number} [options.limit] Page size.
   * @param {number} [options.offset] Page offset.
   * @param {*} [options.sort] Sort specification.
   * @param {*} [options.filter] Additional filter.
   * @param {AbortSignal} [options.signal] Abort signal for cancellation.
   * @returns {Promise<{dataset: import('../../core/Dataset.js').Dataset, response: object}>}
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
