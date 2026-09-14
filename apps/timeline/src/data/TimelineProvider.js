/**
 * @file TimelineProvider.js
 * @brief Thin client for Heurist temporal queries and record retrieval.
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
 * Thin client for /api/{db}/time. It deliberately preserves the API response.
 */
export class TimelineProvider {
  /**
   * Creates a provider bound to an API client.
   *
   * @param {{ apiClient: object }} options - API client configuration.
   */
  constructor({ apiClient }) {
    this.apiClient = apiClient;
  }

  /**
   * Loads temporal records from the Heurist /time endpoint.
   *
   * @param {object} [options={}] - Query options.
   * @returns {Promise<object>} The raw response payload from the server.
   */
  async load({
    query,
    ids = [],
    timefields = [],
    fields = [],
    limit = 100000,
    offset = 0,
    sort,
    filter,
    resolveDetails = 1,
    signal,
  } = {}) {
    if ((query == null || query === "") && !ids.length) {
      return { records: [], pagination: { total: 0, limit, offset } };
    }

    const body = { limit, offset, resolveDetails: resolveDetails ? 1 : 0 };

    if (query != null && query !== "") body.q = query;
    if (ids.length) body.ids = ids;
    if (timefields.length) body.timefields = timefields.join(",");
    if (fields.length) body.fields = fields.join(",");
    if (sort !== undefined) body.sort = sort;
    if (filter != null && filter !== "") body.filter = filter;

    const response = await this.apiClient.post("/time", { body, signal });

    if (!response || !Array.isArray(response.records)) {
      throw new TypeError("Temporal records API response is missing records");
    }

    return response;
  }
}

