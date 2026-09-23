/**
 * @file DataApplication.js
 * @brief Heurist Data application controller.
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

import { normalizeDataConfigurationSettings } from "../ui/config/dataConfigurationSchema.js";

/** Coordinates host integration, data loading, engine rendering, and state. */
export class DataApplication extends EventTarget {
  /**
   * @param {object} options Application dependencies.
   * @param {HTMLElement} options.container Element the rendering engine mounts into.
   * @param {object} options.config Runtime configuration produced by `getHeuristDataConfig`.
   * @param {object} options.engine Rendering engine adapter (e.g. HRecordList or DataTablesAdapter).
   * @param {Function|null} [options.engineFactory] Factory used to swap engines when the configured engine changes.
   * @param {object} options.host Host adapter used for lifecycle and preference delegation.
   * @param {object} options.loaders Loader registry used to load persisted Query Sources and direct queries.
   * @param {object} [options.providers] Supporting providers (record content, field values, etc.).
   */
  constructor({
    container,
    config,
    engine,
    engineFactory = null,
    host,
    loaders,
    providers = {},
  }) {
    super();
    this.container = container;
    this.config = config;
    this.engine = engine;
    this.engineFactory = engineFactory;
    this.engineName = config.engine;
    this.host = host;
    this.loaders = loaders;
    this.providers = providers;
    this.querySource = null;
    this.response = null;
    this.selection = [];
    this.abortController = null;
    this.requestGeneration = 0;
    this.activeLoad = null;
    this.dataSource = cloneValue(config.source?.dataSource);
    this.sourceTitle = text(config.source?.title ?? this.dataSource?.title);
    this.hostContext = null;
    this.recordsTotal = null;
    this.collection = [];
    this.unsubscribeCollection = null;
    this.currentResultsSource = config.source?.query
      ? { query: config.source.query, fields: config.source.fields || [] }
      : null;
  }

  /** Initialize the host, engine, collection bridge, and initial data source. */
  async initialize() {
    await this.host.initialize({ config: this.config });
    this.hostContext = await Promise.resolve(this.host.getHostContext?.()) || {};
    this.config.engineOptions.sourceActionsEnabled = this._isExplorerMain();
    await this._loadInitialPreferences();
    if (
      this.config.engine !== this.engineName &&
      typeof this.engineFactory === "function"
    ) {
      this.engine = await this.engineFactory(this.config.engine);
      this.engineName = this.config.engine;
    }
    await this.engine.initialize(this._engineContext());
    await this._configureCollection();
    if (this.config.source.querySourceId) {
      await this.setQuerySource(
        this.config.source.querySourceId,
        {
          ...initialPageOptions(this.config.source.pagination),
          dataSource: this.config.source.dataSource,
          title: this.config.source.title,
        },
      );
    } else if (this.config.source.query) {
      await this.setQuery(this.config.source.query, {
        fields: this.config.source.fields,
        dataSource: this.config.source.dataSource,
        title: this.config.source.title,
        ...initialPageOptions(this.config.source.pagination),
      });
    } else {
      await this.engine.setData({
        querySource: null,
        records: [],
        meta: {},
        pagination: {},
      });
    }
    if (this.config.source.selection.length) {
      await this.setSelection(this.config.source.selection);
    }
    await this._syncDataSourceActions();
    this.dispatch("heurist-data-ready", {});
    return this;
  }

  /** Build the callback/options context passed to the rendering engine's `initialize`. */
  _engineContext() {
    return {
      container: this.container,
      options: this.config.engineOptions,
      onSelectionChange: (ids) => this._selectionFromEngine(ids),
      onEditRecord: (id) => this.requestEditRecord(id),
      onViewRecord: (id) => this.requestViewRecord(id),
      onCollectionToggle: (id, collected) =>
        this.setRecordCollected(id, collected),
      onCollectionAction: (action, ids) =>
        this.applyCollectionAction(action, ids),
      onRecordContentRequest: (request) => this.requestRecordContent(request),
      onDataRequest: (request) => this._loadPage(request),
      onViewModeChange: (mode) => this.requestViewMode(mode),
      onDataSourceAction: async (action) => {
        try {
          return await this.requestDataSourceAction(action);
        } catch (error) {
          this.dispatch("heurist-data-error", {
            error,
            operation: `datasource-${action}`,
          });
          return false;
        }
      },
    };
  }

  /**
   * React to a view-mode change from the active engine. The record-list view
   * modes render in HRecordList; "datatable" swaps the engine to DataTables.
   * Engine replacement and re-rendering are handled by applyConfiguration.
   */
  async requestViewMode(mode) {
    const settings = this.config.persistedSettings;
    if (settings.config.defaults.viewMode === mode) return this.getState();
    settings.config.defaults.viewMode = mode;
    settings.config.defaults.engine =
      mode === "datatable" ? "datatables" : "recordlist";
    await this.applyConfiguration(settings);
    return this.getState();
  }

  /** Load and apply the host's persisted configuration, when not already embedded at bootstrap. */
  async _loadInitialPreferences() {
    if (
      !this.config.loadPreferencesOnInit ||
      typeof this.host.loadPreferences !== "function"
    )
      return;
    try {
      const saved = await this.host.loadPreferences();
      if (!saved) return;
      const normalized = normalizeDataConfigurationSettings(saved);
      if (
        String(this.config.runtimeMode || "").toLowerCase() === "main" &&
        saved?.options?.nativeControls?.search == null
      ) {
        normalized.options.nativeControls.search = false;
      }
      this._setConfiguration(normalized);
    } catch (error) {
      this.dispatch("heurist-data-error", {
        error,
        operation: "load-preferences",
      });
    }
  }

  /** Load and activate a persisted Query Source by ID (internal; not exposed on the public API). */
  async setQuerySource(querySourceId, options = {}) {
    this.dataSource = cloneValue(options.dataSource);
    this.sourceTitle = text(options.title ?? this.dataSource?.title);
    this._resetActiveLoad({ type: "source", querySourceId, options });
    const result = await this._load("source", {
      limit: this.config.engineOptions?.pageLength,
      querySourceId,
      ...options,
    });
    this.querySource = result.querySource;
    return this._applyResult(result);
  }

  /** Load and activate a transient Filtered Result query. */
  async setQuery(query, options = {}) {
    if (query == null || query === "") return this.clearData();
    if (options.dataSource) this.dataSource = cloneValue(options.dataSource);
    else if (!options.preserveDataSource)
      this.dataSource = adHocDataSource(query, options.title);
    this.sourceTitle = text(options.title ?? this.dataSource?.title);
    if (options.rememberCurrentResults !== false) {
      this.currentResultsSource = { query, fields: options.fields || [] };
    }
    // Host search events keep Filtered Result up to date, but must not replace
    // a Query Source which the user deliberately selected.
    if (
      this.activeLoad?.type === "source" &&
      options.activateCurrentResults !== true
    ) {
      return this.getState();
    }
    this._resetActiveLoad({ type: "query", query, options });
    const result = await this._load("query", {
      limit: this.config.engineOptions?.pageLength,
      query,
      ...options,
    });
    this.querySource = result.querySource;
    return this._applyResult(result);
  }

  /**
   * Show or hide a loading indicator for the active DataSource, called by
   * the host right before/after its setDataSource() call. Drives the same
   * indicator the active engine already shows for its own internal
   * page/filter requests.
   *
   * @param {boolean} loading Whether a load is in progress.
   * @returns {void}
   */
  setLoading(loading) {
    this.engine.setLoading?.(Boolean(loading));
  }

  /** Apply Explorer's complete normalized DataSource without losing identity. */
  setDataSource(dataSource, options = {}) {
    const request = dataSource?.request || {};
    const fields = dataSource?.presentation?.data?.fields;
    return this.setQuery(request.q ?? dataSource?.query, {
      ...options,
      dataSource,
      title: dataSource?.title,
      fields: Array.isArray(fields) ? fields : options.fields,
      activateCurrentResults: true,
    });
  }

  /** Run a generation-guarded, abortable load through the loader registry, dispatching loading/error events. */
  async _load(type, request) {
    const generation = ++this.requestGeneration;
    // A plain string reason (rather than a named AbortError) makes the
    // signal's own consumers (fetch, and our own AbortError checks) reject
    // with that bare string per the AbortController spec - losing `.name`
    // and defeating every downstream "was this just superseded?" check.
    this.abortController?.abort(abortError("Superseded data request"));
    this.abortController = new AbortController();
    const controller = this.abortController;
    this.dispatch("heurist-data-loading", { type, request });
    try {
      const result = await this.loaders.load(type, {
        ...request,
        includeQuerySourceFields: this.config.engine !== "recordlist",
        // IMPORTANT: presentation-only virtual fields are fetched but are not
        // inserted into the user's persisted Query Source fieldset.
        additionalFields: this._presentationFields(),
        signal: controller.signal,
      });
      if (generation !== this.requestGeneration) {
        throw abortError("Superseded data request");
      }
      return result;
    } catch (error) {
      if (!controller.signal.aborted && error?.name !== "AbortError") {
        this.dispatch("heurist-data-error", { error, operation: type });
      }
      throw error;
    }
  }

  /** Extra fields fetched for presentation only, never added to the user's persisted fieldset. */
  _presentationFields() {
    return [
      "rec_OwnerName",
      "rec_ThumbnailURL",
      "rec_Bookmarked",
      "rec_NonOwnerVisibility",
    ];
  }

  /** Apply a load result to the engine and dispatch `heurist-data-loaded`. */
  async _applyResult(result) {
    this.response = result.response;
    this.recordsTotal = Number(result.response.pagination?.total) || 0;
    await this.engine.setData({
      querySource: result.querySource,
      records: result.response.records || [],
      meta: result.response.meta || {},
      pagination: result.response.pagination || {},
    });
    this.dispatch("heurist-data-loaded", {
      querySource: result.querySource.toJSON(),
      dataSource: cloneValue(this.dataSource),
      title: this.sourceTitle,
      pagination: result.response.pagination || {},
    });
    await this._syncDataSourceActions();
    return this.getState();
  }

  /** Set the active load descriptor and dispatch a pending `heurist-data-source-changed` event. */
  _resetActiveLoad(activeLoad) {
    this.activeLoad = activeLoad;
    this.recordsTotal = null;
    this.dispatch("heurist-data-source-changed", {
      source: activeLoad.type,
      pending: true,
    });
  }

  /** Load one page of the active source, requested by the engine's pagination/sort/filter controls. */
  async _loadPage({ offset, limit, sort, filter } = {}) {
    if (!this.activeLoad) throw new Error("No Query Source is active");
    const request = {
      ...this.activeLoad.options,
      offset,
      limit,
      sort,
      filter,
    };
    if (this.activeLoad.type === "source")
      request.querySourceId = this.activeLoad.querySourceId;
    else request.query = this.activeLoad.query;
    const result = await this._load(this.activeLoad.type, request);
    const filteredTotal = Number(result.response.pagination?.total) || 0;
    if (filter == null || filter === "") this.recordsTotal = filteredTotal;
    this.response = result.response;
    return {
      querySource: result.querySource,
      records: result.response.records || [],
      meta: result.response.meta || {},
      recordsTotal: this.recordsTotal ?? filteredTotal,
      recordsFiltered: filteredTotal,
    };
  }

  /** Replace the selected record IDs and synchronize the rendering engine. */
  async setSelection(recordIds, options = {}) {
    this.selection = normalizeIds(recordIds);
    await this.engine.setSelection(this.selection, options);
    return [...this.selection];
  }

  /** Clear the current record selection. */
  async clearSelection() {
    return this.setSelection([]);
  }

  /** Abort active loading and clear the rendered data state. */
  async clearData() {
    this.requestGeneration += 1;
    this.abortController?.abort(abortError("Data cleared"));
    this.querySource = null;
    this.activeLoad = null;
    this.dataSource = null;
    this.sourceTitle = "";
    this.recordsTotal = null;
    this.response = {
      records: [],
      meta: {},
      pagination: { total: 0, offset: 0, limit: 0 },
    };
    this.selection = [];
    await this.engine.setData({
      querySource: null,
      records: [],
      meta: {},
      pagination: this.response.pagination,
    });
    this.dispatch("heurist-data-loaded", {
      querySource: null,
      dataSource: null,
      title: null,
      pagination: this.response.pagination,
    });
    await this._syncDataSourceActions();
    return this.getState();
  }

  /** Apply a selection reported by the engine and dispatch the public selection-changed event. */
  _selectionFromEngine(recordIds) {
    this.selection = normalizeIds(recordIds);
    this.dispatch("heurist-data-selection-changed", {
      recordIds: [...this.selection],
    });
  }

  /** Request record editing through the host or dispatch a host event. */
  async requestEditRecord(recordId) {
    if (this.host.supportsEditing()) return this.host.editRecord(recordId);
    this.dispatch("heurist-data-edit-record-requested", {
      recordId: Number(recordId),
    });
    return null;
  }

  /** Request record viewing through the host or dispatch a host event. */
  async requestViewRecord(recordId) {
    if (this.host.supportsViewing?.()) return this.host.viewRecord(recordId);
    this.dispatch("heurist-data-view-record-requested", {
      recordId: Number(recordId),
    });
    return null;
  }

  /**
   * Add or remove one record from the host's persistent collection.
   *
   * @param {number|string} recordId Record ID to add or remove.
   * @param {boolean} collected `true` to add the record, `false` to remove it.
   * @returns {Promise<boolean>} True when the collection was updated.
   * @throws {Error} When the host doesn't support persistent collections.
   */
  async setRecordCollected(recordId, collected) {
    const id = Number(recordId);
    if (!Number.isInteger(id) || id < 1) return false;
    if (!this.config.engineOptions?.interaction?.persistentSelectionEnabled)
      return false;
    if (!this.host.supportsCollection?.())
      throw new Error("Persistent collection is unavailable from this host");
    // The host returns its canonical validated collection. Do not re-scan it.
    this.collection = await (collected
      ? this.host.addToCollection(id)
      : this.host.removeFromCollection(id));
    await this.engine.setCollection?.(this.collection);
    return true;
  }

  /**
   * Apply a bulk action to the host's persistent collection.
   *
   * @param {'add'|'remove'|'clear'|'show'} action Action to perform.
   * @param {Array<number|string>} [recordIds] Record IDs the action applies to; ignored by `clear` and `show`.
   * @returns {Promise<boolean|object>} True/false for add/remove/clear, or the result of `show` loading the collection as a query.
   */
  async applyCollectionAction(action, recordIds = []) {
    if (
      !this.config.engineOptions?.interaction?.persistentSelectionEnabled ||
      !this.host.supportsCollection?.()
    )
      return false;
    const ids = normalizeIds(recordIds);
    if (action === "add")
      this.collection = await this.host.addToCollection(ids);
    else if (action === "remove")
      this.collection = await this.host.removeFromCollection(ids);
    else if (action === "clear")
      this.collection = await this.host.removeFromCollection(this.collection);
    else if (action === "show") {
      if (!this.collection.length) return this.clearData();
      return this.setQuery(
        { ids: [...this.collection] },
        {
          fields:
            this.querySource?.fields || this.currentResultsSource?.fields || [],
          activateCurrentResults: true,
          rememberCurrentResults: true,
        },
      );
    } else return false;
    await this.engine.setCollection?.(this.collection);
    return true;
  }

  /** Load deferred record presentation content. */
  async requestRecordContent(request = {}) {
    return this.providers.recordContent?.load?.(request) ?? null;
  }

  /** Return the current engine-neutral application state. */
  getState() {
    const engineState = this.engine.getState?.() || {};
    return {
      querySourceId: this.querySource?.id ?? null,
      query: this.querySource?.source?.query ?? null,
      dataSource: cloneValue(this.dataSource),
      title: this.sourceTitle || null,
      sourceType: this.activeLoad?.type ?? null,
      selection: [...this.selection],
      pagination: engineState.pagination || this.response?.pagination || null,
      ...(engineState.viewMode ? { viewMode: engineState.viewMode } : {}),
    };
  }

  /**
   * Return the host's optional capability flags.
   *
   * @returns {object} Capability flags, or `{}` when the host declares none.
   */
  getCapabilities() {
    return this.host.getCapabilities?.() || {};
  }

  /** Whether this instance is running as Explorer's main data view, with workspace/source actions enabled. */
  _isExplorerMain() {
    const runtimeMain =
      String(this.config.runtimeMode || "").toLowerCase() === "main";
    const hostName = String(this.hostContext?.name || "").toLowerCase();
    return (
      runtimeMain &&
      hostName === "heurist-explorer" &&
      this.host.supportsExplorerDataSources?.() === true
    );
  }

  /**
   * Perform a datasource-related action requested by the engine's source-actions UI
   * (Explorer-main only): toggling workspace membership, or saving as a filter/source.
   *
   * @param {'workspace'|'save-filter'|'save-source'} action Action to perform.
   * @returns {Promise<boolean|*>} For `workspace`, the new membership state; otherwise the host action's result, or `false` when unavailable.
   */
  async requestDataSourceAction(action) {
    if (!this._isExplorerMain() || !this.dataSource) return false;
    if (action === "workspace") {
      const inWorkspace = await this.host.isDataSourceInWorkspace(this.dataSource);
      if (inWorkspace)
        await this.host.removeDataSourceFromWorkspace(this.dataSource);
      else
        await this.host.addDataSourceToWorkspace(this.dataSource, {
          title: this.sourceTitle,
        });
      await this._syncDataSourceActions();
      return !inWorkspace;
    }
    if (action === "save-filter")
      return this.host.saveDatasourceAsFilter(this.dataSource);
    if (action === "save-source")
      return this.host.saveDatasourceAsSource(
        this._dataSourceWithPresentation(),
        { module: "data" },
      );
    return false;
  }

  /** Clone the active datasource with its current field selection attached as `presentation.data.fields`. */
  _dataSourceWithPresentation() {
    const source = cloneValue(this.dataSource);
    if (!source) return null;
    source.presentation ||= {};
    source.presentation.data = {
      ...(source.presentation.data || {}),
      fields: [
        ...(this.querySource?.fields || this.currentResultsSource?.fields || []),
      ],
    };
    return source;
  }

  /** Refresh the engine's source-actions UI (enabled/workspace state) from current Explorer-main status. */
  async _syncDataSourceActions() {
    const enabled = this._isExplorerMain() && Boolean(this.dataSource);
    const inWorkspace = enabled
      ? await Promise.resolve(
          this.host.isDataSourceInWorkspace?.(this.dataSource),
        ).catch(() => false)
      : false;
    await this.engine.setDataSourceActions?.({ enabled, inWorkspace });
  }

  /**
   * Ask the host to edit the field selection for the active Query Source (or Filtered Result).
   *
   * For a Filtered Result (no Query Source id), the returned field list is applied immediately
   * and remembered as the current-results field selection.
   *
   * @returns {Promise<*>} The host's `editFieldset` result, or `null` when the host doesn't support it
   *   (a `heurist-data-pick-fields-requested` event is dispatched instead).
   */
  async requestPickFields() {
    if (typeof this.host.editFieldset === "function") {
      const result = await this.host.editFieldset({
        querySource: this.querySource?.toJSON?.() || null,
      });
      if (this.querySource?.id == null) {
        const fields = Array.isArray(result)
          ? result
          : (result?.fields ?? result?.value?.fields);
        if (Array.isArray(fields)) {
          const currentQuery = this.querySource?.source?.query ?? null;
          this.currentResultsSource = {
            ...(this.currentResultsSource || {}),
            query: currentQuery,
            fields,
          };
          if (currentQuery)
            await this.setQuery(currentQuery, {
              fields,
              activateCurrentResults: true,
              rememberCurrentResults: true,
            });
        }
      }
      return result;
    }
    this.dispatch("heurist-data-pick-fields-requested", {
      querySource: this.querySource?.toJSON?.() || null,
    });
    return null;
  }

  /**
   * Resize the rendering engine.
   *
   * @returns {*} Result of the engine's resize call.
   */
  resize() {
    return this.engine.resize();
  }

  /**
   * Apply a new persisted configuration, replacing the rendering engine when it changed.
   *
   * @param {object} settings Raw persisted-configuration settings; normalized before applying.
   * @returns {Promise<object>} The normalized, applied settings.
   */
  async applyConfiguration(settings) {
    const normalized = normalizeDataConfigurationSettings(settings);
    const previousEngine = this.engineName;
    this._setConfiguration(normalized);
    if (this.config.engine !== previousEngine) {
      await this._replaceEngine();
      this.dispatch("heurist-data-configuration-changed", {
        options: normalized.options,
        config: normalized.config,
      });
      return normalized;
    }
    await this._configureCollection();
    await this.engine.applyConfiguration?.(this.config.engineOptions);
    this.dispatch("heurist-data-configuration-changed", {
      options: normalized.options,
      config: normalized.config,
    });
    return normalized;
  }

  /** Apply a normalized configuration to `this.config` (persisted settings, UI flags, engine options). */
  _setConfiguration(normalized) {
    this.config.persistedSettings = normalized;
    this.config.ui = normalized.options.ui;
    this.config.engine = normalized.config.defaults.engine;
    this.config.engineOptions = {
      ...this.config.engineOptions,
      ...normalized.config.defaults,
      controls: normalized.options.nativeControls,
      interaction: normalized.options.interaction,
      pageLength: normalized.config.defaults.pageSize,
    };
  }

  /** Destroy the current engine and initialize the newly configured one, re-applying live state. */
  async _replaceEngine() {
    if (typeof this.engineFactory !== "function") {
      throw new Error("Data engine factory is unavailable");
    }
    await this.engine.destroy();
    this.engine = await this.engineFactory(this.config.engine);
    this.engineName = this.config.engine;
    await this.engine.initialize(this._engineContext());
    await this._configureCollection();
    await this.engine.setData({
      querySource: this.querySource,
      records: this.response?.records || [],
      meta: this.response?.meta || {},
      pagination: this.response?.pagination || {
        total: 0,
        offset: 0,
        limit: 0,
      },
    });
    await this.engine.setSelection(this.selection);
    await this._syncDataSourceActions();
  }

  /**
   * Dispatch a public event carrying the given detail payload.
   *
   * @param {string} name Event type.
   * @param {object} detail Event detail payload.
   * @returns {void}
   */
  dispatch(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail }));
  }

  /** (Re-)subscribe to the host's persistent collection, or clear it when unsupported/disabled. */
  async _configureCollection() {
    const enabled =
      this.config.engineOptions?.interaction?.persistentSelectionEnabled ===
      true;
    this.unsubscribeCollection?.();
    this.unsubscribeCollection = null;
    if (!enabled || !this.host.supportsCollection?.()) {
      this.collection = [];
      await this.engine.setCollection?.([]);
      return;
    }
    this.collection = await this.host.getCollection();
    await this.engine.setCollection?.(this.collection);
    this.unsubscribeCollection =
      this.host.subscribeCollection?.((ids) => {
        this.collection = ids;
        void this.engine.setCollection?.(this.collection);
      }) || null;
  }

  /**
   * Abort any in-flight load, tear down the engine, collection subscription, and host.
   *
   * @returns {Promise<void>} Resolves once teardown completes.
   */
  async destroy() {
    this.requestGeneration += 1;
    this.abortController?.abort(abortError("Application destroyed"));
    await this.engine.destroy();
    this.unsubscribeCollection?.();
    this.unsubscribeCollection = null;
    await this.host.destroy();
  }
}

/** Normalize a value into a de-duplicated array of positive integer IDs. */
function normalizeIds(values) {
  const seen = new Set();
  return (Array.isArray(values) ? values : values == null ? [] : [values])
    .map(Number)
    .filter(
      (id) => Number.isInteger(id) && id > 0 && !seen.has(id) && seen.add(id),
    );
}

/** Build an ad-hoc query-type DataSource for a raw query and optional title. */
function adHocDataSource(query, title = null) {
  return {
    reference: { type: "query", id: null },
    title: text(title),
    request: { q: cloneValue(query) ?? query },
    presentation: {},
  };
}

/** Deep-clone a JSON-safe object value, passing scalars through unchanged. */
function cloneValue(value) {
  if (value == null || typeof value !== "object") return value ?? null;
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

/** Trim a value to text, returning `''` for `null`/`undefined`. */
function text(value) {
  return value == null ? "" : String(value).trim();
}

/** Build an `AbortError`-named Error, for cancellation paths that mimic `AbortController` semantics. */
function abortError(message) {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

/** Build the engine's initial page options from a persisted pagination offset. */
function initialPageOptions(pagination) {
  const offset = Math.max(0, Number(pagination?.offset) || 0);
  return offset ? { offset } : {};
}
