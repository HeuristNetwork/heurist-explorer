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

import { hasQueryParameters } from '#shared/data/queryParameters.js';
import { HeuristApiClient, RequestMonitor } from '#shared/api';
import { extentFromWkt, isExtent } from '#shared/utils';
import { HostAdapter } from '#shared/host';
import { HMsg, $HR, InlineHelp, getActiveLanguage, getAssetBaseUrl } from '#shared/ui';
import { LayoutManager } from './LayoutManager.js';
import { cloneDataSource, dataSourceKey, dataSourceRequest, dataSourceRole, normalizeDataSource } from './DataSource.js';
import { DataSourceFavorites } from './DataSourceFavorites.js';
import { DataSourceHistory } from './DataSourceHistory.js';
import { ExplorerWorkspace } from './ExplorerWorkspace.js';
import { SavedFilterManager } from './SavedFilterManager.js';
import { LegacySavedFilterConverter } from '../legacy/LegacySavedFilterConverter.js';
import { RecordTypeManager } from './RecordTypeManager.js';
import { UserGroupManager, ownerScope } from './UserGroupManager.js';
import { QuerySourceManager } from './QuerySourceManager.js';
import { RecordEditorHost } from './RecordEditorHost.js';
import { querySourceDetails } from './querySourceRecord.js';
import { RecordEditError } from '#shared/data/RecordEditClient.js';
import { HRuleBuilder, describeExpansionRule } from '../widgets/query-source/helpers/HRuleBuilder.js';
import { SyncEngine } from './SyncEngine.js';
import { IframeModuleAdapter } from '../modules/IframeModuleAdapter.js';
import { DirectModuleAdapter } from '../modules/DirectModuleAdapter.js';
import { ExplorerControlPanel } from '../ui/ExplorerControlPanel.js';
import {
  applyUiRegions, ExplorerUiConfig, isModuleUsed, leadingPaneTypes, MODULE_TYPES, resolveUiLanguage, TOOL_TYPES,
  UNUSED_REGION, effectiveUiConfig
} from './ExplorerUiConfig.js';
import { ExplorerToolModule } from '../tools/ExplorerToolModule.js';
import { HDbDefs } from '#shared/data/HDbDefs.js';
import { RecordTypeProvider } from '#shared/data/RecordTypeProvider.js';
import { recordLimitsDiffer } from '#shared/recordview/recordLimits.js';
import { EditorServices } from './EditorServices.js';
import { QuerySourcePanel } from '../widgets/query-source/QuerySourcePanel.js';
import { QueryTracePanel } from '../widgets/query-source/QueryTracePanel.js';
import { ExplorerAuthoringDock } from '../ui/ExplorerAuthoringDock.js';
import { ExplorerCompactMode } from '../ui/ExplorerCompactMode.js';
import { ExplorerPaneToolbar } from '../ui/ExplorerPaneToolbar.js';
import { ExplorerWelcome } from '../ui/ExplorerWelcome.js';
import { ExplorerTour, loadTourText } from '../ui/ExplorerTour.js';
import { explorerTourSteps, explorerTourTopics } from '../ui/explorerTourSteps.js';
import './ExplorerApplication.css';
import { aggregate } from '#shared/data/aggregate.js';
import { openTagManager } from '../ui/ExplorerTagManager.js';

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
    // untitled searches are named by the query in words (once definitions are loaded)
    this.history = new DataSourceHistory({ database: config.database, describe: (q) => this._describeQuery(q) });
    this.workspace = new ExplorerWorkspace({
      database: config.database,
      resolver: (reference) => this.resolveDataSourceReference(reference)
    });
    // last executed request per DataSource key: a parameterized Workspace source
    // is sent to Map/Timeline with the values of its last Filter Form search
    this.resolvedRequests = new Map();
    this.favorites = new DataSourceFavorites({
      database: config.database,
      resolver: (reference) => this.resolveDataSourceReference(reference)
    });
    this.uiConfig = new ExplorerUiConfig({ database: config.database });
    this.uiConfigValue = ExplorerUiConfig.defaults();
    this.modules = new Map();
    this.sync = new SyncEngine({
      onDataSourceRequest: (source, options) => this.activateDataSource(source, options)
    });
    if (config.state?.activeMapDocument != null) this.sync.activeMapDocument = String(config.state.activeMapDocument);
    this.layout = null;
    this.controlPanel = null;
    this.savedFilters = null;
    this.recordTypes = null;
    this.querySources = null;
    this._moduleCounter = 0;
    this.layoutDefinitions = [];
    // the single Query Source editor / Filter Form, in the authoring dock's west pane
    this.querySourcePanel = null;
    // the query trace, below the editor in the west pane (Query tracer in the configuration dialog)
    this.queryTracePanel = null;
    this.authoringDock = null;
    // narrow-screen presentation; removable, see ExplorerCompactMode
    this.compactMode = null;
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

    // Every data request of Explorer and its modules: Stop button and the query trace
    // (while the trace is closed, requests carry no debug flag)
    this.requestMonitor = new RequestMonitor({ source: 'explorer', traceEnabled: readTraceShown() && readTracePreference() });
    this.requestMonitor.addEventListener('tracechange', (event) => {
      // closing the trace switches Debug off but keeps the user's choice for next time
      if (this.queryTracePanel) writeTracePreference(event.detail.enabled);
    });
    const apiClient = new HeuristApiClient({
      apiBaseUrl: this.config.apiBaseUrl,
      database: this.config.database,
      accessToken: this.config.accessToken,
      headers: this.config.requestHeaders,
      requestMonitor: this.requestMonitor
    });
    this.apiClient = apiClient;
    // Saved Filters and Query Sources of the current user's scope: Everyone,
    // Website filters, their groups and themselves (ownerScope)
    const ownerIds = () => ownerScope(this.userGroups?.data || null);
    this.savedFilters = new SavedFilterManager({
      apiClient,
      legacyConverter: new LegacySavedFilterConverter({ getDbDefs: () => this._ensureDbDefs() }),
      ownerIds
    });
    this.recordTypes = new RecordTypeManager({
      apiClient,
      dbDefsProvider: () => this._ensureDbDefs(),
      baseUrl: this.config.baseUrl,
      database: this.config.database
    });
    this.userGroups = new UserGroupManager({
      apiClient,
      dbDefsProvider: () => this._ensureDbDefs()
    });
    // system records (query sources, map documents/layers, reports, website pages)
    // open in Explorer's record editor, also without the legacy host (plan 14)
    this.recordEditing = new RecordEditorHost({
      apiClient,
      getDbDefs: () => this._dbDefs || null,
      ensureDbDefs: () => this._ensureDbDefs(),
      getBridge: () => this.config.hostBridge || null,
      isLoggedIn: () => Number(this.userGroups?.data?.currentUserId) > 0,
      selectExtent: this.config.moduleUrls?.map ? (current) => this.selectFilterExtent(current) : null,
      selectGeometry: this.config.moduleUrls?.map ? (current) => this.selectGeometry(current) : null,
      editQuery: (query, filterForm) => this._editQueryWithBuilder(query, filterForm),
      describeQuery: (q) => this._describeQuery(q),
      onSaved: ({ record }) => this._recordSaved(record),
      // tags of a record changed in its editor; "Manage tags" of its Tags panel (plan 20, 4a)
      onTagsChanged: (recordId) => this._tagsChanged(recordId),
      manageTags: () => this.manageTags(),
      // record type icons in the symbol previews of the symbology editors (plan 17)
      rectypeIconUrl: (id) => this.recordTypes?.iconUrl?.(id) || '',
      language: this.config.language,
      baseUrl: this.config.baseUrl,
      database: this.config.database,
      recordLimits: this.config.recordLimits,
      // the record editor settings of the configuration (plan 25), read when an editor opens
      editorSettings: () => this.uiConfigSaved?.recordEditor || null
    });
    this.querySources = new QuerySourceManager({
      apiClient,
      recordTypeProvider: new RecordTypeProvider({ apiClient }),
      ownerIds,
      dbDefsProvider: () => this._ensureDbDefs()
    });
    // users/groups first: they decide which filters and sources are listed, and
    // feed the owner/creator pickers. A failure (or a guest) leaves the public scope.
    try {
      await this.userGroups.load();
    } catch (error) {
      if (error?.name !== 'AbortError') console.warn('Users and groups could not be loaded', error);
    }
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

    // the saved configuration (edited in the dialog) and the one applied (simplified interface)
    this.uiConfigSaved = this.uiConfig.load();
    this.uiConfigValue = effectiveUiConfig(this.uiConfigSaved);
    // outer layout: authoring pane (west or north) beside the presentation-module layout (center)
    this.authoringDock = new ExplorerAuthoringDock(workspace, { database: this.config.database });
    // compact mode and a vertical Filter Form move the pane; the editor follows its region
    this.authoringDock.addEventListener('placementchange', (event) => {
      this.querySourcePanel?.setOrientation(event.detail.region === 'west' ? 'vertical' : 'horizontal');
    });
    this.layout = new LayoutManager(this.authoringDock.modulesElement).bindModules(this.modules);
    // "In panes" toolbar position: switched on by the control panel's toolbar configuration
    this.paneToolbar = new ExplorerPaneToolbar({ application: this });
    this.controlPanel = new ExplorerControlPanel({
      application: this,
      initiallyCollapsed: this.config.settings?.controlPanel?.initiallyCollapsed === true
    });
    await this.controlPanel.mount(this.container);
    this._bindRunningQueries();
    await this._createQuerySourcePanel();
    // the simplified interface has no query tracer
    if (readTraceShown() && !this.isSimplifiedUI()) this.showQueryTrace();
    this.applySimplifiedUI();
    // modules of panes not expanded at start are created when first opened
    await this.applyLayout(this.config.settings.layout || defaultLayout(), { deferHidden: true });
    this.paneToolbar.refresh();
    this.compactMode = new ExplorerCompactMode({ application: this }).start();
    if (this.config.state.dataSource) await this.activateDataSource(this.config.state.dataSource);
    else await this._startUp();
    if (this.config.state.selection) await this.sync.setSelection(this.config.state.selection);
    return this;
  }

  /**
   * Apply a new module layout: create newly-listed modules, and destroy modules no longer present.
   *
   * @param {Array<object>|{modules: Array<object>}} layout Layout definition; see `normalizeLayout`.
   * @param {object} [options]
   * @param {boolean} [options.deferHidden=false] At startup: modules of panes that are not
   *        expanded at start (Explorer configuration, Layout) are not created now - they
   *        are created, from the kept definition, when first opened from the toolbar.
   * @returns {Promise<ExplorerApplication>} This instance, for chaining.
   */
  async applyLayout(layout, { deferHidden = false } = {}) {
    let moduleDefs = applyUiRegions(normalizeLayout(layout), this.uiConfigValue);
    if (deferHidden) {
      const panes = this.uiConfigValue?.panes || {};
      // an expanded pane starts with the first module of the configured order;
      // its other modules wait, like those of hidden panes, until first opened
      const leading = leadingPaneTypes(this.uiConfigValue);
      for (const [region, type] of leading) {
        if (panes[region] !== false && !moduleDefs.some((item) => item.type === type)) {
          moduleDefs.push({ id: type, type, region, context: type === 'data' ? { role: 'current' } : null });
        }
      }
      const shown = (item) => panes[item.region] !== false && leading.get(item.region) === item.type;
      this.deferredDefinitions = new Map(moduleDefs
        .filter((item) => !shown(item))
        .map((item) => [item.type, { ...item }]));
      moduleDefs = moduleDefs.filter(shown);
    }
    this.layoutDefinitions = moduleDefs.map((item) => ({ ...item }));
    this.layout.setLayout(moduleDefs);
    const active = new Set(moduleDefs.map((item) => item.id));
    for (const id of [...this.modules.keys()]) {
      if (!active.has(id)) await this._removeModule(id);
    }

    for (const definition of moduleDefs) {
      if (!this.modules.has(definition.id)) await this._createModule(definition);
    }
    this.controlPanel?.refreshActiveTool?.();
    return this;
  }

  /**
   * Unregister, destroy and remove one module with its layout slot and definition.
   *
   * @private
   * @param {string} id Module id.
   * @returns {Promise<void>}
   */
  async _removeModule(id) {
    const module = this.modules.get(id);
    // the Query Source editor shown in this Result module goes back to the dock first
    if (id === this._resultEditorModuleId) {
      this.authoringDock?.setExternalHost(null);
      this._resultEditorModuleId = null;
    }
    this.sync.unregister(id);
    this.modules.delete(id);
    await module?.destroy();
    this.layout.removeDefinition(id);
    this.layoutDefinitions = (this.layoutDefinitions || []).filter((item) => item.id !== id);
  }

  /**
   * Simplified interface: the Query Source editor is shown in the Result module,
   * under its header (`setHeaderContent` of heurist-data, direct mode only). The
   * Filter Form still opens in the Search pane (ExplorerAuthoringDock#setExternalHost).
   * Without that API, or in iframe mode, the editor stays in its north pane.
   *
   * @private
   * @param {import('./ExplorerModule.js').ExplorerModule} module A newly created module.
   * @returns {void}
   */
  _attachEditorToResult(module) {
    if (!this.isSimplifiedUI() || module.type !== 'data' || module.context?.role !== 'current') return;
    if (this._resultEditorModuleId || typeof module.api?.setHeaderContent !== 'function') return;
    const slot = document.createElement('div');
    slot.className = 'h-explorer-result-editor';
    if (module.api.setHeaderContent(slot) === false) return;
    this.authoringDock?.setExternalHost(slot);
    this._resultEditorModuleId = module.id;
  }

  /**
   * Create, mount, and register one module adapter from a layout definition: a
   * presentation (iframe or direct) or a tool.
   *
   * @private
   * @param {object} definition Layout definition for one module.
   * @returns {Promise<import('./ExplorerModule.js').ExplorerModule>} The mounted, registered module.
   * @throws {Error} When `direct` mode is requested for a module type with no entry in `DIRECT_MOUNTERS`.
   */
  async _createModule(definition) {
    if (TOOL_TYPES.includes(definition.type)) return this._createToolModule(definition);
    const moduleContainer = this.layout.createSlot(definition.id, definition.type);
    const mode = definition.mode || this.config.moduleModes?.[definition.type] || 'iframe';
    const mountModule = DIRECT_MOUNTERS[definition.type];
    if (mode === 'direct' && !mountModule) {
      throw new Error(`Direct mode is not implemented for ${definition.type}`);
    }
    const Adapter = mode === 'direct' ? DirectModuleAdapter : IframeModuleAdapter;
    const module = new Adapter({
      id: definition.id,
      type: definition.type,
      container: moduleContainer,
      url: definition.url || this.config.moduleUrls[definition.type],
      ...(mode === 'direct' ? {
        mountModule,
        assetBaseUrl: this.config.moduleAssetUrls?.[definition.type]
      } : {}),
      runtime: {
        database: this.config.database,
        apiBaseUrl: this.config.apiBaseUrl,
        baseUrl: this.config.baseUrl,
        accessToken: this.config.accessToken,
        requestHeaders: this.config.requestHeaders,
        language: this.config.language,
        // "Interface for dummies": modules simplify themselves (Data, plan 16 Part 4)
        simplifiedUI: this.isSimplifiedUI(),
        // limits of the built-in record view and popups (plan 23 §3.1)
        recordLimits: this.config.recordLimits
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
    this._attachEditorToResult(module);
    if (['map', 'timeline'].includes(module.type)) {
      if (this.sync.activeMapDocument != null) await module.setActiveMapDocument(this.sync.activeMapDocument);
      else {
        const active = module.api?.getActiveMapDocument?.();
        if (active) await this.sync.setActiveMapDocument(active.persistent === false ? 'dynamic' : active.id, { origin: module.id });
      }
      await this._syncWorkspaceMap(module);
    }

    // New presentation followers join the currently active datasource. Data
    // modules keep independent sources and are assigned explicitly by
    // activateDataSource().
    if (this.sync.dataSource && module.type !== 'data') {
      await module.setDataSource(this.sync.dataSource, { origin: 'sync' });
    }
    if (this.sync.selection.length) await module.setSelection(this.sync.selection, { origin: 'sync' });

    return module;
  }

  /**
   * Create the single Query Source panel (editor or runtime Filter Form) in the
   * authoring dock. Without database definitions the pane is hidden.
   *
   * @private
   * @returns {Promise<void>}
   */
  async _createQuerySourcePanel() {
    let dbdefs;
    try { dbdefs = await this._ensureDbDefs(); }
    catch (error) {
      this.authoringDock.hide();
      this.syncSearchButton();
      HMsg.showMsgErr?.($HR('Unable to load database structure') + ': ' + (error?.message || error));
      return;
    }
    const panel = new QuerySourcePanel({
      dbdefs,
      apiClient: this.apiClient,
      lang: this.config.language,
      openFilterBuilder: (query, filterForm) => this._editQueryWithBuilder(query, filterForm,
        (current) => panel.selectExtent(current)),
      editRules: (rules, options) => this.config.hostBridge?.editRules?.(rules, options),
      describeRules: (rules) => this.config.hostBridge?.describeRules?.(rules),
      onExecute: (source) => this.activateDataSource(source, {
        origin: 'query-source-editor', allowDirty: true, keepEditorDraft: true
      }),
      onApply: (source) => this._applyQuerySourceDraft(source),
      onSaveFilter: (source) => this.saveDatasourceAsFilter(source),
      // the QSE offers no "Save as Filter" (decided 2026-10-01); kept off here, not removed
      canSaveFilter: () => false,
      canSaveSource: () => this.canSaveSources(),
      onSaveSource: (source) => this._saveQuerySourceDraft(source),
      onUpdateSource: (source, id) => this._saveQuerySourceDraft(source, id),
      onWorkspaceAdd: (source) => this.addDataSourceToWorkspace(source),
      onWorkspaceRemove: (source) => this.removeDataSourceFromWorkspace(source),
      selectExtent: (current) => this.selectFilterExtent(current),
      isInWorkspace: (source) => this.isDataSourceInWorkspace(source),
      onClearResults: () => this.clearCurrentResult(),
      onShow: () => this.showQuerySourcePanel(),
      onModeChange: (mode) => this.authoringDock?.setMode(mode),
      onStop: () => this.stopAllQueries(),
      // layout: Vertical (west) / Horizontal (north), More, Help
      orientation: this.authoringDock.getRegion() === 'west' ? 'vertical' : 'horizontal',
      expanded: this.authoringDock.getAdvanced(),
      onExpandedChange: (expanded) => this.authoringDock?.setAdvanced(expanded),
      onLayoutChange: (orientation) => {
        this.authoringDock?.setPlacement(orientation === 'horizontal' ? 'north' : 'west');
        this.authoringDock?.show();
        this.syncSearchButton();
      },
      canChangeLayout: () => this.authoringDock?.isDrawerMode() !== true,
      onFormPlacement: (region) => this.authoringDock?.setTemporaryPlacement(region),
      onRevealForm: () => {
        this.authoringDock?.reveal();
        this.syncSearchButton();
      },
      isOutsideSearchPane: () => this.authoringDock?.getRegion() === 'external',
      // a Filter Form in the West pane covers it: the docked list is hidden meanwhile
      onFormVisible: (visible) => {
        this.authoringDock?.setFormCover(visible && this.authoringDock.getRegion() === 'west');
        this.syncSearchButton();
      },
      onHelp: () => this.controlPanel?.openFilterHelp(),
      // simplified interface: "Save filter for re-use" opens the legacy "Add new filter"
      // dialog with the query text (2026-10-14)
      simplified: this.isSimplifiedUI(),
      onSaveFilterForReuse: (query) => this.editSavedFilter(null, query)
        .catch((error) => HMsg.showMsgErr?.(error?.message || String(error))),
      canSaveFilterForReuse: () => this.canEditSavedFilters(),
      // simplified interface p6: legacy search builder and faceted search wizard (2026-10-15)
      openSearchBuilder: typeof this.config.hostBridge?.openSearchBuilder === 'function'
        ? (query) => this.openSearchBuilder(query) : null,
      onFacetBuilder: () => this.editFacetedFilter()
        .catch((error) => HMsg.showMsgErr?.(error?.message || String(error))),
      canFacetBuilder: () => this.canEditFacetedFilters()
    });
    // own host element: the panel replaces its container's class, and the pane
    // must keep `h-explorer-authoring` (its scroll container)
    const host = document.createElement('div');
    this.authoringDock.paneElement.append(host);
    panel.attach(host).render();
    this.querySourcePanel = panel;
    this.syncSearchButton();
  }

  /** Apply the Query Source draft to synchronized presentations without persisting it. */
  async _applyQuerySourceDraft(source) {
    const dataSource = normalizeDataSource(source);
    const dataModule = this.layout?.findCurrentResultDataModule?.();
    await this.sync.setDataSource(dataSource, {
      origin: 'query-source-editor-apply',
      preserveDataViews: true,
      dataModuleId: dataModule?.id
    });
    return dataSource;
  }

  /** Protect QuerySourceEditor drafts from silent datasource replacement. */
  async _confirmQuerySourceNavigation(panel) {
    const draft = panel?.getDraftDataSource?.();
    if (!draft) return true;
    const sourceId = draft.reference?.type === 'source' ? Number(draft.reference.id) : null;
    const message = document.createElement('div');
    message.style.width = 'min(520px, calc(100vw - 48px))';
    message.style.maxWidth = '100%';
    message.textContent = sourceId > 0
      ? $HR('This Query Source has unsaved changes.')
      : $HR('This source has unsaved configuration.');
    return new Promise((resolve) => {
      const finish = (value) => { HMsg.closeMsgDlg?.(); resolve(value); };
      const save = async () => {
        try {
          const result = await this._saveQuerySourceDraft(draft, sourceId > 0 ? sourceId : null);
          finish(result?.saved !== false);
        } catch (error) {
          HMsg.showMsgErr?.(error?.message || String(error));
        }
      };
      HMsg.showMsgDlg(message, {
        title: $HR('Unsaved Query Source changes'),
        preventClose: true,
        buttons: [
          // saving needs a host that can save sources (a logged-in user)
          ...(this.canSaveSources() ? [{ label: sourceId > 0 ? $HR('Update Source') : $HR('Save as Source'), class: 'h-btn h-btn-primary', onClick: () => void save() }] : []),
          { label: $HR('Discard'), class: 'h-btn', onClick: () => finish(true) },
          { label: $HR('Cancel'), class: 'h-btn', onClick: () => finish(false) }
        ]
      });
    });
  }

  /** Persist a QuerySourceEditor draft with the record API and refresh its stable reference. */
  async _saveQuerySourceDraft(source, id = null) {
    const panel = this._currentQuerySourcePanel();
    const prepared = !String(source?.title || '').trim() ? (panel?.prepareDraftForSave?.() || source) : source;
    if (!queryDefined(prepared?.request?.q)) return { saved: false, reason: 'empty-query' };
    const result = await this.saveDatasourceAsSource(prepared, id ? { id } : {});
    const recordId = Number(result?.recordId ?? id);
    if (result?.saved !== false && recordId > 0) {
      const resolved = await this.querySources.resolveDataSource(recordId);
      if (resolved) {
        panel?.markCommitted(resolved);
      } else {
        panel?.markCommitted();
      }
      await this.querySources.load().catch(() => {});
      if (this.workspace.has(resolved)) this.updateDataSourceInWorkspace(resolved);
      this.controlPanel?.refreshNavigationLists?.();
    }
    return result;
  }

  _currentQuerySourcePanel() {
    return this.querySourcePanel;
  }

  /** Show or hide the authoring pane (Query Source editor / Filter Form). @returns {Promise<boolean>} New visibility. */
  async toggleQuerySourceEditor() {
    if (!this.querySourcePanel || !this.authoringDock) return false;
    // a Filter Form covering the West pane: Search closes it and returns to the editor
    if (this.authoringDock.isFormCover()) {
      await this.closeCoveringFilterForm();
      this.authoringDock.show();
      this.syncSearchButton();
      return true;
    }
    const visible = this.authoringDock.toggle();
    this.syncSearchButton();
    return visible;
  }

  /**
   * Close the Filter Form when it covers the West pane, so the Query Source editor
   * and the docked list come back.
   *
   * @returns {Promise<boolean>} Whether a form was closed.
   */
  async closeCoveringFilterForm() {
    if (!this.authoringDock?.isFormCover()) return false;
    await this.querySourcePanel?.closeFilterForm({ clearEditor: this.isSimplifiedUI() });
    this.authoringDock.setFormCover(false);
    return true;
  }

  /** Whether the toolbar lists (Filters ... Workspace) are docked in the West pane (not in compact mode). */
  isListsDocked() {
    return this.uiConfigValue?.lists !== 'popup' && this.authoringDock?.isDrawerMode() !== true;
  }

  /** Whether the authoring pane is visible. */
  isQuerySourceEditorVisible() {
    return Boolean(this.querySourcePanel) && this.authoringDock?.isVisible() === true;
  }

  /** Reveal the authoring pane, e.g. when a filter or query source is picked from a list. */
  showQuerySourcePanel() {
    if (!this.querySourcePanel || !this.authoringDock) return;
    this.authoringDock.show();
    this.syncSearchButton();
  }

  /** Mirror the authoring pane's (and docked list's) visibility on the toolbar buttons. */
  syncSearchButton() {
    if (this.controlPanel?.syncAuthoringButtons) this.controlPanel.syncAuthoringButtons();
    else this.controlPanel?.leftRail?.setActive('search', this.isQuerySourceEditorVisible());
  }

  /** Clear the reusable current result while retaining the editor's draft/source. */
  async clearCurrentResult() {
    const dataModule = this.layout?.findCurrentResultDataModule?.();
    await this.sync.setSelection([]);
    await this.sync.setDataSource(null, {
      preserveDataViews: true,
      dataModuleId: dataModule?.id || null
    });
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
    // the Result module deferred at startup keeps its layout definition
    const deferred = role === 'current' ? this.deferredDefinitions?.get('data') : null;
    if (deferred) this.deferredDefinitions.delete('data');
    const definition = {
      ...(deferred || {}),
      id,
      type: 'data',
      region: this.uiConfigValue?.regions?.data || deferred?.region,
      title: source?.title || (role === 'current' ? 'Current result' : 'Data'),
      context: { ...(deferred?.context || {}), ...(context || {}), role },
      settings: { ...(deferred?.settings || {}), title: source?.title || undefined }
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
   * @param {object} source DataSource emitted by a Filter Form search, saved filter, or a presentation.
   * @param {object} [syncOptions] Options forwarded to `SyncEngine#setDataSource`.
   * @returns {Promise<object|null>} Reusable data module.
   */
  async activateDataSource(source, syncOptions = {}) {
    if (!source) {
      return null;
    }

    const panelBefore = this._currentQuerySourcePanel();
    if (panelBefore?.isDirty?.() && syncOptions.allowDirty !== true) {
      const draftBefore = panelBefore.getDraftDataSource?.();
      const isSavedSource = draftBefore?.reference?.type === 'source' && Number(draftBefore.reference.id) > 0;
      const hasConfiguredFields = panelBefore.hasConfiguredFields?.() === true;
      if (isSavedSource || hasConfiguredFields) {
        const mayContinue = await this._confirmQuerySourceNavigation(panelBefore);
        if (!mayContinue) return null;
      }
    }

    const requestedSource = normalizeDataSource(source);
    if (hasQueryParameters(requestedSource.request?.q) && panelBefore) {
      // opens the Filter Form, which reveals the pane
      panelBefore.setDataSource(requestedSource);
      return null;
    }

    const dataSource = await this._withResultCount(requestedSource);
    const key = dataSource.reference?.key;
    if (key) this.resolvedRequests.set(key, { request: structuredClone(dataSource.request), meta: { ...(dataSource.meta || {}) } });
    let dataModule = this.layout.findCurrentResultDataModule();

    if (!dataModule) {
      dataModule = await this._createDataModule(dataSource, { role: 'current' });
    }

    // Every module's IframeModuleAdapter.setDataSource() brackets its own
    // call with setLoading(true)/setLoading(false), so every caller here
    // (saved filter/source/record-type selection, a Filter Form search) gets
    // a consistent loading indicator without this method managing one itself.
    await this.sync.setDataSource(dataSource, {
      ...syncOptions,
      preserveDataViews: true,
      dataModuleId: dataModule.id
    });

    if (!this._dbDefs && !dataSource.title) await this._ensureDbDefs().catch(() => null);
    this.history.add(dataSource);
    this.controlPanel?.refreshNavigationLists?.();

    this.layout.activateModule(dataModule.id);
    if (syncOptions.keepEditorDraft !== true && this.querySourcePanel) {
      this.querySourcePanel.setDataSource(dataSource);
      this.showQuerySourcePanel();
    }
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
   * Start without a DataSource in the bootstrap state: reopen the most recent
   * history entry (a parameterized query opens the Filter Form, any other runs at
   * once), or on the very first visit show the welcome popup (plan 11).
   *
   * @private
   * @returns {Promise<void>}
   */
  async _startUp() {
    // on a website page (plan 27a) neither the visitor's own last query nor the welcome popup
    if (this.config.published) return;
    const last = this.history.list()[0];
    if (last?.dataSource) {
      // the workspace is ready: the query's progress is the Query Source loading
      // veil (with Stop), not the start-up indicator over the whole screen
      this.container?.classList?.remove('h-explorer-booting');
      this.querySourcePanel?.setLoading(true);
      try { await this.activateHistoryEntry(last); }
      catch (error) { if (error?.name !== 'AbortError') HMsg.showMsgErr?.(error?.message || String(error)); }
      finally { this.querySourcePanel?.setLoading(false); }
      return;
    }
    if (new ExplorerWelcome().isFirstVisit()) this.showWelcome();
  }

  /**
   * Show the query trace in the West region, below the Query Source editor (Query
   * tracer in the Explorer configuration dialog). A docked list covers it.
   *
   * @returns {void}
   */
  /**
   * The tag manager of the current user (plan 20, Phase 4a): add, rename, merge and delete
   * personal and group tags; a usage count searches the records of the tag.
   *
   * @returns {Promise<void>} Resolved when the manager closes.
   */
  async manageTags() {
    const dbdefs = await this._ensureDbDefs().catch(() => null);
    return openTagManager({
      apiClient: this.apiClient,
      dbdefs,
      onSearchTag: (tag) => void this.showDatasource({
        reference: { type: 'query' },
        title: `${$HR('Tag')}: ${tag.name}`,
        request: { q: [{ tag: tag.id }] }
      }),
      onChange: () => void this._tagsChanged(0)
    });
  }

  /**
   * The users or the groups of the database in the record manager (plan 20, Phase 4d); after
   * a change the users and groups of the pickers load again.
   *
   * @param {'user'|'group'} type Users or groups.
   * @returns {Promise<void>} Resolved when the manager closes.
   */
  async manageUsersOrGroups(type) {
    try {
      const dbdefs = await this._ensureDbDefs();
      const { openUserGroupManager } = await import('../ui/ExplorerUserGroupManager.js');
      await openUserGroupManager(type, {
        apiClient: this.apiClient,
        dbdefs,
        baseUrl: this.config.baseUrl,
        database: this.config.database,
        onChange: () => this.userGroups?.load()
      });
    } catch (error) {
      HMsg.showMsgErr?.(error?.message || String(error));
    }
  }

  /** "Manage users" (plan 20, Phase 4d). */
  manageUsers() {
    return this.manageUsersOrGroups('user');
  }

  /** "Manage groups" (plan 20, Phase 4d). */
  manageGroups() {
    return this.manageUsersOrGroups('group');
  }

  /**
   * The registered files of the database in the record manager (plan 20 §10.12).
   *
   * @returns {Promise<void>} Resolved when the manager closes.
   */
  async manageFiles() {
    try {
      await this.recordEditing.manageFiles();
    } catch (error) {
      HMsg.showMsgErr?.(error?.message || String(error));
    }
  }

  /**
   * Tags changed (the tag manager, or the Tags panel of a record editor): the tag lists
   * (HDbDefs, filters by tag) load again, and a Record View that shows the record (any
   * record for a change in the manager) shows its tags again.
   *
   * @param {number} recordId The tagged record, or 0.
   * @returns {Promise<void>}
   */
  async _tagsChanged(recordId) {
    try {
      await this.userGroups?.load();
    } catch (error) {
      if (error?.name !== 'AbortError') console.warn('Tags could not be reloaded', error);
    }
    for (const module of this.modules.values()) {
      if (module.type !== 'recordview') continue;
      const shown = Number(module.api?.getState?.()?.recordId) || 0;
      if (shown > 0 && (!recordId || shown === Number(recordId))) await module.api?.setRecord?.(shown);
    }
  }

  showQueryTrace() {
    const dock = this.authoringDock;
    if (!dock) return;
    if (!this.queryTracePanel) {
      this.queryTracePanel = new QueryTracePanel({
        monitor: this.requestMonitor,
        onClose: () => this.hideQueryTrace()
      });
      // own host element: the panel replaces its container's class, and the dock's
      // trace host must keep its classes (and its [hidden] rule)
      const host = document.createElement('div');
      dock.traceElement.replaceChildren(host);
      this.queryTracePanel.attach(host).render();
      this.requestMonitor.traceEnabled = readTracePreference();
    }
    dock.setTraceShown(true);
    writeTraceShown(true);
  }

  /** Close the query trace; requests stop asking for server timings. */
  hideQueryTrace() {
    const panel = this.queryTracePanel;
    this.queryTracePanel = null;
    void panel?.destroy?.();
    this.authoringDock?.traceElement.replaceChildren();
    this.authoringDock?.setTraceShown(false);
    if (this.requestMonitor) this.requestMonitor.traceEnabled = false;
    writeTraceShown(false);
  }

  /** @returns {boolean} Whether the simplified interface ("Interface for dummies (v7 like)") is on. */
  isSimplifiedUI() {
    return this.uiConfigValue?.isSimplifiedUI === true;
  }

  /**
   * Apply the simplified interface (or leave it): fewer toolbar buttons (root class
   * `h-explorer-simplified`), the Query Source editor's simple button row, no query
   * tracer. Its toolbar and layout come with the configuration (`effectiveUiConfig`).
   *
   * @returns {void}
   */
  applySimplifiedUI() {
    const on = this.isSimplifiedUI();
    this.container?.classList.toggle('h-explorer-simplified', on);
    // the editor is always horizontal (its north pane, or inside Result)
    this.authoringDock?.setForcedPlacement(on ? 'north' : null);
    this.querySourcePanel?.setSimplified?.(on);
    if (on && this.queryTracePanel) this.hideQueryTrace();
  }

  /** @returns {boolean} Whether the query trace is open (it may be covered by a docked list). */
  isQueryTraceShown() {
    return Boolean(this.queryTracePanel) && this.authoringDock?.isTraceShown() === true;
  }

  /**
   * Show a module's user manual over Explorer (the module asked from its iframe,
   * see `useHostHelp`). The module resolves the manual's URL: it is in its bundle.
   *
   * @param {{moduleName?: string, url?: string, anchor?: string|null}} [request] Manual to show.
   * @returns {boolean} Whether a manual was shown.
   */
  openModuleHelp({ moduleName = 'module', url = '', anchor = null } = {}) {
    if (!url) return false;
    this._moduleHelp?.close();
    this._moduleHelp = new InlineHelp({ parent: this.container, moduleName, url });
    this._moduleHelp.open(anchor);
    return true;
  }

  /** Show the welcome popup (first visit, or Getting started in the configuration dialog). */
  showWelcome() {
    new ExplorerWelcome({ onGettingStarted: () => this.openGettingStarted() }).open();
  }

  /**
   * Getting started: the guided tour over the Explorer interface (plan 11). The
   * Query Source editor's More state is restored when the tour closes.
   *
   * @param {number} [index=0] Step to start with.
   * @returns {Promise<boolean>} Whether the tour opened.
   */
  async openGettingStarted(index = 0) {
    if (this._tour?.isOpen()) return true;
    const editor = this.querySourcePanel?.editor;
    const expanded = editor?.isExpanded?.();
    const base = String(getAssetBaseUrl() || '').replace(/\/+$/, '');
    const language = getActiveLanguage();
    const suffix = language.charAt(0).toUpperCase() + language.slice(1);
    this._tour = new ExplorerTour({
      steps: explorerTourSteps(this),
      topics: explorerTourTopics(),
      // texts per language; the English file when a translation is missing
      loadText: () => loadTourText(`${base}/explorerGettingStarted${suffix}.htm`, `${base}/explorerGettingStartedEng.htm`),
      onReadMore: (anchor) => this.openManual(anchor),
      isCompact: () => this.compactMode?.active === true,
      onClose: () => { if (expanded != null) editor?.setExpanded(expanded); }
    });
    return this._tour.start(index);
  }

  /**
   * Open the Explorer manual, optionally at a section.
   *
   * @param {string|null} [anchor] Section id in the manual.
   */
  openManual(anchor = null) {
    this._manualHelp ||= new InlineHelp({ parent: this.container, moduleName: 'explorer' });
    this._manualHelp.open(anchor);
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
    const sourceId = value?.reference?.type === 'source' ? Number(value.reference.id) : 0;
    if (!(sourceId > 0)) return null;
    const entry = this.workspace.add(value, options);
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
   * A parameterized query gets the request of its last Filter Form search; before
   * the first search it keeps its template, which Map and Timeline do not load.
   *
   * @returns {Promise<Array<object>>} Resolved workspace datasources.
   */
  async getWorkspaceDataSources() {
    const values = await Promise.all(this.workspace.list().map((entry) => this.workspace.resolve(entry)));
    return Promise.all(values.filter(Boolean).map((source) => {
      if (!hasQueryParameters(source.request?.q)) return this._withResultCount(source);
      const resolved = this.resolvedRequests.get(source.reference?.key);
      if (!resolved || hasQueryParameters(resolved.request?.q)) return source;
      return normalizeDataSource({
        ...source,
        request: structuredClone(resolved.request),
        meta: { ...(source.meta || {}), ...resolved.meta }
      });
    }));
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
    const query = { q: request.q };
    if (request.filter != null) query.filter = request.filter;
    try {
      const payload = await aggregate(this.apiClient, 'count', query);
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
    const targets = module ? [module] : [...this.modules.values()].filter((item) => ['map', 'timeline'].includes(item.type));
    // simplified interface: Map and Timeline show the current result only, no Workspace sources
    const sources = this.isSimplifiedUI() ? [] : await this.getWorkspaceDataSources();
    return Promise.all(targets.map((target) => target.setWorkspaceDataSources?.(sources)));
  }

  /**
   * Resolve and activate an arbitrary datasource-like value requested by a presentation module.
   *
   * @param {object} source Datasource-like value; see `_resolveRequestedDataSource`.
   * @returns {Promise<object|null>} Reusable data module, or `null` when unresolved.
   */
  async showDatasource(source, options = {}) {
    const dataSource = await this._resolveRequestedDataSource(source);
    if (!dataSource) return null;
    // a Workspace layer/band keeps the result of a parameterized source: show its Filter
    // Form filled with the values of that search, with the result, not the resolved query
    const template = await this._parameterizedTemplate(dataSource);
    const values = template ? this.querySourcePanel.lastParameterValues(dataSource.reference.key) : null;
    if (values) {
      this.querySourcePanel.setDataSource(template, { values, keepResults: true });
      this.showQuerySourcePanel();
      return this.activateDataSource(dataSource, { ...options, keepEditorDraft: true });
    }
    return this.activateDataSource(template || dataSource, options);
  }

  /**
   * The saved parameterized query of a resolved Query Source (its `$X$` values filled).
   *
   * @private
   * @param {object} dataSource Resolved DataSource.
   * @returns {Promise<object|null>} The saved source with its template, or null.
   */
  async _parameterizedTemplate(dataSource) {
    if (dataSource.reference?.type !== 'source' || !this.querySourcePanel
      || hasQueryParameters(dataSource.request?.q)) return null;
    try {
      const saved = await this.resolveDataSourceReference(dataSource.reference);
      return hasQueryParameters(saved?.request?.q) ? normalizeDataSource(saved) : null;
    } catch {
      return null;
    }
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
   * Save a datasource (or the active one) as a Query Source record with the record
   * API (plan 14): a new record (POST), or an update (PATCH) of the fields the Query
   * Source editor owns, so the other fields of the record (summary, creators...) stay.
   *
   * @param {object|null} [source] Datasource to save; defaults to `this.sync.dataSource`.
   * @param {{id?: number}} [options] `id`: the Query Source record to update.
   * @returns {Promise<{saved: boolean, recordId: number|null, record: object|null}>}
   * @throws {Error} When there is nothing to save, the user cannot save, or the server refuses
   *         (the message lists the invalid fields).
   */
  async saveDatasourceAsSource(source = null, options = {}) {
    const dataSource = await this._resolveRequestedDataSource(source || this.sync.dataSource);
    if (!dataSource) throw new Error($HR('No data source to save'));
    if (!this.canSaveSources()) throw new Error($HR('Source editor is not available'));
    const dbdefs = await this._ensureDbDefs();
    const rectypeId = Number(dbdefs.dbconst?.('RT_QUERY_SOURCE')) || 0;
    if (!(rectypeId > 0)) throw new Error($HR('Query Source record type is not available'));
    const { details } = querySourceDetails(dataSource, dbdefs);
    const reference = dataSource.reference;
    const recordId = Number(options.id || (reference?.type === 'source' ? reference.id : 0)) || 0;
    const client = this.recordEditing.client;
    try {
      const result = recordId > 0
        ? await client.patch(recordId, { details })
        : await client.insert({ rec_ID: '0', rec_RecTypeID: String(rectypeId), details });
      return { saved: true, recordId: Number(result.record?.rec_ID) || recordId || null, record: result.record };
    } catch (error) {
      if (error instanceof RecordEditError && error.issues.length) {
        const messages = error.issues.filter((issue) => issue.severity !== 'warning').map((issue) => issue.message);
        throw new Error(`${$HR('The Query Source could not be saved')}: ${messages.join('; ') || error.message}`);
      }
      throw error;
    }
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
    let dataSource;
    try { dataSource = await this.favorites.resolve(entry); } catch (error) { this._showOpenError(error); return null; }
    const module = dataSource ? await this.activateDataSource(dataSource) : null;
    this._showDataSourceWarnings(dataSource);
    return module;
  }

  /**
   * Resolve and activate a saved filter by id.
   *
   * @param {number|string} id Saved filter record id.
   * @returns {Promise<object|null>} Reusable data module, or `null` when unresolved.
   */
  async activateSavedFilter(id) {
    let dataSource;
    try { dataSource = await this.savedFilters.resolveDataSource(id, { origin: 'filter' }); } catch (error) { this._showOpenError(error); return null; }
    const module = dataSource ? await this.activateDataSource(dataSource) : null;
    this._showDataSourceWarnings(dataSource);
    return module;
  }

  /**
   * Show non-fatal warnings attached to a resolved DataSource (`meta.warnings`),
   * e.g. parts of a legacy saved filter that could not be converted.
   *
   * @private
   * @param {object|null} dataSource Resolved DataSource.
   * @returns {void}
   */
  _showDataSourceWarnings(dataSource) {
    const warnings = dataSource?.meta?.warnings;
    if (!Array.isArray(warnings) || !warnings.length) return;
    const body = document.createElement('div');
    const intro = document.createElement('p');
    intro.className = 'h-i18n';
    intro.textContent = $HR('Some parts of this filter could not be converted:');
    const list = document.createElement('ul');
    for (const warning of warnings) {
      const item = document.createElement('li');
      item.textContent = warning;
      list.append(item);
    }
    body.append(intro, list);
    HMsg.showMsgDlg(body, { title: dataSource.title || 'Saved filter', buttons: { [$HR('OK')]: () => HMsg.closeMsgDlg() } });
  }

  /**
   * Report a DataSource that cannot be opened, including a legacy query when available.
   *
   * @private
   * @param {Error} error Resolution error.
   * @returns {void}
   */
  _showOpenError(error) {
    if (error?.name === 'AbortError') return;
    const body = document.createElement('div');
    const message = document.createElement('p');
    message.textContent = error?.message || String(error);
    body.append(message);
    if (error?.legacyQuery) {
      const query = document.createElement('pre');
      query.className = 'h-explorer-legacy-query';
      query.textContent = error.legacyQuery;
      body.append(query);
    }
    HMsg.showMsgErr(body);
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
   * @param {*} [squery] Seed query/definition for the editor. A new filter with a
   *        parameterized query is refused (message): it belongs in a Query Source.
   * @returns {Promise<object|null>} Editor result, or `null` when the host returned nothing (or refused).
   * @throws {Error} When the host doesn't support editing saved filters.
   */
  async editSavedFilter(svsID, squery = null) {
    const bridge = this.config.hostBridge;
    if (!bridge || typeof bridge.editSavedFilter !== 'function') {
      throw new Error($HR('Saved Filter editor is not available'));
    }
    // a parameterized query (Filter Form) is not saved as a new Saved Filter: the legacy
    // format can not hold it; it is a Query Source (Artem, 2026-10-14)
    const isNew = !(Number(svsID) > 0);
    if (isNew && hasQueryParameters(squery && typeof squery === 'object' && !Array.isArray(squery) ? squery.q : squery)) {
      HMsg.showMsgDlg?.('A query with parameters (Filter Form) can not be saved as a Saved Filter. Save it as a Query Source.',
        { title: 'Save filter' });
      return null;
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
   * Open the host's legacy search builder (searchBuilder.js) as a query designer.
   *
   * @param {string} [query=''] Query text it starts with.
   * @returns {Promise<string|null>} The composed query text, or null when closed without one.
   * @throws {Error} When the host has no search builder.
   */
  async openSearchBuilder(query = '') {
    const bridge = this.config.hostBridge;
    if (typeof bridge?.openSearchBuilder !== 'function') {
      throw new Error($HR('Search Builder is not available'));
    }
    const result = await bridge.openSearchBuilder({ query: String(query ?? '') });
    return result == null ? null : String(result);
  }

  /**
   * Open the host's faceted search wizard for a new faceted Saved Filter; the Saved
   * Filters are reloaded when it saves.
   *
   * @returns {Promise<object|null>} Editor result, or null.
   * @throws {Error} When the host has no faceted search wizard.
   */
  async editFacetedFilter() {
    const bridge = this.config.hostBridge;
    if (typeof bridge?.editFacetedFilter !== 'function') {
      throw new Error($HR('Faceted search wizard is not available'));
    }
    const result = await bridge.editFacetedFilter();
    if (result?.saved) {
      await this.savedFilters.load();
      this._savedFilterSaved(result);
      this.controlPanel?.refreshNavigationLists?.();
    }
    return result || null;
  }

  /** @returns {boolean} Whether the host faceted search wizard can be used (as the Saved Filter editor). */
  canEditFacetedFilters() {
    return hostCan(this.config.hostBridge, 'editFacetedFilter', 'canEditSavedFilters');
  }

  /**
   * @returns {boolean} Whether records can be edited: Explorer's record editor for a
   *          logged-in user (every record type, plan 21), else the host record editor.
   */
  canEditRecords() {
    return this.recordEditing?.canEditRecords() === true || hostCan(this.config.hostBridge, 'editRecord', 'canEditRecords');
  }

  /** @returns {boolean} Whether the host Saved Filter editor can be used. */
  canEditSavedFilters() {
    return hostCan(this.config.hostBridge, 'editSavedFilter', 'canEditSavedFilters');
  }

  /** @returns {boolean} Whether the host can save a Query Source record. */
  canSaveSources() {
    // the record API (plan 14): any logged-in user; the server checks the ownership
    return this.canEditRecordType('RT_QUERY_SOURCE');
  }

  /**
   * Whether records of a type can be edited: Explorer's record editor (logged-in
   * user, every type), or the legacy host editor.
   *
   * @param {number|string} recordType Record type id or code name (`RT_QUERY_SOURCE`).
   * @returns {boolean}
   */
  canEditRecordType(recordType) {
    return this.recordEditing?.canEditRecordType(recordType) === true;
  }

  /**
   * Edit a record: system records in Explorer's record editor, others in the host editor.
   *
   * @param {number|string} id Record id.
   * @param {{recordType?: number|string}} [options] Record type id or code name, when known.
   * @returns {Promise<{saved: boolean, recordId: number}|*>}
   */
  async editRecord(id, options = {}) {
    return this.recordEditing.editRecord(id, options);
  }

  /**
   * Create a record of a type (Explorer's record editor for system record types).
   *
   * @param {number|string} recordType Record type id or code name.
   * @returns {Promise<{saved: boolean, recordId: number}|*>}
   */
  async addRecord(recordType) {
    return this.recordEditing.addRecord(recordType);
  }

  /** Open a Query Source record in the record editor. */
  async editQuerySource(id) {
    const recordId = Number(id);
    if (!Number.isFinite(recordId) || recordId <= 0) return null;
    if (!this.canEditRecordType('RT_QUERY_SOURCE')) {
      throw new Error($HR('Record editor is not available'));
    }
    return this.editRecord(recordId, { recordType: 'RT_QUERY_SOURCE' });
  }

  /**
   * A record was saved in Explorer's record editor: refresh the lists that show it.
   *
   * @private
   * @param {object} record Saved record.
   * @returns {Promise<void>}
   */
  async _recordSaved(record) {
    const rectypeId = Number(record?.rec_RecTypeID);
    if (rectypeId > 0 && rectypeId === Number(this._dbDefs?.dbconst?.('RT_QUERY_SOURCE'))) {
      try {
        await this.querySources?.load?.();
        this.controlPanel?.refreshNavigationLists?.();
      } catch (error) {
        console.warn('Query sources could not be reloaded', error);
      }
    }
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
   * Show a record in Explorer's Record view: make that module visible (creating it
   * when needed; in compact mode also scrolled to) and select the record, which
   * every synchronized module follows. Used for a module's "view record" request.
   * Without a configured Record view the request goes to the outer host bridge.
   *
   * @param {number|string} id Record id.
   * @returns {Promise<*>} The Record view module, or the bridge's result.
   */
  async viewRecord(id) {
    const recordId = Number(id);
    if (!Number.isInteger(recordId) || recordId < 1) return null;
    const module = await this.showPresentation('recordview');
    if (!module) return this.config.hostBridge?.viewRecord?.(recordId);
    await this.sync.setSelection([recordId]);
    return module;
  }

  /**
   * Make a module (presentation or tool) visible in its configured pane, creating
   * it when needed (deferred at start). Unlike togglePresentation() it never hides
   * the module. Used by the pane tabs and dividers of the "In panes" toolbar too.
   *
   * @param {string} type Module type; see `MODULE_TYPES`.
   * @returns {Promise<object|null>} The module, or null when its type is not placed in a pane.
   */
  async showPresentation(type) {
    if (!isModuleUsed(this.uiConfigValue, type)) return null;
    const region = this.uiConfigValue.regions[type];

    let module = [...this.modules.values()].find((item) => item.type === type);
    if (!module) {
      module = await this._createPresentation(type, region);
    } else if (!(this.layout.cardinal.getState()[region]?.visible && this.layout.getModuleForRegion(region) === module.id)) {
      this.layout.assignModule(module.id, region);
      this.layout.showModule(module.id);
      await module.resize();
    }
    this.controlPanel?.refreshPresentationState?.();
    this.compactMode?.scrollToPresentation(type);
    return module || null;
  }

  /** Add a presentation module of this type to the layout, in the given region. */
  async _createPresentation(type, region) {
    // a module deferred at startup keeps its layout definition (settings, state, context)
    const deferred = this.deferredDefinitions?.get(type);
    this.deferredDefinitions?.delete(type);
    const definition = { ...(deferred || {}), id: deferred?.id || type, type, region };
    this.layoutDefinitions.push(definition);
    this.layout.addDefinition(definition);
    return this._createModule(definition);
  }

  /**
   * Toggles a module (presentation or tool) in its configured pane. Modules
   * sharing a pane behave as a radio group.
   *
   * @param {string} type Module type; see `MODULE_TYPES`.
   * @returns {Promise<boolean>} New visible state.
   */
  async togglePresentation(type) {
    // compact (stacked) layout: a visible module off screen is scrolled to, not hidden
    const compact = this.compactMode?.togglePresentation(type);
    if (compact != null) return compact;

    if (!isModuleUsed(this.uiConfigValue, type)) return false;
    const region = this.uiConfigValue.regions[type];

    const module = [...this.modules.values()].find((item) => item.type === type);
    const currentId = this.layout.getModuleForRegion(region);
    const cardinalState = this.layout.cardinal.getState();
    const isVisible = module && cardinalState[region]?.visible && currentId === module.id;

    if (isVisible) {
      // the last visible module stays: hiding it would leave a blank workspace
      const othersVisible = MODULE_TYPES
        .some((other) => other !== type && this.layout.isPresentationVisible(other));
      if (!othersVisible) {
        HMsg.showMsgFlash?.($HR('At least one module must stay visible'));
        this.controlPanel?.refreshPresentationState?.();
        return true;
      }
      this.layout.hideModule(module.id);
      this.controlPanel?.refreshPresentationState?.();
      return false;
    }

    return this.showPresentation(type);
  }

  /**
   * Persists a new toolbar/layout configuration and applies it live: already-created
   * modules whose type moved to a different region are reassigned there; those
   * moved to Unused are destroyed (a tool with unsaved work is confirmed first).
   *
   * @param {object} next Configuration value; see `ExplorerUiConfig`'s shape.
   * @returns {Promise<object|false>} The normalized, persisted configuration; false
   *          when the user kept a tool with unsaved work (the dialog stays open).
   */
  async applyUiConfig(next) {
    const nextRegions = effectiveUiConfig(next || {})?.regions || {};
    const unused = [...this.modules.values()].filter((module) => nextRegions[module.type] === UNUSED_REGION);
    if (unused.some((module) => module.hasUnsavedChanges?.())
      && !globalThis.confirm?.($HR('The report template has unsaved changes. Close it without saving?'))) {
      return false;
    }
    for (const module of unused) await this._removeModule(module.id);

    const previousRegions = this.uiConfigValue.regions;
    const wasSimplified = this.isSimplifiedUI();
    const saved = this.uiConfig.save(next);
    // the simplified interface reaches the modules at start (runtime.simplifiedUI): reload
    if (saved.isSimplifiedUI !== wasSimplified && typeof globalThis.location?.reload === 'function') {
      globalThis.location.reload();
      return saved;
    }
    // the simplified interface applies its own toolbar and layout over the saved value
    const applied = effectiveUiConfig(saved);
    this.uiConfigSaved = saved;
    this.uiConfigValue = applied;
    this.applySimplifiedUI();

    // another interface language or other record view limits: Explorer reloads, and
    // passes them to every module at start
    const language = resolveUiLanguage(saved, this.config.hostLanguage || this.config.language);
    const reload = language !== this.config.language || recordLimitsDiffer(saved.recordLimits, this.config.recordLimits);
    if (reload && typeof globalThis.location?.reload === 'function') {
      globalThis.location.reload();
      return saved;
    }

    const vacatedRegions = new Set();
    for (const module of this.modules.values()) {
      const newRegion = applied.regions[module.type];
      if (!newRegion || newRegion === previousRegions[module.type]) continue;
      const oldRegion = this.layout.getRegionForModule(module.id);
      this.layout.assignModule(module.id, newRegion);
      this.layout.showModule(module.id);
      await module.resize();
      if (oldRegion && oldRegion !== newRegion) vacatedRegions.add(oldRegion);
    }

    // A module left behind as the sole occupant of a vacated pane is now
    // visible for the first time; its presentation engine (map/graph/etc.)
    // needs a resize to render into its now-nonzero container.
    for (const region of vacatedRegions) {
      const promotedId = this.layout.getModuleForRegion(region);
      const promoted = promotedId ? this.modules.get(promotedId) : null;
      if (promoted) await promoted.resize();
    }

    this.controlPanel?.applyToolbarConfig(applied.toolbar);
    this.controlPanel?.applyModuleOrder(applied);
    this.controlPanel?.applyListMode();
    this.compactMode?.refresh();
    this.paneToolbar?.refresh();
    this.controlPanel?.refreshPresentationState?.();
    return saved;
  }

  /**
   * Create, mount and register a tool module (Report, Crosstabs, Actions, Export,
   * Publish). The tool follows DataSource, selection and rules like a presentation.
   *
   * @private
   * @param {object} definition Layout definition for the tool.
   * @returns {Promise<ExplorerToolModule>} The mounted, registered module.
   */
  async _createToolModule(definition) {
    const module = new ExplorerToolModule({
      id: definition.id,
      type: definition.type,
      container: this.layout.createSlot(definition.id, definition.type),
      title: TOOL_TITLES[definition.type],
      create: {
        report: (body) => this._createReportsTool(body),
        export: (body) => this._createExportTool(body)
      }[definition.type] || null
    });
    this.modules.set(definition.id, module);
    await module.mount();
    this.sync.register(module);
    if (this.sync.dataSource) await module.setDataSource(cloneDataSource(this.sync.dataSource));
    if (this.sync.selection.length) await module.setSelection(this.sync.selection);
    return module;
  }

  /**
   * Mount heurist-reports into the Report tool's body. The reports app (and its
   * CodeMirror editor) is loaded only now, by a dynamic import of its public direct
   * entry. Explorer in publication mode has no tools.
   *
   * @private
   * @param {HTMLElement} body Tool body.
   * @returns {Promise<object>} The reports app API (`hasUnsavedChanges`, `destroy`).
   */
  _createReportsTool(body) {
    const mount = this._reportsMounter || mountDirectReports;
    return mount({
      container: body,
      bootstrap: {
        runtime: {
          database: this.config.database,
          apiBaseUrl: this.config.apiBaseUrl,
          baseUrl: this.config.baseUrl,
          accessToken: this.config.accessToken,
          requestHeaders: this.config.requestHeaders,
          language: this.config.language,
          runtimeMode: 'main'
        }
      },
      bridge: this._reportsBridge(),
      assetBaseUrl: this.config.moduleAssetUrls?.reports || null
    });
  }

  /**
   * Create the Export tool (plan 13) in its body: the export form for the current
   * DataSource. Loaded only now (dynamic import, its own chunk). A running export
   * continues on the server when the tool is destroyed and is shown again on the next open.
   *
   * @private
   * @param {HTMLElement} body Tool body.
   * @returns {Promise<object>} The ExportTool.
   */
  async _createExportTool(body) {
    const { ExportTool } = await (this._exportLoader || loadExportTool)();
    const tool = new ExportTool({
      apiClient: this.apiClient,
      getDbDefs: () => this._ensureDbDefs(),
      getDataSource: () => (this.sync?.dataSource ? cloneDataSource(this.sync.dataSource) : null),
      getSelection: () => [...(this.sync?.selection || [])],
      database: this.config.database,
      language: this.config.language
    });
    body.replaceChildren();
    tool.attach(body);
    await tool.render();
    return tool;
  }

  /**
   * Host bridge given to heurist-reports: record editor, current result,
   * selection, Query Sources and users/groups of Explorer.
   *
   * @private
   * @returns {object} Bridge object.
   */
  _reportsBridge() {
    return {
      // report records are system records: Explorer's record editor (plan 14)
      editRecord: (id) => this.editRecord(id),
      addRecord: (rt) => this.addRecord(rt),
      canEditRecords: () => this.canEditRecordType('RT_CUSTOM_REPORT'),
      getCurrentQuery: () => {
        const source = this.sync?.dataSource;
        const query = source ? dataSourceRequest(source)?.q ?? null : null;
        const total = Number(source?.meta?.count);
        return query ? { query, title: source.title || '', total: Number.isFinite(total) ? total : null } : null;
      },
      getSelection: () => [...(this.sync?.selection || [])],
      getQuerySources: () => this.getQuerySources().map((item) => ({
        id: item.id, title: item.title, parametrized: item.parametrized === true || item.kind === 'parametrized'
      })),
      getUserGroups: () => this.userGroups?.data || null
    };
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
      // system records in Explorer's record editor, other records in the host editor
      editRecord: (id, options) => this.editRecord(id, options),
      // modules show edit actions only when the outer host can really edit
      canEditRecords: () => this.canEditRecords(),
      canEditRecordType: (recordType) => this.canEditRecordType(recordType),
      // shown in Explorer's own Record view; see viewRecord()
      viewRecord: (id) => this.viewRecord(id),
      addRecord: (rt) => this.addRecord(rt),
      // the record manager (plan 21): Select records of some types in a dialog
      browseRecords: (options) => this.recordEditing.browseRecords(options),
      // same draw-mode Map dialog as the Filter Builder extent picker;
      // the outer host editor is only a fallback without a Map module URL
      editExtent: (value, options) => (this.config.moduleUrls?.map
        ? this.selectFilterExtent(value)
        : bridge.editExtent?.(value, options)),
      // expansion rules of the active DataSource, edited in Explorer's own dialog
      editRules: () => this.editDataSourceRules(),
      updateRules: (rules) => this.updateDataSourceRules(rules),
      canEditRules: () => this.canEditRules(),
      describeRules: (rules) => bridge.describeRules?.(rules),
      editFieldset: (value, options) => bridge.editFieldset?.(value, options),
      zoomToExtent: (wkt) => this.zoomActiveMapToExtent(wkt),
      // symbol / thematic map / image filter editors in Explorer's window, not in the
      // module's iframe (2026-10-14); the module saves the result itself
      editSymbology: (value, options) => this.recordEditing.symbology.edit(value, options),
      // a module's manual in Explorer's window (InlineHelp of the module, useHostHelp)
      openHelp: (request) => this.openModuleHelp(request),
      getHostContext: () => ({
        name: 'heurist-explorer', runtimeMode: 'main', hasMapModule: this.hasActiveMapModule()
      }),
      showDatasource: (source, options) => this.showDatasource(source, options),
      // module request monitors report to Explorer's monitor (trace, Stop)
      registerRequestMonitor: (monitor) => this.requestMonitor.attachChild(monitor)
    };
  }

  /**
   * Stop every running data request of Explorer and all modules. Fetches are
   * aborted and the server is asked to stop the running SQL.
   *
   * @returns {string[]} Request ids that were stopped.
   */
  stopAllQueries() {
    return this.requestMonitor?.abortAll() || [];
  }

  /**
   * Show the rail Stop button while requests run. It appears after a short
   * delay so quick queries do not make it flicker.
   *
   * @private
   * @returns {void}
   */
  _bindRunningQueries() {
    const rail = this.controlPanel?.leftRail;
    if (!rail || !this.requestMonitor) return;
    let timer = null;
    const update = () => {
      const count = this.requestMonitor.inFlightCount;
      if (!count) {
        clearTimeout(timer);
        timer = null;
        rail.setRunningQueries(0);
        return;
      }
      if (rail.isShowingRunningQueries()) {
        rail.setRunningQueries(count, () => this.stopAllQueries());
        return;
      }
      timer ??= setTimeout(() => {
        timer = null;
        const current = this.requestMonitor.inFlightCount;
        rail.setRunningQueries(current, () => this.stopAllQueries());
      }, RUNNING_QUERY_DELAY);
    };
    this.requestMonitor.addEventListener('change', update);
  }

  /** @returns {boolean} Whether presentations may edit the active DataSource's rules (authoring is available). */
  canEditRules() {
    return Boolean(this.querySourcePanel && this.sync?.dataSource);
  }

  /**
   * Open the Expansion rules dialog for the active DataSource and apply the result.
   *
   * @returns {Promise<Array<object>|null>} Applied rules, or `null` when cancelled or unchanged.
   */
  async editDataSourceRules() {
    const source = this.sync?.dataSource;
    if (!this.canEditRules()) return null;
    const dbdefs = await this._ensureDbDefs();
    const current = source.request?.rules || [];
    const builder = new HRuleBuilder({ dbdefs, lang: this.config.language });
    const rules = await builder.setRules(current).open({ dataSource: cloneDataSource(source) });
    if (rules == null || JSON.stringify(rules) === JSON.stringify(current)) return null;
    return this.updateDataSourceRules(rules);
  }

  /**
   * Replace the active DataSource's expansion rules: described, pushed to the
   * presentations that use rules (no reload) and into the Query Source draft,
   * which becomes dirty so the author can save it.
   *
   * @param {Array<object>} rules New expansion rules.
   * @returns {Promise<Array<object>|null>} Applied rules, or `null` when rules can't be edited.
   */
  async updateDataSourceRules(rules) {
    if (!this.canEditRules() || !Array.isArray(rules)) return null;
    const dbdefs = await this._ensureDbDefs();
    const described = rules.map((rule) => (rule?.name ? rule : { ...rule, ...describeExpansionRule(rule, dbdefs) }));
    this.querySourcePanel?.setRules(described);
    await this.sync.setRules(described);
    return structuredClone(described);
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
      this._dbDefsPromise = HDbDefs.load(url, { lang: this.config.language }).then((dbdefs) => {
        this._dbDefs = dbdefs;
        return dbdefs;
      }, (error) => {
        this._dbDefsPromise = null;
        throw error;
      });
    }
    return this._dbDefsPromise;
  }

  /**
   * Map drawing, query editor and query description (EditorServices, plan 21 Phase 6:
   * shared with the editor mode).
   *
   * @returns {EditorServices}
   */
  get editorServices() {
    this._editorServices ??= new EditorServices({
      config: this.config,
      apiClient: () => this.apiClient,
      ensureDbDefs: () => this._ensureDbDefs(),
      getDbDefs: () => this._dbDefs || null,
      hostActions: () => this._hostActions()
    });
    return this._editorServices;
  }

  /**
   * A query in words for titles, e.g. 'Find Persons where Gender is not "Male"';
   * `''` when it cannot be described.
   *
   * @private
   * @param {*} q Query (array, object or text).
   * @returns {string}
   */
  _describeQuery(q) {
    return this.editorServices.describeQuery(q);
  }

  /** Open HFilterBuilder as a value editor and resolve with its JSON query, or null on cancel. */
  async _editQueryWithBuilder(query, filterForm = null, selectExtent = (current) => this.selectFilterExtent(current)) {
    return this.editorServices.editQuery(query, filterForm, selectExtent);
  }

  /**
   * Draw a filter extent in the dedicated Map dialog (EditorServices).
   *
   * @param {object|null} current Existing bounds, used to seed the drawn rectangle.
   * @returns {Promise<object|null>} West/south/east/north bounds, or null on cancel.
   */
  async selectFilterExtent(current = null) {
    return this.editorServices.selectFilterExtent(current);
  }

  /**
   * Draw a geometry for a geo field of an edit form (EditorServices).
   *
   * @param {string|object|null} current Existing WKT or GeoJSON, drawn first.
   * @param {{allowMultiple?: boolean}} [options] Several objects in one value.
   * @returns {Promise<{type: string, wkt: string, geojson: object}|null>} The drawing, or null on cancel.
   */
  async selectGeometry(current = null, options = {}) {
    return this.editorServices.selectGeometry(current, options);
  }

  /**
   * Whether a Map module is currently mounted in the active layout (not the
   * hidden dedicated instance of EditorServices used for drawing).
   *
   * @returns {boolean} Whether at least one mounted layout module is a ready Map instance.
   */
  hasActiveMapModule() {
    return [...this.modules.values()].some((module) => module.type === 'map' && module.api);
  }

  /**
   * Zoom the active layout's Map module to a WKT geometry's (or an extent's) bounds.
   *
   * @param {string|object} wkt WKT geometry text, or a `{west,south,east,north}` extent.
   * @returns {Promise<boolean>} Whether the map viewport was changed.
   */
  async zoomActiveMapToExtent(wkt) {
    const module = [...this.modules.values()].find((item) => item.type === 'map' && item.api);
    const bounds = isExtent(wkt) ? wkt : extentFromWkt(wkt);
    if (!module || !bounds) return false;
    await module.api.fitBounds(bounds);
    return true;
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
      activeMapDocument: this.sync.activeMapDocument,
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
    await this._editorServices?.destroy();
    this._editorServices = null;
    this.compactMode?.destroy();
    this.paneToolbar?.destroy();
    this.compactMode = null;
    await Promise.all([...this.modules.values()].map((module) => module.destroy()));
    this.modules.clear();
    this.sync.destroy();
    void this.querySourcePanel?.destroy?.();
    this.querySourcePanel = null;
    void this.queryTracePanel?.destroy?.();
    this.queryTracePanel = null;
    this.layout?.destroy();
    this.authoringDock?.destroy();
    this.authoringDock = null;
    this.savedFilters?.destroy?.();
    this.recordTypes?.destroy?.();
    this.querySources?.destroy?.();
    this.controlPanel?.destroy?.();
  }
}

/** Load and mount heurist-data's direct (same-realm) bootstrap for `direct` module mode. */
async function mountDirectData(options) {
  const { mountHeuristData } = await import('../../../data/src/direct.js');
  return mountHeuristData(options);
}

/** Load the Export tool (its own lazy chunk). */
function loadExportTool() {
  return import('../tools/export/ExportTool.js');
}

/** Load and mount heurist-reports' direct bootstrap into the Reports tool. */
async function mountDirectReports(options) {
  const { mountHeuristReports } = await import('../../../reports/src/direct.js');
  return mountHeuristReports(options);
}

/** Load and mount heurist-recordview's direct (same-realm) bootstrap for `direct` module mode. */
async function mountDirectRecordView(options) {
  const { mountHeuristRecordView } = await import('../../../recordview/src/direct.js');
  return mountHeuristRecordView(options);
}

/** Direct-mode bootstraps, keyed by module type. Only types listed here support `mode: 'direct'`. */
const DIRECT_MOUNTERS = {
  data: mountDirectData,
  recordview: mountDirectRecordView
};

/** Header captions of the tool modules. */
const TOOL_TITLES = {
  report: 'Custom reports manager and editor',
  crosstabs: 'Crosstabs / Charts',
  actions: 'Actions Dashboard',
  export: 'Export records',
  publish: 'Publish'
};

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
    .filter((item) => item && ['data', 'map', 'timeline', 'graph', 'recordview'].includes(item.type))
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

function queryDefined(q) { return q != null && (typeof q !== 'string' || q.trim().length > 0); }

/**
 * Whether a host bridge action can be used: the action exists and the bridge's
 * `can…()` check answers true. A bridge without the check cannot prove it
 * (e.g. an older cached host script), so the action is not offered.
 *
 * @param {object|null} bridge Host bridge.
 * @param {string} action Action name (e.g. `editRecord`).
 * @param {string} check Check name (e.g. `canEditRecords`).
 * @returns {boolean} Whether the action is usable.
 */
function hostCan(bridge, action, check) {
  if (typeof bridge?.[action] !== 'function') return false;
  if (typeof bridge[check] !== 'function') return false;
  try {
    return bridge[check]() === true;
  } catch {
    return false;
  }
}

/** Milliseconds a request must run before the rail shows the Stop button. */
const RUNNING_QUERY_DELAY = 300;

/** localStorage key of the query trace switch (per browser). */
const TRACE_PREFERENCE_KEY = 'heurist-explorer-query-trace';
/** localStorage key of the query trace pane being open (per browser). */
const TRACE_SHOWN_KEY = 'heurist-explorer-query-trace-shown';

/** @returns {boolean} Whether the query trace pane was left open in this browser. */
function readTraceShown() {
  try {
    return globalThis.localStorage?.getItem(TRACE_SHOWN_KEY) === '1';
  } catch {
    return false;
  }
}

/** @param {boolean} shown Remember whether the query trace pane is open in this browser. */
function writeTraceShown(shown) {
  try {
    globalThis.localStorage?.setItem(TRACE_SHOWN_KEY, shown ? '1' : '0');
  } catch {
    // storage blocked: the pane is not reopened next time
  }
}

/** @returns {boolean} Whether the query trace was switched on in this browser. */
function readTracePreference() {
  try {
    return globalThis.localStorage?.getItem(TRACE_PREFERENCE_KEY) === '1';
  } catch {
    return false;
  }
}

/** @param {boolean} enabled Remember the query trace switch in this browser. */
function writeTracePreference(enabled) {
  try {
    globalThis.localStorage?.setItem(TRACE_PREFERENCE_KEY, enabled ? '1' : '0');
  } catch {
    // storage blocked: the switch is not remembered
  }
}
