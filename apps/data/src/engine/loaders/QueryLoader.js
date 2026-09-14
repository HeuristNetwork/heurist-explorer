/**
 * @file QueryLoader.js
 * @brief Loads transient Filtered Result datasets.
 * @project     Heurist academic knowledge management system
 * @package     heurist-data
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
  constructor({ recordDataProvider }) {
    this.recordDataProvider = recordDataProvider;
  }
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
