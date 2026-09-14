/**
 * @file DatasetLoader.js
 * @brief Loads persisted Dataset definitions and records.
 * @project     Heurist academic knowledge management system
 * @package     heurist-data
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
  constructor({ datasetProvider, recordDataProvider }) {
    this.datasetProvider = datasetProvider;
    this.recordDataProvider = recordDataProvider;
  }
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
