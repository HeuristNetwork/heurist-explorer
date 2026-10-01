/**
 * @file RequestMonitor.js
 * @brief Observer of data API requests: in-flight list, trace log, and stop of running queries.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

/** Default number of finished requests kept in the trace log. */
const DEFAULT_MAX_ENTRIES = 200;

/**
 * Collects request entries reported by one or more `HeuristApiClient` instances.
 *
 * Explorer owns the main monitor. A module creates its own monitor with
 * `createModuleRequestMonitor()`; it registers itself with Explorer through the
 * host bridge, so Explorer receives the module's entries and can stop its requests.
 *
 * Events: `requeststart`, `requestend` (detail: entry), `change` (in-flight count
 * or log changed), `tracechange` (detail: {enabled}).
 *
 * An entry is `{rid, source, method, path, summary, startedAt, clientMs, status,
 * httpStatus, total, error, debug}`; status is `running`, `ok`, `error`, `aborted`,
 * `timeout` or `cancelled`.
 */
export class RequestMonitor extends EventTarget {
  /**
   * @param {object} [options] Monitor options.
   * @param {string} [options.source=''] Name of the module that owns the clients (e.g. `data`).
   * @param {number} [options.maxEntries=200] Size of the trace log.
   * @param {boolean} [options.traceEnabled=false] Whether requests ask the server for a debug section.
   */
  constructor({ source = '', maxEntries = DEFAULT_MAX_ENTRIES, traceEnabled = false } = {}) {
    super();
    this.source = source;
    this.maxEntries = maxEntries;
    this._traceEnabled = Boolean(traceEnabled);
    this._inFlight = new Map();
    this._log = [];
    this._clients = new Set();
    this._children = new Set();
    this._parent = null;
  }

  /** @returns {boolean} Whether requests add `debug=1` (inherited from the parent monitor). */
  get traceEnabled() {
    return this._parent ? this._parent.traceEnabled : this._traceEnabled;
  }

  /** @param {boolean} value Switch tracing on or off. */
  set traceEnabled(value) {
    const enabled = Boolean(value);
    if (enabled === this._traceEnabled) return;
    this._traceEnabled = enabled;
    this.dispatchEvent(new CustomEvent('tracechange', { detail: { enabled } }));
  }

  /** @returns {number} Requests currently running, including those of child monitors. */
  get inFlightCount() {
    return this._inFlight.size;
  }

  /** @returns {object[]} Running requests, oldest first. */
  inFlight() {
    return [...this._inFlight.values()];
  }

  /** @returns {object[]} Finished requests, newest first. */
  entries() {
    return [...this._log];
  }

  /**
   * Remove finished entries from the log.
   *
   * @returns {void}
   */
  clear() {
    this._log = [];
    this._emitChange();
  }

  /**
   * Register an API client so `abortAll()` can stop its requests.
   *
   * @param {object} client `HeuristApiClient` instance.
   * @returns {void}
   */
  attachClient(client) {
    if (client) this._clients.add(client);
  }

  /**
   * Accept entries from a module's monitor (Explorer side of the host bridge).
   *
   * @param {RequestMonitor} child Module monitor.
   * @returns {Function} Unregister function.
   */
  attachChild(child) {
    if (!child || child === this) return () => {};
    this._children.add(child);
    child._parent = this;
    for (const entry of child.inFlight()) this._start(entry);
    return () => {
      this._children.delete(child);
      if (child._parent === this) child._parent = null;
      for (const entry of child.inFlight()) this._inFlight.delete(entry.rid);
      this._emitChange();
    };
  }

  /**
   * Called by a client when a request starts.
   *
   * @param {object} entry New entry (status `running`).
   * @returns {void}
   */
  begin(entry) {
    entry.source ||= this.source;
    this._start(entry);
  }

  /**
   * Called by a client when a request ends (in any state).
   *
   * @param {object} entry Finished entry.
   * @returns {void}
   */
  end(entry) {
    this._inFlight.delete(entry.rid);
    this._log.unshift(entry);
    if (this._log.length > this.maxEntries) this._log.length = this.maxEntries;
    this.dispatchEvent(new CustomEvent('requestend', { detail: entry }));
    this._emitChange();
    this._parent?.end(entry);
  }

  /**
   * Stop every running request of the attached clients and of child monitors.
   * The server is asked to cancel the running SQL as well.
   *
   * @returns {string[]} Request ids that were stopped.
   */
  abortAll() {
    const stopped = [];
    for (const client of this._clients) stopped.push(...client.abortAll());
    for (const child of this._children) stopped.push(...child.abortAll());
    return stopped;
  }

  /** @private */
  _start(entry) {
    this._inFlight.set(entry.rid, entry);
    this.dispatchEvent(new CustomEvent('requeststart', { detail: entry }));
    this._emitChange();
    this._parent?._start(entry);
  }

  /** @private */
  _emitChange() {
    this.dispatchEvent(new CustomEvent('change'));
  }
}

/**
 * Create a module monitor and register it with the Explorer host when the host
 * bridge offers `registerRequestMonitor` (it is absent in standalone use).
 *
 * @param {object|null} bridge Host bridge from the module configuration.
 * @param {string} source Module name shown in the trace.
 * @returns {RequestMonitor} The module monitor.
 */
export function createModuleRequestMonitor(bridge, source) {
  const monitor = new RequestMonitor({ source });
  try {
    bridge?.registerRequestMonitor?.(monitor);
  } catch (error) {
    console.warn('Request monitor was not registered with the host', error);
  }
  return monitor;
}
