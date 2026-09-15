/**
 * @file HostAdapter.js
 * @brief Generic host integration contract for Heurist modules.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2005-2023 University of Sydney, (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

/** Optional services supplied to an independent module by its embedding host. */
export class HostAdapter {
  /**
   * @param {object} [options] Host adapter configuration.
   * @param {object|null} [options.bridge] Same-origin host bridge, when embedded in an iframe.
   * @param {string|null} [options.moduleType] Module type, used to namespace preferences and publications.
   * @param {string|null} [options.baseUrl] Base URL of the Heurist FrontController.
   * @param {string|null} [options.database] Target Heurist database name.
   * @param {Function|null} [options.fetchImpl] Fetch implementation to use instead of the global `fetch`.
   */
  constructor({
    bridge = null,
    moduleType = null,
    baseUrl = null,
    database = null,
    fetchImpl = null,
  } = {}) {
    this.bridge = bridge;
    this.moduleType = moduleType;
    this.baseUrl = String(baseUrl || "").replace(/\?$/, "");
    this.database = database || null;
    this.fetchImpl =
      typeof fetchImpl === "function"
        ? fetchImpl
        : (...args) => globalThis.fetch(...args);
  }

  /** Perform any asynchronous setup the host adapter requires. No-op by default. */
  async initialize() {}

  /** Whether the host can edit or create records (delegates to the bridge's `editRecord`). */
  supportsEditing() {
    return typeof this.bridge?.editRecord === "function";
  }

  /**
   * Ask the host to open its record editor for an existing record.
   *
   * @param {number|string} recordId Heurist record ID to edit.
   * @returns {Promise<*>} Result of the host's edit action.
   * @throws {Error} When `recordId` is invalid or the host cannot edit records.
   */
  async editRecord(recordId) {
    const id = Number(recordId);
    if (!(id > 0))
      throw new Error("A valid Heurist record ID is required for editing");
    if (!this.supportsEditing())
      throw new Error("Record editing is not available from the Heurist host");
    return this.bridge.editRecord(id);
  }

  /**
   * Ask the host to open its record editor for a new record of the given type.
   *
   * @param {number|string} recordTypeId Heurist record type ID for the new record.
   * @returns {Promise<*>} Result of the host's add action.
   * @throws {Error} When `recordTypeId` is invalid or the host cannot create records.
   */
  async addRecord(recordTypeId) {
    const id = Number(recordTypeId);
    if (!(id > 0))
      throw new Error("A valid Heurist record type ID is required for creation");
    if (!this.supportsEditing() || typeof this.bridge?.addRecord !== "function")
      throw new Error("Record creation is not available from the Heurist host");
    return this.bridge.addRecord(id);
  }

  /** Whether the host can run a Heurist record search (delegate ON_REC_SEARCHSTART). */
  supportsSearch() {
    return typeof this.bridge?.doSearch === "function";
  }

  /**
   * Delegate a Current Results/Filter search to the host's global search engine.
   *
   * @param {object} request Search request understood by the host.
   * @returns {*} Result of the host's search delegate.
   * @throws {Error} When the host cannot run searches.
   */
  doSearch(request) {
    if (!this.supportsSearch())
      throw new Error("Host record search is unavailable");
    return this.bridge.doSearch(request);
  }

  /**
   * Return optional capabilities. Concrete modules define their public keys.
   *
   * @returns {object} Capability flags; empty by default.
   */
  getCapabilities() { return {}; }

  /**
   * Load this module's persisted settings (`heurist-<moduleType>`) via the FrontController.
   *
   * @returns {Promise<object|null>} Parsed settings object, or `null` when absent or invalid.
   */
  async loadPreferences() {
    let value = await this.request("UserController", "get_prefs", {
      key: `heurist-${this.moduleType}`,
    });
    if (typeof value === "string" && value) {
      try {
        value = JSON.parse(value);
      } catch {
        return null;
      }
    }
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : null;
  }

  /**
   * Persist this module's settings (`heurist-<moduleType>`) via the FrontController.
   *
   * @param {object} settings Settings object to persist.
   * @returns {Promise<*>} Result of the FrontController request.
   */
  async savePreferences(settings) {
    const result = await this.request(
      "UserController",
      "save_prefs",
      {},
      { key: `heurist-${this.moduleType}`, value: JSON.stringify(settings) },
    );
    this.bridge?.updateSettings?.(settings);
    return result;
  }

  /**
   * Publish a module document via the FrontController PublicationController.
   *
   * @param {object} payload Module-specific document to publish.
   * @returns {Promise<*>} Result of the FrontController request.
   */
  async publish(payload) {
    return this.request(
      "PublicationController",
      "save",
      { type: this.moduleType },
      { data: JSON.stringify(payload) },
    );
  }

  /**
   * Shared FrontController request helper: query-string GET or form-encoded POST.
   *
   * @param {string} controller FrontController controller name.
   * @param {string} action Controller action name.
   * @param {object} [query] Query-string parameters.
   * @param {object|null} [post] Form-encoded POST body; sends a GET request when omitted.
   * @returns {Promise<*>} The response's `data` field.
   * @throws {Error} When the adapter is unconfigured, the request fails, or the response reports an error.
   */
  async request(controller, action, query = {}, post = null) {
    if (!this.baseUrl || !this.database)
      throw new Error("Heurist host FrontController is not configured");
    const url = new URL(
      this.baseUrl,
      globalThis.location?.href || "http://localhost/",
    );
    url.searchParams.set("db", this.database);
    url.searchParams.set("controller", controller);
    url.searchParams.set("action", action);
    Object.entries(query || {}).forEach(([key, value]) => {
      if (value != null) url.searchParams.set(key, String(value));
    });
    const init = { credentials: "same-origin" };
    if (post) {
      init.method = "POST";
      init.headers = {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      };
      init.body = new URLSearchParams(
        Object.entries(post).map(([key, value]) => [key, String(value)]),
      ).toString();
    }
    const response = await this.fetchImpl(url, init);
    if (!response.ok)
      throw new Error(`FrontController request failed (${response.status})`);
    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      const contentType = response.headers?.get?.("content-type") || "";
      throw new Error(
        `FrontController returned a non-JSON response${contentType ? ` (${contentType})` : ""}`,
      );
    }
    if (!isSuccessStatus(payload?.status)) {
      throw new Error(
        payload?.message ||
          payload?.error?.message ||
          payload?.data?.message ||
          "FrontController request failed",
      );
    }
    return payload.data;
  }

  /** Release any resources held by the adapter. No-op by default. */
  async destroy() {}
}

/** Whether a FrontController response `status` value indicates success. */
function isSuccessStatus(status) {
  return (
    status === 0 || status === "0" || String(status || "").toLowerCase() === "ok"
  );
}
