/**
 * @file RecordContentProvider.js
 * @brief Builds the `legacy`/`smarty` record renderer URL, for iframe embedding.
 *
 * `legacy` and `smarty` engines render in an `<iframe src="...">` pointed at
 * the URL this builds — not fetched and injected — so this provider only
 * ever builds URLs; it never issues a request itself.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-recordview
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */
/** Builds the legacy/Smarty record renderer URL for one record. */
export class RecordContentProvider {
  /**
   * @param {object} options Provider configuration.
   * @param {string} options.baseUrl Legacy Heurist base URL the renderer endpoints are relative to.
   * @param {string} options.database Target Heurist database name.
   */
  constructor({ baseUrl, database } = {}) {
    const value = String(baseUrl || "").trim();
    this.baseUrl = value ? (value.endsWith("/") ? value : `${value}/`) : null;
    this.database = database == null ? null : String(database);
  }

  /** Whether the provider has both a base URL and a database, and can build a URL. */
  isConfigured() {
    return Boolean(this.baseUrl && this.database);
  }

  /**
   * Build the renderer URL for one record.
   *
   * @param {number} id Record id.
   * @param {'legacy'|'smarty'} engine Render engine.
   * @param {string|null} [template] Smarty template name, required when `engine === 'smarty'`.
   * @returns {URL|null} The renderer URL, or `null` when unconfigured.
   */
  buildUrl(id, engine, template = null) {
    if (!this.isConfigured()) return null;
    if (engine === "smarty" && template) {
      const url = new URL(this.baseUrl, globalThis.location?.href || "http://localhost/");
      url.searchParams.set("snippet", "1");
      url.searchParams.set("publish", "1");
      url.searchParams.set("debug", "0");
      url.searchParams.set("q", `ids:${id}`);
      url.searchParams.set("db", this.database);
      url.searchParams.set("template", String(template));
      return url;
    }
    const url = new URL("viewers/record/renderRecordData.php", this.baseUrl);
    url.searchParams.set("recID", String(id));
    url.searchParams.set("db", this.database);
    return url;
  }
}
