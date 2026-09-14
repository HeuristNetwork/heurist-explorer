/**
 * @file DataApplication.js
 * @brief Heurist Data application controller.
 * @project     Heurist academic knowledge management system
 * @package     heurist-data
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import {
  normalizeDataConfigurationSettings,
  serializeDataConfigurationSettings,
} from "../ui/config/dataConfigurationSchema.js";

/** Coordinates host integration, data loading, engine rendering, and state. */
export class DataApplication extends EventTarget {
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
    this.dataset = null;
    this.query = null;
    this.response = null;
    this.selection = [];
    this.abortController = null;
    this.requestGeneration = 0;
    this.source = null;
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
    if (this.config.source.datasetId) {
      await this.setDataset(
        this.config.source.datasetId,
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
        dataset: null,
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
      onPickFields: () => this.requestPickFields(),
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

  /** Load and activate a persisted Dataset by ID. */
  async setDataset(datasetId, options = {}) {
    this.dataSource = cloneValue(options.dataSource);
    this.sourceTitle = text(options.title ?? this.dataSource?.title);
    this._resetSource({ type: "dataset", datasetId, options });
    const result = await this._load("dataset", {
      limit: this.config.engineOptions?.pageLength,
      datasetId,
      ...options,
    });
    this.dataset = result.dataset;
    this.query = result.dataset.source.query;
    return this._applyResult(result);
  }

  /** Restore the most recently remembered Filtered Result source. */
  async activateCurrentResults() {
    if (!this.currentResultsSource?.query) return this.clearData();
    return this.setQuery(this.currentResultsSource.query, {
      fields: this.currentResultsSource.fields,
      activateCurrentResults: true,
      rememberCurrentResults: false,
    });
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
    // a Dataset which the user deliberately selected.
    if (
      this.source?.type === "dataset" &&
      options.activateCurrentResults !== true
    ) {
      return this.getState();
    }
    this._resetSource({ type: "query", query, options });
    const result = await this._load("query", {
      limit: this.config.engineOptions?.pageLength,
      query,
      ...options,
    });
    this.dataset = result.dataset;
    this.query = query;
    return this._applyResult(result);
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

  async _load(type, request) {
    const generation = ++this.requestGeneration;
    this.abortController?.abort("Superseded data request");
    this.abortController = new AbortController();
    const controller = this.abortController;
    this.dispatch("heurist-data-loading", { type, request });
    try {
      const result = await this.loaders.load(type, {
        ...request,
        includeDatasetFields: this.config.engine !== "recordlist",
        // IMPORTANT: presentation-only virtual fields are fetched but are not
        // inserted into the user's persisted Dataset fieldset.
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

  _presentationFields() {
    return [
      "rec_OwnerName",
      "rec_ThumbnailURL",
      "rec_Bookmarked",
      "rec_NonOwnerVisibility",
    ];
  }

  async _applyResult(result) {
    this.response = result.response;
    this.recordsTotal = Number(result.response.pagination?.total) || 0;
    await this.engine.setData({
      dataset: result.dataset,
      records: result.response.records || [],
      meta: result.response.meta || {},
      pagination: result.response.pagination || {},
    });
    this.dispatch("heurist-data-loaded", {
      dataset: result.dataset.toJSON(),
      dataSource: cloneValue(this.dataSource),
      title: this.sourceTitle,
      pagination: result.response.pagination || {},
    });
    await this._syncDataSourceActions();
    return this.getState();
  }

  _resetSource(source) {
    this.source = source;
    this.recordsTotal = null;
    this.dispatch("heurist-data-source-changed", {
      source: source.type,
      pending: true,
    });
  }

  async _loadPage({ offset, limit, sort, filter } = {}) {
    if (!this.source) throw new Error("No Dataset source is active");
    const request = {
      ...this.source.options,
      offset,
      limit,
      sort,
      filter,
    };
    if (this.source.type === "dataset")
      request.datasetId = this.source.datasetId;
    else request.query = this.source.query;
    const result = await this._load(this.source.type, request);
    const filteredTotal = Number(result.response.pagination?.total) || 0;
    if (filter == null || filter === "") this.recordsTotal = filteredTotal;
    this.response = result.response;
    return {
      dataset: result.dataset,
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
    this.abortController?.abort("Data cleared");
    this.dataset = null;
    this.query = null;
    this.source = null;
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
      dataset: null,
      records: [],
      meta: {},
      pagination: this.response.pagination,
    });
    this.dispatch("heurist-data-loaded", {
      dataset: null,
      dataSource: null,
      title: null,
      pagination: this.response.pagination,
    });
    await this._syncDataSourceActions();
    return this.getState();
  }

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
            this.dataset?.fields || this.currentResultsSource?.fields || [],
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
      datasetId: this.dataset?.id ?? null,
      query: this.query,
      dataSource: cloneValue(this.dataSource),
      title: this.sourceTitle || null,
      sourceType: this.source?.type ?? null,
      selection: [...this.selection],
      pagination: engineState.pagination || this.response?.pagination || null,
      ...(engineState.viewMode ? { viewMode: engineState.viewMode } : {}),
    };
  }

  getCapabilities() {
    return this.host.getCapabilities?.() || {};
  }

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

  _dataSourceWithPresentation() {
    const source = cloneValue(this.dataSource);
    if (!source) return null;
    source.presentation ||= {};
    source.presentation.data = {
      ...(source.presentation.data || {}),
      fields: [
        ...(this.dataset?.fields || this.currentResultsSource?.fields || []),
      ],
    };
    return source;
  }

  async _syncDataSourceActions() {
    const enabled = this._isExplorerMain() && Boolean(this.dataSource);
    const inWorkspace = enabled
      ? await Promise.resolve(
          this.host.isDataSourceInWorkspace?.(this.dataSource),
        ).catch(() => false)
      : false;
    await this.engine.setDataSourceActions?.({ enabled, inWorkspace });
  }

  async requestCreateDataset() {
    if (
      this.host.supportsEditing?.() &&
      typeof this.host.addRecord === "function"
    ) {
      const result = await this.providers.datasetList?.list({ ids: [] });
      const recordTypeId = Number(result?.recordTypeId);
      if (!(recordTypeId > 0))
        throw new Error("Dataset record type is not available");
      const created = await this.host.addRecord(recordTypeId);
      const recordId = Number(
        created?.recordId ?? created?.rec_ID ?? created?.id,
      );
      if (recordId > 0) {
        const settings = this.config.persistedSettings;
        const datasets = settings?.options?.datasets;
        if (datasets?.allowAll === false) {
          const allowed = Array.isArray(datasets.allowed)
            ? datasets.allowed
            : [];
          datasets.allowed = allowed;
          if (allowed.map(Number).includes(recordId)) {
            await this.setDataset(recordId);
            return created ?? null;
          }
          allowed.push(recordId);
          if (typeof this.host.savePreferences === "function") {
            await this.host.savePreferences(
              serializeDataConfigurationSettings(settings),
            );
          }
          this.dispatch("heurist-data-configuration-changed", {
            options: settings.options,
            config: settings.config,
          });
        }
        await this.setDataset(recordId);
      }
      return created ?? null;
    }
    this.dispatch("heurist-data-create-dataset-requested", {});
    return null;
  }

  async requestPickFields() {
    if (typeof this.host.editFieldset === "function") {
      const result = await this.host.editFieldset({
        dataset: this.dataset?.toJSON?.() || null,
      });
      if (this.dataset?.id == null) {
        const fields = Array.isArray(result)
          ? result
          : (result?.fields ?? result?.value?.fields);
        if (Array.isArray(fields)) {
          this.currentResultsSource = {
            ...(this.currentResultsSource || {}),
            query: this.query,
            fields,
          };
          if (this.query)
            await this.setQuery(this.query, {
              fields,
              activateCurrentResults: true,
              rememberCurrentResults: true,
            });
        }
      }
      return result;
    }
    this.dispatch("heurist-data-pick-fields-requested", {
      dataset: this.dataset?.toJSON?.() || null,
    });
    return null;
  }

  async activateFilter(filter) {
    const { createFilterSearchRequest } = await import(
      "../data/FilterSearchRequest.js"
    );
    const request = createFilterSearchRequest(filter, {
      searchRealm: this.config.searchRealm,
      source: this.config.sourceId || this.container?.id || null,
    });
    if (
      request.q == null ||
      (typeof request.q === "string" && !request.q.trim())
    ) {
      return this.getState();
    }
    this.dataset = null;
    this.source = null;
    this.dispatch("heurist-data-source-changed", {
      source: "current-results",
      pending: true,
    });
    if (this.host.supportsSearch?.()) {
      await this.host.doSearch(request);
      return this.getState();
    }
    const searchProvider = this.providers.recordSearch;
    const countProvider = this.providers.recordDataProvider;
    if (!searchProvider && typeof countProvider?.count !== "function")
      throw new Error("Standalone record search is unavailable");
    const result = searchProvider
      ? await searchProvider.search(request)
      : await countProvider.count({
          query: request.q,
          filter: request.filter,
          signal: request.signal,
        });
    return this.setQuery(
      result.query ?? (result.ids ? { ids: result.ids } : request.q),
      {
        activateCurrentResults: true,
        rememberCurrentResults: true,
      },
    );
  }

  resize() {
    return this.engine.resize();
  }

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
      showColumnPicker: normalized.options.ui.showColumnPicker,
    };
  }

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
      dataset: this.dataset,
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

  dispatch(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail }));
  }

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

  async destroy() {
    this.requestGeneration += 1;
    this.abortController?.abort("Application destroyed");
    await this.engine.destroy();
    this.unsubscribeCollection?.();
    this.unsubscribeCollection = null;
    await this.host.destroy();
  }
}

function normalizeIds(values) {
  const seen = new Set();
  return (Array.isArray(values) ? values : values == null ? [] : [values])
    .map(Number)
    .filter(
      (id) => Number.isInteger(id) && id > 0 && !seen.has(id) && seen.add(id),
    );
}

function adHocDataSource(query, title = null) {
  return {
    reference: { type: "query", id: null },
    title: text(title),
    request: { q: cloneValue(query) ?? query },
    presentation: {},
  };
}

function cloneValue(value) {
  if (value == null || typeof value !== "object") return value ?? null;
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function text(value) {
  return value == null ? "" : String(value).trim();
}

function abortError(message) {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

function initialPageOptions(pagination) {
  const offset = Math.max(0, Number(pagination?.offset) || 0);
  return offset ? { offset } : {};
}
