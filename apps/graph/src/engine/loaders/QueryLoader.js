/**
 * @file QueryLoader.js
 * @brief Loads transient Filtered Result datasets.
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

import { Dataset, normalizeDatasetFields } from "../../core/Dataset.js";

/** Loads a transient Dataset from a Filtered Result query. */
export class QueryLoader {
  /** @param {{recordDataProvider: object}} options Provides the selected-field record page. */
  constructor({ recordDataProvider }) {
    this.recordDataProvider = recordDataProvider;
  }

  /**
   * Load a transient Dataset from a Filtered Result query.
   *
   * @param {object} options Load options.
   * @param {*} options.query Heurist query.
   * @param {Array<object>} [options.fields] Field descriptors; defaults to title and record type.
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
    query,
    fields = [],
    additionalFields = [],
    includeDatasetFields = true,
    limit,
    offset,
    sort,
    filter,
    signal,
  } = {}) {
    const normalizedFields = normalizeDatasetFields(
      fields.length
        ? fields
        : [
            { field: "rec_Title", title: "Title" },
            { field: "rec_RecTypeID", title: "Record type" },
          ],
    );
    const dataset = new Dataset({
      title: "Filtered Result",
      source: { type: "heurist-query", query },
      fields: normalizedFields,
    });
    const response = await this.recordDataProvider.load({
      query,
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
