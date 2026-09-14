/**
 * @file RecordContentProvider.js
 * @brief Lazy loader for standard and Smarty record presentation HTML.
 * @project     Heurist academic knowledge management system
 * @package     heurist-data
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */
/** Loads deferred standard and Smarty record presentation content. */
export class RecordContentProvider {
  constructor({ baseUrl, database, fetchImpl = null } = {}) {
    const value = String(baseUrl || "").trim();
    this.baseUrl = value ? (value.endsWith("/") ? value : `${value}/`) : null;
    this.database = database == null ? null : String(database);
    this.fetchImpl = fetchImpl || ((...args) => globalThis.fetch(...args));
  }

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
