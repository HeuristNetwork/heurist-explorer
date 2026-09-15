/**
 * @file RecordContentProvider.js
 * @brief Lazy loader for standard and Smarty record presentation HTML.
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
/** Loads deferred standard and Smarty record presentation content. */
export class RecordContentProvider {
  /**
   * @param {object} [options] Provider configuration.
   * @param {string} [options.baseUrl] Base URL record presentation is fetched from; normalized to end in `/`.
   * @param {string|number} [options.database] Target Heurist database name.
   * @param {Function|null} [options.fetchImpl] Fetch implementation to use instead of the global `fetch`.
   */
  constructor({ baseUrl, database, fetchImpl = null } = {}) {
    const value = String(baseUrl || "").trim();
    this.baseUrl = value ? (value.endsWith("/") ? value : `${value}/`) : null;
    this.database = database == null ? null : String(database);
    this.fetchImpl = fetchImpl || ((...args) => globalThis.fetch(...args));
  }

  /**
   * Load presentation HTML for a set of records, tolerating individual failures.
   *
   * @param {object} [options] Load options.
   * @param {Array<object>} [options.records] Records to load content for; each needs a `rec_ID`.
   * @param {string} [options.template='standard'] Report template name, or `'standard'` for the default renderer.
   * @param {AbortSignal} [options.signal] Abort signal for cancellation.
   * @returns {Promise<Map<number, string>>} Record ID -> presentation HTML, for records that loaded successfully.
   */
  async load({ records = [], template = "standard", signal } = {}) {
    if (!this.baseUrl || !this.database) return new Map();
    const results = await Promise.allSettled(
      records.map(async (record) => {
        const id = Number(record?.rec_ID);
        if (!(id > 0)) return null;
        const response = await this.fetchImpl(this.buildUrl(id, template), {
          credentials: "same-origin",
          headers: { Accept: "text/html, */*;q=0.8" },
          signal,
        });
        if (!response.ok)
          throw new Error(
            `Record presentation request failed (${response.status})`,
          );
        return [id, await response.text()];
      }),
    );
    return new Map(
      results
        .filter((result) => result.status === "fulfilled" && result.value)
        .map((result) => result.value),
    );
  }

  /**
   * Build the presentation URL for one record: a Smarty report-template URL, or the standard renderer.
   *
   * @param {number} id Record ID.
   * @param {string} template Report template name, or `'standard'` for the default renderer.
   * @returns {URL} The request URL.
   */
  buildUrl(id, template) {
    const name = String(template || "standard").trim();
    if (name && name !== "standard") {
      const url = new URL(
        this.baseUrl,
        globalThis.location?.href || "http://localhost/",
      );
      url.searchParams.set("snippet", "1");
      url.searchParams.set("publish", "1");
      url.searchParams.set("debug", "0");
      url.searchParams.set("q", `ids:${id}`);
      url.searchParams.set("db", this.database);
      url.searchParams.set("template", name);
      return url;
    }
    const url = new URL("viewers/record/renderRecordData.php", this.baseUrl);
    url.searchParams.set("recID", String(id));
    url.searchParams.set("db", this.database);
    return url;
  }
}
