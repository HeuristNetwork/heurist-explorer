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

import { HeuristApiClient } from "../api/HeuristApiClient.js";
import { WebsiteClient } from "../api/WebsiteClient.js";
import { publishModulePage } from "../site/modulePublisher.js";

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

  /**
   * Whether the host can edit or create records: the bridge has `editRecord`
   * and its `canEditRecords()` answers true (a logged-in user with the host's
   * record editor loaded). A bridge that does not answer cannot prove it, so
   * edit actions stay hidden.
   *
   * With a record type, the bridge's `canEditRecordType(recordType)` answers
   * when it has one: Explorer edits the system record types (query sources, map
   * documents and layers, reports, website pages) in its own record editor, also
   * without the legacy host (plan 14).
   *
   * @param {number|string|null} [recordType] Record type id or code name (e.g. `RT_MAP_LAYER`).
   * @returns {boolean}
   */
  supportsEditing(recordType = null) {
    if (typeof this.bridge?.editRecord !== "function") return false;
    try {
      if (recordType != null && recordType !== "" && typeof this.bridge.canEditRecordType === "function") {
        return this.bridge.canEditRecordType(recordType) === true;
      }
      if (typeof this.bridge.canEditRecords !== "function") return false;
      return this.bridge.canEditRecords() === true;
    } catch {
      return false;
    }
  }

  /**
   * Ask the host to open its record editor for an existing record.
   *
   * @param {number|string} recordId Heurist record ID to edit.
   * @param {{recordType?: number|string|null, pageIds?: number[]|null}} [options] Record type id or code
   *        name, when known; `pageIds`: ordered ids of the list page (the editor steps through them).
   * @returns {Promise<*>} Result of the host's edit action (`{saved, recordId}`).
   * @throws {Error} When `recordId` is invalid or the host cannot edit records.
   */
  async editRecord(recordId, { recordType = null, pageIds = null } = {}) {
    const id = Number(recordId);
    if (!(id > 0))
      throw new Error("A valid Heurist record ID is required for editing");
    if (!this.supportsEditing(recordType))
      throw new Error("Record editing is not available from the Heurist host");
    const options = {
      ...(recordType != null ? { recordType } : {}),
      ...(Array.isArray(pageIds) && pageIds.length > 1 ? { pageIds: pageIds.map(Number) } : {}),
    };
    return Object.keys(options).length ? this.bridge.editRecord(id, options) : this.bridge.editRecord(id);
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
    if (!this.supportsEditing(id) || typeof this.bridge?.addRecord !== "function")
      throw new Error("Record creation is not available from the Heurist host");
    return this.bridge.addRecord(id);
  }

  /** Whether the host offers the record manager (plan 21). */
  supportsBrowse() {
    return typeof this.bridge?.browseRecords === "function";
  }

  /**
   * Ask the host to open the record manager (plan 21): select records of some types.
   *
   * @param {{recordTypes?: Array<number>, selectMode?: 'select'|'select_multi', allowAddition?: boolean}} [options]
   * @returns {Promise<number[]|null>} Selected record ids, or null when cancelled.
   * @throws {Error} When the host has no record manager.
   */
  async browseRecords(options = {}) {
    if (!this.supportsBrowse())
      throw new Error("The record manager is not available from the Heurist host");
    return this.bridge.browseRecords({ ...options });
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
   * Publish the module as a standalone website page (plan 27b §6): asks for the page title and
   * whether to update the last page of this module, then writes the page (`POST /api/{db}/website/publish`).
   * With a bridge that has `openWebsiteManager` (Explorer) the result offers a button to open it.
   *
   * @param {object} payload Publish payload of the module (`{format: 'heurist-publication', options, config, state}`).
   * @returns {Promise<{id: number, url: string, title: string, embed: string, actions: Array}|null>} Null when
   *          the user cancelled.
   */
  async publish(payload) {
    if (!this.baseUrl || !this.database)
      throw new Error("Heurist host is not configured");
    const apiClient = new HeuristApiClient({ apiBaseUrl: this.baseUrl, database: this.database, fetchImpl: this.fetchImpl });
    const result = await publishModulePage({
      client: new WebsiteClient({ apiClient }),
      database: this.database,
      type: this.moduleType,
      payload,
    });
    if (!result) return null;
    const actions = typeof this.bridge?.openWebsiteManager === "function"
      ? [{ label: "Website manager", run: () => this.bridge.openWebsiteManager({ recordId: result.id }) }]
      : [];
    return { ...result, actions };
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
