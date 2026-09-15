/**
 * @file QueryLoader.js
 * @brief Loads transient Filtered Result datasets.
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

import { Dataset, normalizeDatasetFields } from "../../core/Dataset.js";

/** Loads a transient Dataset from a Filtered Result query. */
export class QueryLoader {
  /** @param {{recordDataProvider: object}} options Provider used to load the query's record page. */
  constructor({ recordDataProvider }) {
    this.recordDataProvider = recordDataProvider;
  }

  /**
   * Build a transient "Filtered Result" Dataset for a query and load one page of its records.
   *
   * @param {object} [options] Load options.
   * @param {string|object} options.query Heurist `q`-array query or keyword-syntax string.
   * @param {Array<object>} [options.fields] Dataset field definitions; defaults to title + record type.
   * @param {Array<string>} [options.additionalFields] Extra presentation-only fields to request.
   * @param {boolean} [options.includeDatasetFields=true] Include the dataset's own configured fields.
   * @param {number} [options.limit] Page size.
   * @param {number} [options.offset] Result offset.
   * @param {string} [options.sort] Sort specification.
   * @param {string} [options.filter] Extra filter expression.
   * @param {AbortSignal} [options.signal] Abort signal for cancellation.
   * @returns {Promise<{dataset: Dataset, response: object}>} The transient dataset and its record page.
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
