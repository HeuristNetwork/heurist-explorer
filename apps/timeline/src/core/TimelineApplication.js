/**
 * @file TimelineApplication.js
 * @brief Coordinates timeline contexts, loading, selection, and engine rendering.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-timeline
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { TemporalAdapter } from "./TemporalAdapter.js";

/** Coordinates host integration, context loading, selection, and engine rendering for the timeline. */
export class TimelineApplication extends EventTarget {
  /**
   * @param {object} options Application dependencies.
   * @param {HTMLElement} options.container Element the timeline engine renders into.
   * @param {object} options.config Runtime configuration produced by `getHeuristTimelineConfig`.
   * @param {object} options.engine Rendering engine adapter (e.g. VisTimelineEngine).
   * @param {object} options.host Host adapter used for lifecycle delegation.
   * @param {object} options.provider Data provider used to load temporal records per context.
   */
  constructor({ container, config, engine, host, provider }) {
    super();
    this.container = container;
    this.config = config;
    this.engine = engine;
    this.host = host;
    this.provider = provider;
    this.contexts = [];
    this.selection = [];
    this.abortControllers = new Map();
    this.generation = 0;
  }

  /**
   * Initialize the host and engine, then load the configured initial contexts and selection.
   *
   * @returns {Promise<TimelineApplication>} This application instance, once ready.
   */
  async initialize() {
    await this.host.initialize({ config: this.config });
    await this.engine.initialize({
      container: this.container,
      settings: {
        ...this.config.settings,
        iconBaseUrl: this.config.baseUrl || this.config.host?.baseUrl || "",
        database: this.config.database || this.config.host?.database || ""
      },
      onSelectionChange: (ids) => this._selectionFromEngine(ids),
      onRangeChange: (range) => this.dispatch("heurist-timeline-range-changed", range)
    });

    await this.setContexts(this.config.source.contexts || []);
    if (this.config.source.selection?.length) await this.setSelection(this.config.source.selection);

    this.dispatch("heurist-timeline-ready", {});
    return this;
  }

  /**
   * Set the active result query for the "current" context, preserving other contexts and selection.
   *
   * @param {string|null} query Query payload; clears all contexts when empty.
   * @param {object} [options] Additional query options.
   * @param {string} [options.title] Title for the "current" context.
   * @param {string|Array<string>} [options.timefields] Temporal fields to request, overriding the existing context's.
   * @param {Array<string>} [options.fields] Extra fields to request, overriding the existing context's.
   * @param {object} [options.contextOptions] Extra per-context options merged into the existing context's `options`.
   * @returns {Promise<object>} Updated application state.
   */
  async setQuery(query, options = {}) {
    if (query == null || query === "") return this.setContexts([]);

    const current = this.contexts.find((c) => c.id === "current");
    const context = {
      ...(current || {}),
      id: "current",
      title: options.title || current?.title || "Current result",
      query,
      timefields: options.timefields ?? current?.timefields ?? null,
      fields: options.fields ?? current?.fields ?? [],
      options: { ...(current?.options || {}), ...(options.contextOptions || {}) }
    };
    const others = this.contexts.filter((c) => c.id !== "current");
    return this.setContexts([context, ...others], { preserveSelection: true });
  }

  /**
   * Replace the entire list of timeline contexts, loading each one's temporal records.
   *
   * Superseded loads (from an overlapping call) are aborted and their results discarded.
   *
   * @param {Array<object>} contexts Context definitions.
   * @param {{preserveSelection?: boolean}} [options] Set `preserveSelection` to keep the current selection instead of clearing it.
   * @returns {Promise<object>} Updated application state.
   */
  async setContexts(contexts, options = {}) {
    const normalized = normalizeContexts(contexts);
    const generation = ++this.generation;

    // A plain string reason (rather than a named AbortError) makes the
    // signal's own consumers reject with that bare string per the
    // AbortController spec, losing `.name` and defeating "was this just
    // superseded?" checks downstream.
    for (const controller of this.abortControllers.values()) {
      controller.abort(new DOMException("Superseded timeline request", "AbortError"));
    }
    this.abortControllers.clear();

    this.dispatch("heurist-timeline-loading", { contexts: normalized.map(publicContext) });

    const loaded = await Promise.all(normalized.map(async (context) => {
      const controller = new AbortController();
      this.abortControllers.set(context.id, controller);
      try {
        const response = await this.provider.load({ ...context, signal: controller.signal });
        return { ...context, response, items: TemporalAdapter.convertContext(context, response) };
      } finally {
        this.abortControllers.delete(context.id);
      }
    }));

    if (generation !== this.generation) return this.getState();

    this.contexts = loaded;
    await this.engine.setData({
      groups: loaded.filter((c) => c.visible !== false).map((c) => ({ id: c.id, content: c.title, className: `heurist-band-${safeClass(c.id)}` })),
      items: loaded.filter((c) => c.visible !== false).flatMap((c) => c.items)
    });

    if (!options.preserveSelection) this.selection = [];
    if (this.selection.length) await this.engine.setSelection(this.selection);

    this.dispatch("heurist-timeline-loaded", {
      contexts: loaded.map(publicContext),
      itemCount: loaded.reduce((n, c) => n + c.items.length, 0)
    });
    return this.getState();
  }

  /**
   * Append a new context to the current timeline definition.
   *
   * @param {object} context Context definition to append.
   * @returns {Promise<object>} Updated application state.
   */
  async addContext(context) {
    return this.setContexts([...this.contexts.map(publicContext), context], { preserveSelection: true });
  }

  /**
   * Remove an existing context by id.
   *
   * @param {string|number} id Context identifier.
   * @returns {Promise<object>} Updated application state.
   */
  async removeContext(id) {
    return this.setContexts(this.contexts.filter((c) => c.id !== String(id)).map(publicContext), { preserveSelection: true });
  }

  /**
   * Set the selected record identifiers and apply them to the engine.
   *
   * @param {Array<number>} ids Selected record IDs.
   * @param {object} [options] Additional selection options, forwarded to the engine.
   * @returns {Promise<Array<number>>} Updated selection list.
   */
  async setSelection(ids, options = {}) {
    this.selection = normalizeIds(ids);
    await this.engine.setSelection(this.selection, options);
    return [...this.selection];
  }

  /**
   * Clear any existing record selection.
   *
   * @returns {Promise<Array<number>>} Updated (empty) selection list.
   */
  clearSelection() {
    return this.setSelection([]);
  }

  /**
   * Fit the viewport around the current selection.
   *
   * @returns {Promise<void>} Resolves once the engine has zoomed.
   */
  async zoomToSelection() {
    return this.engine.zoomToSelection();
  }

  /**
   * Fit the viewport to all loaded items.
   *
   * @returns {Promise<void>} Resolves once the engine has zoomed.
   */
  async zoomToAll() {
    return this.engine.zoomToAll();
  }

  /**
   * Reload the active contexts from their source payload, preserving selection.
   *
   * @returns {Promise<object>} Updated application state.
   */
  async refresh() {
    return this.setContexts(this.contexts.map(publicContext), { preserveSelection: true });
  }

  /**
   * Resize the timeline display.
   *
   * @returns {*} Result of the engine's resize call.
   */
  resize() {
    return this.engine.resize();
  }

  /**
   * Return the current serialized application state.
   *
   * @returns {{contexts: Array<object>, selection: Array<number>}} Current contexts and selection.
   */
  getState() {
    return { contexts: this.contexts.map(publicContext), selection: [...this.selection] };
  }

  /**
   * Dispatch a public event carrying the given detail payload.
   *
   * @param {string} type Event type.
   * @param {object} detail Event detail payload.
   * @returns {void}
   */
  dispatch(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  /**
   * Apply a selection reported by the engine and dispatch the public selection-changed event.
   *
   * @private
   * @param {Array<number>} ids Record IDs selected in the engine.
   * @returns {void}
   */
  _selectionFromEngine(ids) {
    this.selection = normalizeIds(ids);
    this.dispatch("heurist-timeline-selection-changed", { recordIds: [...this.selection] });
  }

  /**
   * Abort any in-flight loads and tear down the engine and host.
   *
   * @returns {Promise<void>} Resolves once teardown completes.
   */
  async destroy() {
    for (const c of this.abortControllers.values()) c.abort();
    this.abortControllers.clear();
    await this.engine.destroy();
    await this.host.destroy?.();
  }
}

/** Normalize raw context definitions into the internal shape, dropping contexts with no query or ids. */
function normalizeContexts(value) {
  return (Array.isArray(value) ? value : [])
    .map((c, i) => ({
      id: String(c.id ?? `context-${i + 1}`),
      title: String(c.title || `Band ${i + 1}`),
      query: c.query ?? null,
      ids: Array.isArray(c.ids) ? normalizeIds(c.ids) : null,
      timefields: c.timefields ?? null,
      fields: Array.isArray(c.fields) ? [...c.fields] : [],
      visible: c.visible !== false,
      options: { ...(c.options || {}) }
    }))
    .filter((c) => c.query || c.ids?.length);
}

/** Strip a loaded context down to its public, response-free shape. */
function publicContext(c) {
  return {
    id: c.id,
    title: c.title,
    query: c.query,
    ids: c.ids,
    timefields: c.timefields,
    fields: c.fields,
    visible: c.visible,
    options: { ...(c.options || {}) }
  };
}

/** Normalize a value into a de-duplicated array of positive integer record IDs. */
function normalizeIds(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
}

/** Sanitize a value for use as a CSS class-name suffix. */
function safeClass(v) {
  return String(v).replace(/[^a-z0-9_-]/gi, "-");
}
