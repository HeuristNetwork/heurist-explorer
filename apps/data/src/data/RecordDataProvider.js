/**
 * @file RecordDataProvider.js
 * @brief Provides selected-field record data.
 * @project     Heurist academic knowledge management system
 * @package     heurist-data
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */
/** Provides selected-field records and count summaries. */
export class RecordDataProvider {
  constructor({ apiClient }) {
    this.apiClient = apiClient;
  }

  /** Load a page of records for a Heurist query. */
  async load({
    query,
    fields = [],
    limit = 1000,
    offset = 0,
    sort,
    filter,
    signal,
  } = {}) {
    const request = {
      q: query,
      fields: [...new Set(fields)].join(","),
      limit,
      offset,
      resolveDetails: 1,
    };
    if (sort !== undefined) request.sort = sort;
    if (filter != null && filter !== "") request.filter = filter;
    const response = await this.apiClient.post("/records", {
      signal,
      body: request,
    });
    if (!response || !Array.isArray(response.records)) {
      throw new TypeError("Records API response is missing records");
    }
    return response;
  }

  /** Return a count-only search summary without materialising record IDs. */
  /** Return a count-only search summary. */
  async count({ query, filter, signal } = {}) {
    return this.#summary("count", { query, filter, signal });
  }

  /** Return total and counts grouped by rec_RecTypeID. */
  /** Return counts grouped by record type. */
  async rectypes({ query, filter, signal } = {}) {
    return this.#summary("rectypes", { query, filter, signal });
  }

  async #summary(detail, { query, filter, signal }) {
    if (query == null || (typeof query === "string" && !query.trim())) {
      throw new TypeError("A Heurist query is required");
    }
    const body = { query, detail };
    if (filter != null && filter !== "") body.filter = filter;
    const response = await this.apiClient.post("/records", { body, signal });
    if (!response || !Number.isFinite(Number(response.total))) {
      throw new TypeError(`Records ${detail} response is missing total`);
    }
    if (detail === "rectypes" && !Array.isArray(response.rectypes)) {
      throw new TypeError("Records rectypes response is missing rectypes");
    }
    return response;
  }
}
