/**
 * @file DataSourceLoader.js
 * @brief Loads records by the query and fields specified in a Query Source record, given its id.
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

import { QuerySource } from "#shared/data/QuerySource.js";

/** Loads records by the query and fields specified in a Query Source record, given its querySourceId. */
export class DataSourceLoader {
  /**
   * @param {object} options Loader dependencies.
   * @param {object} options.querySourceProvider Provider used to load the persisted Query Source definition.
   * @param {object} options.recordDataProvider Provider used to load the Query Source's record page.
   */
  constructor({ querySourceProvider, recordDataProvider }) {
    this.querySourceProvider = querySourceProvider;
    this.recordDataProvider = recordDataProvider;
  }

  /**
   * Load a persisted Query Source and one page of its records.
   *
   * @param {object} [options] Load options.
   * @param {number|string} options.querySourceId Query Source record ID.
   * @param {Array<string>} [options.additionalFields] Extra presentation-only fields to request.
   * @param {boolean} [options.includeQuerySourceFields=true] Include the Query Source's own configured fields.
   * @param {number} [options.limit] Page size.
   * @param {number} [options.offset] Result offset.
   * @param {string} [options.sort] Sort specification.
   * @param {string} [options.filter] Extra filter expression.
   * @param {AbortSignal} [options.signal] Abort signal for cancellation.
   * @returns {Promise<{querySource: QuerySource, response: object}>} The loaded Query Source and its record page.
   */
  async load({
    querySourceId,
    additionalFields = [],
    includeQuerySourceFields = true,
    limit,
    offset,
    sort,
    filter,
    signal,
  } = {}) {
    const querySource = new QuerySource(
      await this.querySourceProvider.load(querySourceId, { signal }),
    );
    const response = await this.recordDataProvider.load({
      query: querySource.source.query,
      fields: [
        ...(includeQuerySourceFields ? querySource.getFieldCodes() : []),
        ...additionalFields,
      ],
      limit,
      offset,
      sort,
      filter,
      signal,
    });
    return { querySource, response };
  }
}
