
import { HFilter } from '../widgets/filter/HFilter.js';
import { HeuristApiClient } from '#shared/api';
import { HostAdapter } from '#shared/host';
import { HMsg, $HR, InlineHelp } from '#shared/ui';
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
import { ExplorerControlPanel } from '../ui/ExplorerControlPanel.js';
import { HDbDefs } from '../utils/HDbDefs.js';
import queryVocabulary from '../utils/queryVocabulary.json';
import { HFilterBuilder } from '../widgets/filter-builder/HFilterBuilder.js';
import { queryDescribe } from '../utils/queryDescribe.js';
import { parseTextQuery } from '../utils/parseTextQuery.js';
import { queryToArray } from '../utils/queryModel.js';
import './ExplorerApplication.css';

export class ExplorerApplication {
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

  async _createModule(definition) {
    const slot = this.layout.createSlot(definition.id, definition.type);
    const module = new IframeModuleAdapter({
      id: definition.id,
      type: definition.type,
      container: slot,
      url: definition.url || this.config.moduleUrls[definition.type],
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

  toggleFavorite(reference, title = null) {
    const removed = this.favorites.has(reference);
    if (removed) this.favorites.remove(reference);
    else this.favorites.add(reference, { title });
    this.controlPanel?.refreshNavigationLists?.();
    return !removed;
  }

  async activateHistoryEntry(entry) {
    const dataSource = entry?.dataSource;
    return dataSource ? this.activateDataSource(dataSource) : null;
  }

  async activateWorkspaceEntry(entry) {
    const dataSource = await this.workspace.resolve(entry);
    return dataSource ? this.activateDataSource(dataSource) : null;
  }

  addDataSourceToWorkspace(source = null, options = {}) {
    const value = source || this.sync.dataSource;
    const entry = value ? this.workspace.add(value, options) : null;
    if (entry) {
      this.controlPanel?.refreshNavigationLists?.();
      void this._syncWorkspaceMap();
    }
    return entry;
  }

  removeDataSourceFromWorkspace(sourceOrKey) {
    const removed = this.workspace.remove(sourceOrKey);
    if (removed) {
      this.controlPanel?.refreshNavigationLists?.();
      void this._syncWorkspaceMap();
    }
    return removed;
  }

  isDataSourceInWorkspace(source = null) {
    return this.workspace.has(source || this.sync.dataSource);
  }

  updateDataSourceInWorkspace(source) {
    const updated = this.workspace.update(source, source?.presentation);
    if (updated) {
      this.controlPanel?.refreshNavigationLists?.();
      void this._syncWorkspaceMap();
    }
    return updated;
  }

  async getWorkspaceDataSources() {
    const values = await Promise.all(this.workspace.list().map((entry) => this.workspace.resolve(entry)));
    return Promise.all(values.filter(Boolean).map((source) => this._withResultCount(source)));
  }

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

  async _syncWorkspaceMap(module = null) {
    const target = module || [...this.modules.values()].find((item) => item.type === 'map');
    if (!target || typeof target.setWorkspaceDataSources !== 'function') return false;
    return target.setWorkspaceDataSources(await this.getWorkspaceDataSources());
  }

  /**
   * Open a child module's own manual full-viewport, in Explorer's own page
   * rather than inside that module's (possibly narrow) layout panel. The
   * manual lives beside the requesting module's own bundle, so its own asset
   * base must be supplied - Explorer's own base would resolve to nothing.
   */
  openHelp({ moduleName, baseUrl } = {}) {
    if (!moduleName || !baseUrl) return false;
    this.helpOverlay?.close?.();
    this.helpOverlay = new InlineHelp({ moduleName, baseUrl });
    this.helpOverlay.open();
    return true;
  }

  async showDatasource(source) {
    const dataSource = await this._resolveRequestedDataSource(source);
    return dataSource ? this.activateDataSource(dataSource) : null;
  }

  async saveDatasourceAsFilter(source = null) {
    const dataSource = await this._resolveRequestedDataSource(source || this.sync.dataSource);
    if (!dataSource) throw new Error($HR('No data source to save'));
    return this.editSavedFilter(null, dataSource.request);
  }

  async saveDatasourceAsSource(source = null, options = {}) {
    const dataSource = await this._resolveRequestedDataSource(source || this.sync.dataSource);
    if (!dataSource) throw new Error($HR('No data source to save'));
    const action = this.config.hostBridge?.saveDatasourceAsSource;
    if (typeof action !== 'function') {
      throw new Error($HR('Source editor is not available'));
    }
    return action(dataSource, options);
  }

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

  async activateFavorite(entry) {
    const dataSource = await this.favorites.resolve(entry);
    return dataSource ? this.activateDataSource(dataSource) : null;
  }

  async activateSavedFilter(id) {
    const dataSource = await this.savedFilters.resolveDataSource(id, { origin: 'filter' });
    return dataSource ? this.activateDataSource(dataSource) : null;
  }

  getRecordTypes(options = {}) {
    return this.recordTypes?.list?.(options) || [];
  }

  dataSourceFromRecordType(id, options = {}) {
    return this.recordTypes?.resolveDataSource?.(id, options) || null;
  }

  async activateRecordType(id) {
    const dataSource = this.dataSourceFromRecordType(id, { origin: 'recordtype' });
    return dataSource ? this.activateDataSource(dataSource) : null;
  }

  getQuerySources(options = {}) {
    return this.querySources?.list?.(options) || [];
  }

  async activateQuerySource(id) {
    const dataSource = await this.querySources?.resolveDataSource?.(id, { origin: 'source' });
    return dataSource ? this.activateDataSource(dataSource) : null;
  }

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
      openHelp: (options) => this.openHelp(options),
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
   * @returns {Promise<HDbDefs>}
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
   * @param {string} text
   * @returns {Promise<string>}
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
   * Opens the visual Filter Builder in a modal dialog, seeded with the current
   * query. Replaces the legacy `hostBridge.openSearchBuilder()` round trip.
   *
   * @param {import('../widgets/filter/HFilter.js').HFilter} widget
   * @param {string} query Current raw query string from the HFilter input.
   */
  /** Public entry point for the Filter Builder from the command rail. */
  openFilterBuilder(query = null) {
    return this._openFilterBuilder(this.filter, query ?? this.filter?.getQueryValue?.() ?? '');
  }

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

  async setDataSource(source) { return this.activateDataSource(source); }
  async setSelection(ids) { return this.sync.setSelection(ids); }
  async resize() {
    this.layout?.resize();
    await Promise.all([...this.modules.values()].map((module) => module.resize()));
    return true;
  }
  async getState() {
    return {
      dataSource: this.sync.dataSource,
      selection: [...this.sync.selection],
      activeModuleId: this.layout?.activeModuleId || null,
      layout: this.layout?.getState() || null,
      modules: Object.fromEntries(await Promise.all([...this.modules].map(async ([id, module]) => [id, await module.getState()])))
    };
  }
  async destroy() {
    await Promise.all([...this.modules.values()].map((module) => module.destroy()));
    this.modules.clear();
    this.sync.destroy();
    this.layout?.destroy();
    this.inlineHelper?.destroy?.();
    this.helpOverlay?.close?.();
    this.filter?.destroy?.();
    this.savedFilters?.destroy?.();
    this.recordTypes?.destroy?.();
    this.querySources?.destroy?.();
    this.controlPanel?.destroy?.();
    this.filterHost?.remove?.();
    this.filterHost = null;
  }
}

function toolTitle(type) {
  return {
    report: 'Report',
    crosstabs: 'Crosstabs / Charts',
    actions: 'Actions Dashboard',
    export: 'Export Dashboard'
  }[type] || 'Tool';
}

function defaultLayout() {
  return [
    { id: 'data', type: 'data', region: 'west', context: { role: 'current' } },
    { id: 'map', type: 'map', region: 'center' }
  ];
}
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
