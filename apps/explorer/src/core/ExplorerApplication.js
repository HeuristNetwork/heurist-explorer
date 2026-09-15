/**
 * @file ExplorerApplication.js
 * @brief Explorer's top-level application controller: modules, layout, datasource, and synchronization.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-explorer
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { HFilter } from '../widgets/filter/HFilter.js';
import { HeuristApiClient } from '#shared/api';
import { HostAdapter } from '#shared/host';
import { HMsg, $HR } from '#shared/ui';
import { LayoutManager } from './LayoutManager.js';
import { cloneDataSource, dataSourceKey, dataSourceRole, normalizeDataSource } from './DataSource.js';
import { DataSourceFavorites } from './DataSourceFavorites.js';
import { DataSourceHistory } from './DataSourceHistory.js';
import { ExplorerWorkspace } from './ExplorerWorkspace.js';
import { SavedFilterManager } from './SavedFilterManager.js';
import { RecordTypeManager } from './RecordTypeManager.js';
import { QuerySourceManager } from './QuerySourceManager.js';
import { SyncEngine } from './SyncEngine.js';
import { IframeModuleAdapter } from '../modules/IframeModuleAdapter.js';
import { DirectModuleAdapter } from '../modules/DirectModuleAdapter.js';
import { ExplorerControlPanel } from '../ui/ExplorerControlPanel.js';
import { HDbDefs } from '../utils/HDbDefs.js';
import queryVocabulary from '../utils/queryVocabulary.json';
import { HFilterBuilder } from '../widgets/filter-builder/HFilterBuilder.js';
import { queryDescribe } from '../utils/queryDescribe.js';
import { parseTextQuery } from '../utils/parseTextQuery.js';
import { queryToArray } from '../utils/queryModel.js';
import './ExplorerApplication.css';

/** Explorer's top-level application controller: modules, layout, datasource, and synchronization. */
export class ExplorerApplication {
  /**
   * @param {object} options Application configuration.
   * @param {HTMLElement} options.container Root element Explorer renders into.
   * @param {object} options.config Normalized Explorer configuration; see `explorerConfig.js`.
   */
  constructor({ container, config }) {
    this.container = container;
    this.config = config;
    this.history = new DataSourceHistory({ database: config.database });
    this.workspace = new ExplorerWorkspace({
      database: config.database,
      resolver: (reference) => this.resolveDataSourceReference(reference)
    });
    this.favorites = new DataSourceFavorites({
      database: config.database,
      resolver: (reference) => this.resolveDataSourceReference(reference)
    });
    this.modules = new Map();
    this.sync = new SyncEngine({
      onDataSourceRequest: (source, options) => this.activateDataSource(source, options)
    });
    this.layout = null;
    this.filter = null;
    this.controlPanel = null;
    this.savedFilters = null;
    this.recordTypes = null;
    this.querySources = null;
    this._moduleCounter = 0;
    this.layoutDefinitions = [];
    // Each embedded module (map, timeline, ...) owns its own persisted user
    // preference (`heurist-<type>`), separate from the Explorer layout config
    // in this.config.settings. IframeModuleAdapter's bridge only supplies
    // whatever is passed as definition.settings at creation time, so without
    // this the module boots from bare defaults instead of the user's saved
    // preference, even though the module's own preferences dialog loads that
    // same preference correctly (it fetches it live, on demand).
    // need to recreate this.modulePreferences from the config.settings.modules array, but for now just start with an empty object.
    this.modulePreferences = {};
  }

  /**
   * Build the workspace DOM, load Explorer's supporting data (filters, record types, query
   * sources), mount the control panel, apply the initial layout, and restore bootstrap state.
   *
   * @returns {Promise<ExplorerApplication>} This instance, once initialization completes.
   */
  async initialize() {
    this.container.classList.add('h-explorer');
    const workspace = document.createElement('div');
    workspace.className = 'h-explorer-workspace';
    this.container.replaceChildren(workspace);
    this.workspaceElement = workspace;

    this.filterHost = document.createElement('div');
    this.filterHost.className = 'h-explorer-filter';

    const apiClient = new HeuristApiClient({
      apiBaseUrl: this.config.apiBaseUrl,
      database: this.config.database,
      accessToken: this.config.accessToken,
      headers: this.config.requestHeaders
    });
    this.apiClient = apiClient;
    this.savedFilters = new SavedFilterManager({ apiClient });
    this.recordTypes = new RecordTypeManager({
      apiClient,
      dbDefsProvider: () => this._ensureDbDefs(),
      baseUrl: this.config.baseUrl,
      database: this.config.database
    });
    this.querySources = new QuerySourceManager({
      apiClient,
      dbDefsProvider: () => this._ensureDbDefs()
    });
    this.filter = new HFilter({ apiClient });
    this.filter.attach(this.filterHost, {
      onFilterBuilder: ({ widget, query }) => this._openFilterBuilder(widget, query),
      editSavedFilter: (svsID, squery) => this.editSavedFilter(svsID, squery),
      // Sentence readout below the query box (plan §8 / D6). The full
      // HFilterInlineHelper (token-hint dropdown) is disabled for now -
      // this is the minimal describe-on-idle/blur path it will grow back into.
      describeQuery: (text) => this._describeQueryText(text)
    });
    // Search/filter actions close the ephemeral flyout immediately. Execution
    // continues independently; HMsg reports validation/application errors.
    this.filterHost.addEventListener('searchstart', () => this.controlPanel?.closeToolPanel());
    await this.filter.render();
    this.sync.register(this.filter);
    try {
      await this.savedFilters.load();
    } catch (error) {
      if (error?.name !== 'AbortError') HMsg.showMsgErr(error?.message || String(error));
    }
    try {
      await this.recordTypes.load();
    } catch (error) {
      if (error?.name !== 'AbortError') HMsg.showMsgErr(error?.message || String(error));
    }
    try {
      await this.querySources.load();
    } catch (error) {
      if (error?.name !== 'AbortError') HMsg.showMsgErr(error?.message || String(error));
    }

    this.layout = new LayoutManager(workspace).bindModules(this.modules);
    this.controlPanel = new ExplorerControlPanel({
      application: this,
      initiallyCollapsed: this.config.settings?.controlPanel?.initiallyCollapsed === true
    });
    await this.controlPanel.mount(this.container);
    await this.applyLayout(this.config.settings.layout || defaultLayout());
    if (this.config.state.dataSource) await this.activateDataSource(this.config.state.dataSource);
    if (this.config.state.selection) await this.sync.setSelection(this.config.state.selection);
    return this;
  }

  /**
   * Apply a new module layout: create newly-listed modules, and destroy modules no longer present.
   *
   * @param {Array<object>|{modules: Array<object>}} layout Layout definition; see `normalizeLayout`.
   * @returns {Promise<ExplorerApplication>} This instance, for chaining.
   */
  async applyLayout(layout) {
    const moduleDefs = normalizeLayout(layout);
    this.layoutDefinitions = moduleDefs.map((item) => ({ ...item }));
    this.layout.setLayout(moduleDefs);
    const active = new Set(moduleDefs.map((item) => item.id));
    for (const [id, module] of this.modules) {
      if (!active.has(id)) {
        this.sync.unregister(id);
        await module.destroy();
        this.modules.delete(id);
        this.layout.removeSlot(id);
      }
    }

    for (const definition of moduleDefs) {
      if (!this.modules.has(definition.id)) await this._createModule(definition);
    }
    this.controlPanel?.refreshActiveTool?.();
    return this;
  }

  /**
   * Create, mount, and register one presentation-module adapter from a layout definition.
   *
   * @private
   * @param {object} definition Layout definition for one module.
   * @returns {Promise<import('./ExplorerModule.js').ExplorerModule>} The mounted, registered module.
   * @throws {Error} When `direct` mode is requested for a module type other than `data`.
   */
  async _createModule(definition) {
    const slot = this.layout.createSlot(definition.id, definition.type);
    const mode = definition.mode || this.config.moduleModes?.[definition.type] || 'iframe';
    if (mode === 'direct' && definition.type !== 'data') {
      throw new Error(`Direct mode is not implemented for ${definition.type}`);
    }
    const Adapter = mode === 'direct' ? DirectModuleAdapter : IframeModuleAdapter;
    const module = new Adapter({
      id: definition.id,
      type: definition.type,
      container: slot,
      url: definition.url || this.config.moduleUrls[definition.type],
      ...(mode === 'direct' ? {
        mountModule: mountDirectData,
        assetBaseUrl: this.config.moduleAssetUrls?.data
      } : {}),
      runtime: {
        database: this.config.database,
        apiBaseUrl: this.config.apiBaseUrl,
        baseUrl: this.config.baseUrl,
        accessToken: this.config.accessToken,
        requestHeaders: this.config.requestHeaders,
        language: this.config.language
      },
      settings: { ...(this.modulePreferences[definition.type] || {}), ...(definition.settings || {}) },
      state: definition.state || null,
      context: definition.context || null,
      hostActions: this._hostActions(),
      onSettingsChange: (settings) => { this.modulePreferences[definition.type] = settings; }
    });
    this.modules.set(definition.id, module);
    await module.mount();
    this.sync.register(module);

    // New presentation followers join the currently active datasource. Data
    // modules keep independent sources and are assigned explicitly by
    // activateDataSource().
    if (this.sync.dataSource && module.type !== 'data') {
      await module.setDataSource(this.sync.dataSource, { origin: 'sync' });
    }
    if (this.sync.selection.length) await module.setSelection(this.sync.selection, { origin: 'sync' });
    if (module.type === 'map') await this._syncWorkspaceMap(module);
    return module;
  }

  /**
   * Create a new heurist-data module instance for a datasource, adding it to the layout.
   *
   * @private
   * @param {object} source Datasource the new data module should display.
   * @param {object|null} [context] Module context; `role` defaults from `dataSourceRole(source)`.
   * @returns {Promise<import('./ExplorerModule.js').ExplorerModule>} The created data module.
   */
  async _createDataModule(source, context = null) {
    const role = context?.role || dataSourceRole(source);
    const id = this._nextDataModuleId(source, role);
    const definition = {
      id,
      type: 'data',
      title: source?.title || (role === 'current' ? 'Current result' : 'Data'),
      context: { ...(context || {}), role },
      settings: { title: source?.title || undefined }
    };
    this.layout.addDefinition(definition);
    return this._createModule(definition);
  }

  /**
   * Derive a unique data-module id for a new datasource/role pairing.
   *
   * @private
   * @param {object} source Datasource the module will display.
   * @param {'current'|'saved'|'other'} role Data-module role; see `dataSourceRole`.
   * @returns {string} A unique, unused module id.
   */
  _nextDataModuleId(source, role) {
    if (role === 'current' && !this.modules.has('data')) return 'data';
    const reference = source?.reference;
    const stem = reference?.type === 'filter' && reference?.id ? `data-filter-${reference.id}`
      : reference?.type === 'source' && reference?.id ? `data-source-${reference.id}`
        : role === 'pinned' ? 'data-pinned' : 'data-view';
    let id = stem;
    while (this.modules.has(id)) id = `${stem}-${++this._moduleCounter}`;
    return id;
  }

  /**
   * Applies a DataSource to the single reusable Explorer data module and all
   * presentation followers. Query, Filter and Dataset sources replace the
   * contents of this one data view; they do not create additional data panes.
   *
   * @param {object} source DataSource emitted by HFilter or a presentation.
   * @param {object} [syncOptions] Options forwarded to `SyncEngine#setDataSource`.
   * @returns {Promise<object|null>} Reusable data module.
   */
  async activateDataSource(source, syncOptions = {}) {
    if (!source) {
      return null;
    }

    const dataSource = await this._withResultCount(normalizeDataSource(source));
    let dataModule = this.layout.findCurrentResultDataModule();

    if (!dataModule) {
      dataModule = await this._createDataModule(dataSource, { role: 'current' });
    }

    await this.sync.setDataSource(dataSource, {
      ...syncOptions,
      preserveDataViews: true,
      dataModuleId: dataModule.id
    });

    this.history.add(dataSource);
    this.controlPanel?.refreshNavigationLists?.();

    this.layout.activateModule(dataModule.id);
    this.controlPanel?.refreshActiveTool?.();
    return dataModule;
  }

  /**
   * Add or remove a persistent reference from Favorites.
   *
   * @param {object} reference Persistent reference (filter/recordtype/source).
   * @param {string|null} [title] Explicit title override when adding.
   * @returns {boolean} True when the reference is now favorited, false when it was just removed.
   */
  toggleFavorite(reference, title = null) {
    const removed = this.favorites.has(reference);
    if (removed) this.favorites.remove(reference);
    else this.favorites.add(reference, { title });
    this.controlPanel?.refreshNavigationLists?.();
    return !removed;
  }

  /**
   * Activate a datasource from a history entry.
   *
   * @param {{dataSource?: object}} entry History entry; see `DataSourceHistory#list`.
   * @returns {Promise<object|null>} Reusable data module, or `null` when the entry has no datasource.
   */
  async activateHistoryEntry(entry) {
    const dataSource = entry?.dataSource;
    return dataSource ? this.activateDataSource(dataSource) : null;
  }

  /**
   * Resolve and activate a datasource from a workspace entry.
   *
   * @param {object} entry Workspace entry; see `ExplorerWorkspace#list`.
   * @returns {Promise<object|null>} Reusable data module, or `null` when the entry can't be resolved.
   */
  async activateWorkspaceEntry(entry) {
    const dataSource = await this.workspace.resolve(entry);
    return dataSource ? this.activateDataSource(dataSource) : null;
  }

  /**
   * Add a datasource (or the currently active one) to the workspace.
   *
   * @param {object|null} [source] Datasource to add; defaults to `this.sync.dataSource`.
   * @param {object} [options] Options forwarded to `ExplorerWorkspace#add`.
   * @returns {object|null} The stored workspace entry, or `null` when there was nothing to add.
   */
  addDataSourceToWorkspace(source = null, options = {}) {
    const value = source || this.sync.dataSource;
    const entry = value ? this.workspace.add(value, options) : null;
    if (entry) {
      this.controlPanel?.refreshNavigationLists?.();
      void this._syncWorkspaceMap();
    }
    return entry;
  }

  /**
   * Remove a workspace entry.
   *
   * @param {object|string} sourceOrKey Datasource, entry, reference, or key string identifying the entry.
   * @returns {boolean} True when an entry was found and removed.
   */
  removeDataSourceFromWorkspace(sourceOrKey) {
    const removed = this.workspace.remove(sourceOrKey);
    if (removed) {
      this.controlPanel?.refreshNavigationLists?.();
      void this._syncWorkspaceMap();
    }
    return removed;
  }

  /**
   * Whether a datasource (or the currently active one) is in the workspace.
   *
   * @param {object|null} [source] Datasource to check; defaults to `this.sync.dataSource`.
   * @returns {boolean} True when the source is present in the workspace.
   */
  isDataSourceInWorkspace(source = null) {
    return this.workspace.has(source || this.sync.dataSource);
  }

  /**
   * Persist module-owned presentation state for a workspace entry.
   *
   * @param {object} source Datasource (carrying `.presentation`) identifying the entry to update.
   * @returns {object|null} The updated entry, or `null` when not found.
   */
  updateDataSourceInWorkspace(source) {
    const updated = this.workspace.update(source, source?.presentation);
    if (updated) {
      this.controlPanel?.refreshNavigationLists?.();
      void this._syncWorkspaceMap();
    }
    return updated;
  }

  /**
   * Resolve every workspace entry to an executable DataSource with a result count.
   *
   * @returns {Promise<Array<object>>} Resolved workspace datasources.
   */
  async getWorkspaceDataSources() {
    const values = await Promise.all(this.workspace.list().map((entry) => this.workspace.resolve(entry)));
    return Promise.all(values.filter(Boolean).map((source) => this._withResultCount(source)));
  }

  /**
   * Fetch and attach a result count to a datasource's metadata, when not already present.
   *
   * @private
   * @param {object} source Datasource to annotate.
   * @returns {Promise<object>} The datasource, with `meta.count` set when the count request succeeded.
   */
  async _withResultCount(source) {
    if (Number.isFinite(Number(source?.meta?.count))) return source;
    const request = source?.request || {};
    const query = { q: request.q, detail: 'count' };
    if (request.filter != null) query.filter = request.filter;
    if (request.sort != null) query.sort = request.sort;
    try {
      const payload = await this.apiClient.get('/records', { query });
      const count = Number(payload?.count ?? payload?.total ?? payload?.records_count
        ?? (typeof payload === 'number' ? payload : NaN));
      if (Number.isFinite(count) && count >= 0) {
        return normalizeDataSource({
          ...source,
          meta: { ...(source.meta || {}), count }
        });
      }
    } catch { /* count only selects the viewport-loading candidate */ }
    return source;
  }

  /**
   * Push the resolved workspace datasource list to the map module.
   *
   * @private
   * @param {import('./ExplorerModule.js').ExplorerModule|null} [module] Target map module; defaults to the first mounted map module.
   * @returns {Promise<boolean>} True when the map module accepted the update.
   */
  async _syncWorkspaceMap(module = null) {
    const target = module || [...this.modules.values()].find((item) => item.type === 'map');
    if (!target || typeof target.setWorkspaceDataSources !== 'function') return false;
    return target.setWorkspaceDataSources(await this.getWorkspaceDataSources());
  }

  /**
   * Resolve and activate an arbitrary datasource-like value requested by a presentation module.
   *
   * @param {object} source Datasource-like value; see `_resolveRequestedDataSource`.
   * @returns {Promise<object|null>} Reusable data module, or `null` when unresolved.
   */
  async showDatasource(source) {
    const dataSource = await this._resolveRequestedDataSource(source);
    return dataSource ? this.activateDataSource(dataSource) : null;
  }

  /**
   * Open the Saved Filter editor seeded with a datasource's (or the active) request.
   *
   * @param {object|null} [source] Datasource to save; defaults to `this.sync.dataSource`.
   * @returns {Promise<*>} Result of `editSavedFilter`.
   * @throws {Error} When there is no datasource to save.
   */
  async saveDatasourceAsFilter(source = null) {
    const dataSource = await this._resolveRequestedDataSource(source || this.sync.dataSource);
    if (!dataSource) throw new Error($HR('No data source to save'));
    return this.editSavedFilter(null, dataSource.request);
  }

  /**
   * Delegate to the host's source editor to save a datasource (or the active one) as an RT_QUERY_SOURCE record.
   *
   * @param {object|null} [source] Datasource to save; defaults to `this.sync.dataSource`.
   * @param {object} [options] Options forwarded to the host's `saveDatasourceAsSource`.
   * @returns {Promise<*>} Result of the host action.
   * @throws {Error} When there is no datasource to save, or the host doesn't support source editing.
   */
  async saveDatasourceAsSource(source = null, options = {}) {
    const dataSource = await this._resolveRequestedDataSource(source || this.sync.dataSource);
    if (!dataSource) throw new Error($HR('No data source to save'));
    const action = this.config.hostBridge?.saveDatasourceAsSource;
    if (typeof action !== 'function') {
      throw new Error($HR('Source editor is not available'));
    }
    return action(dataSource, options);
  }

  /**
   * Normalize an arbitrary datasource-like, workspace-entry-like, or reference-like value
   * requested by a presentation module into an executable DataSource.
   *
   * @private
   * @param {*} value Value to resolve.
   * @returns {Promise<object|null>} Resolved DataSource, or `null` when `value` is empty or unresolvable.
   */
  async _resolveRequestedDataSource(value) {
    if (!value) return null;
    if (value?.dataSource) return normalizeDataSource(value.dataSource);
    try {
      const normalized = normalizeDataSource(value);
      if (normalized.reference.type === 'source' && normalized.presentation?.data == null) {
        const resolved = await this.resolveDataSourceReference(normalized.reference);
        if (resolved) return normalizeDataSource({
          ...resolved,
          title: normalized.title || resolved.title,
          presentation: {
            ...(resolved.presentation || {}),
            map: { ...(resolved.presentation?.map || {}), ...(normalized.presentation?.map || {}) }
          }
        });
      }
      return normalized;
    } catch {
      const workspaceEntry = this.workspace.get(value);
      if (workspaceEntry) return this.workspace.resolve(workspaceEntry);
      const reference = value?.reference ?? value;
      return this.resolveDataSourceReference(reference);
    }
  }

  /**
   * Resolve and activate a favorite entry.
   *
   * @param {object} entry Favorite entry; see `DataSourceFavorites#list`.
   * @returns {Promise<object|null>} Reusable data module, or `null` when unresolved.
   */
  async activateFavorite(entry) {
    const dataSource = await this.favorites.resolve(entry);
    return dataSource ? this.activateDataSource(dataSource) : null;
  }

  /**
   * Resolve and activate a saved filter by id.
   *
   * @param {number|string} id Saved filter record id.
   * @returns {Promise<object|null>} Reusable data module, or `null` when unresolved.
   */
  async activateSavedFilter(id) {
    const dataSource = await this.savedFilters.resolveDataSource(id, { origin: 'filter' });
    return dataSource ? this.activateDataSource(dataSource) : null;
  }

  /**
   * List loaded record types.
   *
   * @param {object} [options] Options forwarded to `RecordTypeManager#list`.
   * @returns {Array<object>} Record types, or `[]` when not yet loaded.
   */
  getRecordTypes(options = {}) {
    return this.recordTypes?.list?.(options) || [];
  }

  /**
   * Build a DataSource that queries all records of a record type.
   *
   * @param {number|string} id Record type id.
   * @param {object} [options] Options forwarded to `RecordTypeManager#resolveDataSource`.
   * @returns {object|null} Resolved DataSource, or `null` when the record type is unknown.
   */
  dataSourceFromRecordType(id, options = {}) {
    return this.recordTypes?.resolveDataSource?.(id, options) || null;
  }

  /**
   * Activate the "all records of this type" datasource for a record type.
   *
   * @param {number|string} id Record type id.
   * @returns {Promise<object|null>} Reusable data module, or `null` when the record type is unknown.
   */
  async activateRecordType(id) {
    const dataSource = this.dataSourceFromRecordType(id, { origin: 'recordtype' });
    return dataSource ? this.activateDataSource(dataSource) : null;
  }

  /**
   * List loaded RT_QUERY_SOURCE sources.
   *
   * @param {object} [options] Options forwarded to `QuerySourceManager#list`.
   * @returns {Array<object>} Sources, or `[]` when not yet loaded.
   */
  getQuerySources(options = {}) {
    return this.querySources?.list?.(options) || [];
  }

  /**
   * Resolve and activate a query source by id.
   *
   * @param {number|string} id Source record id.
   * @returns {Promise<object|null>} Reusable data module, or `null` when unresolved.
   */
  async activateQuerySource(id) {
    const dataSource = await this.querySources?.resolveDataSource?.(id, { origin: 'source' });
    return dataSource ? this.activateDataSource(dataSource) : null;
  }

  /**
   * Resolve a persistent reference (filter/recordtype/source) to its current executable DataSource.
   *
   * @param {{type?: string, id?: number, key?: string}} reference Persistent reference to resolve.
   * @returns {Promise<object|null>} Resolved DataSource, or `null` when it cannot be resolved.
   */
  async resolveDataSourceReference(reference) {
    if (reference?.type === 'filter') {
      return this.savedFilters.resolveDataSource(reference.id, { origin: 'favorite' });
    }

    if (reference?.type === 'recordtype') {
      return this.recordTypes.resolveDataSource(reference.id, { origin: 'favorite' });
    }

    if (reference?.type === 'source') {
      return this.querySources.resolveDataSource(reference.id, { origin: 'source' });
    }

    if (dataSourceKey(this.sync.dataSource) === reference?.key) {
      return cloneDataSource(this.sync.dataSource);
    }

    const resolved = await this.config.hostBridge?.resolveDataSource?.(reference);
    return resolved ? normalizeDataSource(resolved) : null;
  }

  /**
   * Delegate to the host's Saved Filter editor, refreshing local state when it saves.
   *
   * @param {number|string|null} svsID Existing saved-filter id, or `null` to create one.
   * @param {*} [squery] Seed query/definition for the editor.
   * @returns {Promise<object|null>} Editor result, or `null` when the host returned nothing.
   * @throws {Error} When the host doesn't support editing saved filters.
   */
  async editSavedFilter(svsID, squery = null) {
    const bridge = this.config.hostBridge;
    if (!bridge || typeof bridge.editSavedFilter !== 'function') {
      throw new Error($HR('Saved Filter editor is not available'));
    }
    const result = await bridge.editSavedFilter(svsID, squery);
    if (result?.saved) {
      await this.savedFilters.load();
      this._savedFilterSaved(result);
      this.controlPanel?.refreshNavigationLists?.();
    }
    return result || null;
  }

  /**
   * Auto-favorite a newly-saved filter that was already favorited under a placeholder reference.
   *
   * @private
   * @param {{id?: number, request?: {svs_Name?: string}}} result Saved-filter editor result.
   * @returns {void}
   */
  _savedFilterSaved(result) {
    const id = Number(result?.id);
    const title = result?.request?.svs_Name;
    const reference = { type: 'filter', id };
    if (Number.isInteger(id) && id > 0 && title && this.favorites.has(reference)) {
      this.favorites.add(reference, { title });
      this.controlPanel?.refreshNavigationLists?.();
    }
  }

  /**
   * Toggles a presentation module in its default cardinal region.
   * Map and Graph share the center and behave as a radio pair.
   *
   * @param {'data'|'map'|'graph'|'timeline'|'recordview'} type Module type.
   * @returns {Promise<boolean>} New visible state.
   */
  async togglePresentation(type) {
    if (type === 'recordview') return false;

    if (this.layout?.isToolMode()) {
      const wasVisible = this.layout.isPresentationVisible(type);
      this.layout.exitToolMode();
      this.controlPanel?.clearToolSelection?.();

      if (wasVisible) {
        this.controlPanel?.refreshPresentationState?.();
        return true;
      }
    }

    const regionByType = {
      data: 'west',
      map: 'center',
      graph: 'center',
      timeline: 'south'
    };
    const region = regionByType[type];
    if (!region) return false;

    let module = [...this.modules.values()].find((item) => item.type === type);

    if (!module) {
      const definition = { id: type, type, region };
      this.layoutDefinitions.push(definition);
      this.layout.addDefinition(definition);
      module = await this._createModule(definition);
      this.controlPanel?.refreshPresentationState?.();
      return Boolean(module);
    }

    const currentId = this.layout.getModuleForRegion(region);
    const cardinalState = this.layout.cardinal.getState();
    const isVisible = cardinalState[region]?.visible && currentId === module.id;

    if (isVisible) {
      this.layout.hideModule(module.id);
      this.controlPanel?.refreshPresentationState?.();
      return false;
    }

    this.layout.assignModule(module.id, region);
    this.layout.showModule(module.id);
    await module.resize();
    this.controlPanel?.refreshPresentationState?.();
    return true;
  }

  /**
   * Opens or closes Explorer Tools mode.
   *
   * Tools mode temporarily presents Data | Tool and preserves the complete
   * presentation layout so it can be restored without changing presentation
   * toggle state.
   *
   * @param {string} type Tool id.
   * @returns {boolean} True while Tools mode is active.
   */
  openTool(type) {
    if (this.layout?.isToolMode(type)) {
      this.layout.exitToolMode();
      this.controlPanel?.refreshPresentationState?.();
      return false;
    }

    const panel = this._createToolPlaceholder(type);
    this.layout?.enterToolMode(type, panel, {
      onClose: () => {
        this.layout?.exitToolMode();
        this.controlPanel?.clearToolSelection?.();
      }
    });
    return true;
  }

  /**
   * Build the placeholder panel shown for a not-yet-implemented tool.
   *
   * @private
   * @param {string} type Tool id.
   * @returns {HTMLElement} The placeholder panel element.
   */
  _createToolPlaceholder(type) {
    const panel = document.createElement('div');
    panel.className = 'h-explorer-tool-workspace';

    const header = document.createElement('div');
    header.className = 'h-toolbar h-explorer-tool-workspace-header';

    const title = document.createElement('strong');
    title.textContent = toolTitle(type);

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'h-btn';
    close.textContent = 'Back to presentation';
    close.addEventListener('click', () => {
      this.layout?.exitToolMode();
      this.controlPanel?.clearToolSelection?.();
    });

    const body = document.createElement('div');
    body.className = 'h-explorer-tool-workspace-body';
    body.textContent = `${toolTitle(type)} is not implemented yet.`;

    header.append(title, close);
    panel.append(header, body);
    return panel;
  }

  /**
   * Build the host action callbacks exposed to mounted presentation modules.
   *
   * @private
   * @returns {object} Host actions bound to this application and its configured host bridge.
   */
  _hostActions() {
    const bridge = this.config.hostBridge || {};
    return {
      editRecord: (id) => bridge.editRecord?.(id),
      viewRecord: (id) => bridge.viewRecord?.(id),
      addRecord: (rt) => bridge.addRecord?.(rt),
      editSymbology: (value, options) => bridge.editSymbology?.(value, options),
      editExtent: (value, options) => bridge.editExtent?.(value, options),
      editRules: (value, options) => bridge.editRules?.(value, options),
      describeRules: (rules) => bridge.describeRules?.(rules),
      selectFieldset: (value, options) => bridge.selectFieldset?.(value, options),
      getHostContext: () => ({ name: 'heurist-explorer', runtimeMode: 'main' }),
      addDataSourceToWorkspace: (source, options) => this.addDataSourceToWorkspace(source, options),
      removeDataSourceFromWorkspace: (sourceOrKey) => this.removeDataSourceFromWorkspace(sourceOrKey),
      isDataSourceInWorkspace: (source) => this.isDataSourceInWorkspace(source),
      updateDataSourceInWorkspace: (source) => this.updateDataSourceInWorkspace(source),
      getWorkspaceDataSources: () => this.getWorkspaceDataSources(),
      showDatasource: (source) => this.showDatasource(source),
      saveDatasourceAsFilter: (source) => this.saveDatasourceAsFilter(source),
      saveDatasourceAsSource: (source, options) => this.saveDatasourceAsSource(source, options)
    };
  }

  /**
   * Loads (once) and caches the database-definition snapshot used by the
   * Filter Builder.
   *
   * @private
   * @returns {Promise<HDbDefs>} The cached (or newly loaded) database-definition snapshot.
   */
  async _ensureDbDefs() {
    if (!this._dbDefsPromise) {
      const url = this.apiClient.buildUrl('/def/snapshot');
      this._dbDefsPromise = HDbDefs.load(url, { lang: this.config.language }).catch((error) => {
        this._dbDefsPromise = null;
        throw error;
      });
    }
    return this._dbDefsPromise;
  }

  /**
   * Describes a raw query-box string as a plain-language sentence for HFilter's
   * `h-fih-sentence` readout (plan §8 / D6). Accepts keyword syntax or pasted
   * JSON; returns '' when the text is empty or can't be parsed/described.
   *
   * @private
   * @param {string} text Raw query-box text.
   * @returns {Promise<string>} Description sentence, or `''` when it can't be produced.
   */
  async _describeQueryText(text) {
    const trimmed = String(text ?? '').trim();
    if (!trimmed) return '';
    let dbdefs;
    try {
      dbdefs = await this._ensureDbDefs();
    } catch {
      return '';
    }
    let arr = (trimmed[0] === '[' || trimmed[0] === '{') ? queryToArray(trimmed) : [];
    if (!arr.length) {
      const parsed = parseTextQuery(trimmed, { dbdefs });
      arr = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.q) ? parsed.q : []);
    }
    if (!arr.length) return '';
    try {
      return queryDescribe(arr, { dbdefs, vocabulary: queryVocabulary, lang: this.config.language }) || '';
    } catch {
      return '';
    }
  }

  /**
   * Public entry point for the Filter Builder from the command rail.
   *
   * @param {string|null} [query] Seed query; defaults to the current HFilter query value.
   * @returns {Promise<void>} Resolves once the builder dialog has been shown.
   */
  openFilterBuilder(query = null) {
    return this._openFilterBuilder(this.filter, query ?? this.filter?.getQueryValue?.() ?? '');
  }

  /**
   * Opens the visual Filter Builder in a modal dialog, seeded with the current
   * query. Replaces the legacy `hostBridge.openSearchBuilder()` round trip.
   *
   * @private
   * @param {import('../widgets/filter/HFilter.js').HFilter} widget Query widget to apply the composed query back to.
   * @param {string} query Current raw query string from the HFilter input.
   * @returns {Promise<void>}
   */
  async _openFilterBuilder(widget, query) {
    if (!widget) return;
    let dbdefs;
    try {
      dbdefs = await this._ensureDbDefs();
    } catch (error) {
      HMsg.showMsgFlash?.($HR('Unable to load database structure') + ': ' + (error?.message || error));
      return;
    }

    const host = document.createElement('div');
    const builder = new HFilterBuilder({
      dbdefs,
      vocabulary: queryVocabulary,
      lang: this.config.language
    });
    builder.attach(host).render();
    builder.setQuery(query || []);

    const apply = () => {
      const composed = builder.getQuery();
      HMsg.closeMsgDlg?.();
      widget.setQueryValue(composed.length ? JSON.stringify(composed) : '');
      widget.refreshSentence?.();
      if (composed.length) void widget.executeDirectQuery();
      void builder.destroy();
    };
    const cancel = () => { HMsg.closeMsgDlg?.(); void builder.destroy(); };

    // preventClose: a builder holds unsaved work - only Apply / Cancel dismiss it,
    // never a stray backdrop click or Escape (matches other deliberate modals).
    HMsg.showMsgDlg(host, {
      title: 'Filter builder',
      preventClose: true,
      buttons: [
        { label: 'Apply', class: 'h-btn h-btn-primary', onClick: apply },
        { label: 'Cancel', class: 'h-btn', onClick: cancel }
      ]
    });
  }

  /**
   * Activate a module's slot and briefly flash it, to draw the user's attention.
   *
   * @param {string} id Module id.
   * @returns {boolean} True when the module has a slot and was focused.
   */
  focusModule(id) {
    const slot = this.layout?.getSlot(id);
    if (!slot) return false;
    this.layout.activateModule(id);
    slot.classList.remove('h-explorer-slot-focus');
    void slot.offsetWidth;
    slot.classList.add('h-explorer-slot-focus');
    setTimeout(() => slot.classList.remove('h-explorer-slot-focus'), 900);
    return true;
  }

  /**
   * Set the active Explorer datasource.
   *
   * @param {object} source Datasource to activate.
   * @returns {Promise<object|null>} Reusable data module.
   */
  async setDataSource(source) { return this.activateDataSource(source); }

  /**
   * Set the shared record selection.
   *
   * @param {Array<number>} ids Selected record IDs.
   * @returns {Promise<Array<number>>} Updated selection.
   */
  async setSelection(ids) { return this.sync.setSelection(ids); }

  /**
   * Resize the layout and every mounted module.
   *
   * @returns {Promise<boolean>} Always `true`.
   */
  async resize() {
    this.layout?.resize();
    await Promise.all([...this.modules.values()].map((module) => module.resize()));
    return true;
  }

  /**
   * Return Explorer's current serialized state, including every mounted module's own state.
   *
   * @returns {Promise<object>} Current application state.
   */
  async getState() {
    return {
      dataSource: this.sync.dataSource,
      selection: [...this.sync.selection],
      activeModuleId: this.layout?.activeModuleId || null,
      layout: this.layout?.getState() || null,
      modules: Object.fromEntries(await Promise.all([...this.modules].map(async ([id, module]) => [id, await module.getState()])))
    };
  }

  /**
   * Tear down every module and Explorer's own owned resources.
   *
   * @returns {Promise<void>}
   */
  async destroy() {
    await Promise.all([...this.modules.values()].map((module) => module.destroy()));
    this.modules.clear();
    this.sync.destroy();
    this.layout?.destroy();
    this.inlineHelper?.destroy?.();
    this.filter?.destroy?.();
    this.savedFilters?.destroy?.();
    this.recordTypes?.destroy?.();
    this.querySources?.destroy?.();
    this.controlPanel?.destroy?.();
    this.filterHost?.remove?.();
    this.filterHost = null;
  }
}

/** Resolve a tool id to its display title. */
function toolTitle(type) {
  return {
    report: 'Report',
    crosstabs: 'Crosstabs / Charts',
    actions: 'Actions Dashboard',
    export: 'Export Dashboard'
  }[type] || 'Tool';
}

/** Load and mount heurist-data's direct (same-realm) bootstrap for `direct` module mode. */
async function mountDirectData(options) {
  const { mountHeuristData } = await import('../../../data/src/direct.js');
  return mountHeuristData(options);
}

/** Explorer's built-in default layout: Data west, Map center. */
function defaultLayout() {
  return [
    { id: 'data', type: 'data', region: 'west', context: { role: 'current' } },
    { id: 'map', type: 'map', region: 'center' }
  ];
}

/** Normalize a persisted or bootstrap layout value, guaranteeing Data and Map are present. */
function normalizeLayout(value) {
  const list = Array.isArray(value) ? value : value?.modules;
  const normalized = (Array.isArray(list) ? list : defaultLayout())
    .filter((item) => item && ['data', 'map', 'timeline', 'graph'].includes(item.type))
    .map((item, index) => ({
      ...item,
      id: String(item.id || `${item.type}-${index + 1}`),
      context: item.context || (item.type === 'data' && (item.id === 'data' || index === 0) ? { role: 'current' } : null)
    }));

  // Data and Map are Explorer's default long-lived presentation modules.
  // Older saved layout settings may predate the cardinal layout and omit one
  // or both; guarantee that they are present rather than leaving Explorer
  // with only an optional presentation such as Timeline.
  if (!normalized.some((item) => item.type === 'data')) {
    normalized.unshift({
      id: 'data',
      type: 'data',
      region: 'west',
      context: { role: 'current' }
    });
  }

  if (!normalized.some((item) => item.type === 'map')) {
    normalized.push({
      id: 'map',
      type: 'map',
      region: 'center'
    });
  }

  return normalized;
}
