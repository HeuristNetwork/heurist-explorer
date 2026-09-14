/**
 * @file TemporalDataProvider.js
 * @brief Retrieves temporal record payloads from the Heurist /time endpoint.
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
 * Loads temporal projections from /api/{db}/time without converting Heurist temporal semantics.
 */
export class TemporalDataProvider {
  /**
   * Creates a temporal provider backed by an Heurist API client.
   *
   * @param {{ apiClient: object }} options - API client instance.
   */
  constructor({ apiClient }) {
    this.apiClient = apiClient;
  }

  /**
   * Loads temporal records for a query or explicit record set.
   *
   * @param {object} [options={}] - Search and transport parameters.
   * @returns {Promise<object>} The response object containing the record list.
   */
  async load({
    query,
    ids,
    timefields,
    fields = [],
    limit = 100000,
    offset = 0,
    sort,
    filter,
    resolveDetails = 1,
    signal,
  } = {}) {
    const body = { limit, offset, resolveDetails };

    if (query != null && query !== "") body.q = query;
    if (Array.isArray(ids) && ids.length) body.ids = ids;
    if (timefields != null && timefields !== "") {
      body.timefields = Array.isArray(timefields) ? timefields.join(",") : timefields;
    }
    if (fields?.length) body.fields = [...new Set(fields.map(String))].join(",");
    if (sort !== undefined) body.sort = sort;
    if (filter != null && filter !== "") body.filter = filter;

    const response = await this.apiClient.post("/time", { body, signal });

    if (!response || !Array.isArray(response.records)) {
      throw new TypeError("Temporal records API response is missing records");
    }

    return response;
  }
}

