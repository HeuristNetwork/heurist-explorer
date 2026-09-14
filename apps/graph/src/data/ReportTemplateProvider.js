/**
 * @file ReportTemplateProvider.js
 * @brief Loads Standard and Smarty report templates for popup configuration.
 * @project     Heurist academic knowledge management system
 * @package     heurist-data
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */
/** Provides configured report templates for presentation dialogs. */
export class ReportTemplateProvider {
  constructor({ baseUrl, database, fetchImpl = null } = {}) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.database = database == null ? null : String(database);
    this.fetchImpl = fetchImpl || ((...args) => globalThis.fetch(...args));
  }
  isConfigured() {
    return Boolean(this.baseUrl && this.database);
  }
  async list({ signal } = {}) {
    if (!this.isConfigured()) return [];
    const url = new URL(
      this.baseUrl,
      globalThis.location?.href || "http://localhost/",
    );
    url.searchParams.set("db", this.database);
    url.searchParams.set("action", "list");
    url.searchParams.set("controller", "ReportController");
    const response = await this.fetchImpl(url, {
      credentials: "same-origin",
      signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok)
      throw new Error(
        `Report template list request failed (${response.status})`,
      );
    const payload = await response.json();
    return normalizeTemplates(payload?.data ?? payload);
  }
}
function normalizeTemplates(value) {
  const source = Array.isArray(value)
    ? value
    : Array.isArray(value?.items)
      ? value.items
      : value && typeof value === "object"
        ? Object.entries(value).map(([key, item]) =>
            item && typeof item === "object"
              ? { key, ...item }
              : { value: key, label: item },
          )
        : [];
  return source
    .map((item) => {
      if (typeof item === "string") return { value: item, label: item };
      const value =
        item?.value ??
        item?.name ??
        item?.filename ??
        item?.file ??
        item?.id ??
        item?.key;
      return value == null || value === ""
        ? null
        : {
            value: String(value),
            label: String(
              item.label ?? item.title ?? item.name ?? item.filename ?? value,
            ),
          };
    })
    .filter(Boolean);
}
function normalizeBaseUrl(value) {
  const text = String(value || "").trim();
  return text ? (text.endsWith("/") ? text : `${text}/`) : null;
}
