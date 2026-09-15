/**
 * @file TimelineDocumentApplication.js
 * @brief Extends TimelineApplication with Heurist MapDocument-based document/layer
 *        organization shared with the map application.
 * @todo merge with TimelineApplication
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

import { TimelineApplication } from './TimelineApplication.js';
import { TemporalAdapter } from './TemporalAdapter.js';
import { loadMapRecord } from '#shared/data/MapRecordProvider.js';
import { MapDocumentListProvider } from '#shared/data/MapDocumentListProvider.js';
import { RecordTypeProvider } from '#shared/data/RecordTypeProvider.js';
import { normalizeRuntimeDataSource, uniqueDataSources, stableHash, dataSourceFromLayerDefinition } from '#shared/data/DocumentDataSources.js';

/** Document organization shared with map, with temporal loading and local band visibility. */
export class TimelineDocumentApplication extends TimelineApplication {
  /**
   * @param {object} options Application dependencies, forwarded to {@link TimelineApplication}.
   * @param {object} options.apiClient Heurist API client used to load MapDocuments/MapLayers.
   */
  constructor(options) {
    super(options);
    this.apiClient = options.apiClient;
    this.documents = new Map([['dynamic', { id: 'dynamic', title: 'Workspace', persistent: false, loadState: 'loaded' }]]);
    this.activeDocumentId = 'dynamic';
    this.currentDataSource = null;
    this.workspaceDataSources = [];
    this.activeDataSourceKey = null;
    this.activeLayerId = null;
    this.documentBands = new Map();
    this.activationSerial = 0;
    this.listProvider = new MapDocumentListProvider({ apiClient: this.apiClient, recordTypes: new RecordTypeProvider({ apiClient: this.apiClient }) });
  }

  /**
   * Keep the legacy context API usable in standalone timelines.
   *
   * @param {Array<object>} contexts Raw context definitions.
   * @param {{preserveSelection?: boolean}} [options] Set `preserveSelection` to keep the current selection instead of clearing it.
   * @returns {Promise<object>} Updated application state.
   */
  async setContexts(contexts, { preserveSelection = false } = {}) {
    this.cancelBandLoads();
    this.contexts = (contexts || []).filter((context) => context.query || context.ids?.length).map((context, index) => ({
      ...context, id: String(context.id ?? `context-${index + 1}`), title: context.title || `Band ${index + 1}`,
      visible: context.visible !== false, options: context.options || {}, items: [], loadState: 'deferred'
    }));
    this.documentBands.set(this.activeDocumentId, this.contexts);
    if (!preserveSelection) this.selection = [];
    await this.loadVisibleBands({ fit: true });
    return this.getState();
  }

  /**
   * Initialize the timeline engine/host, then activate the startup MapDocument or a
   * restored state instead of the base class's plain context list.
   *
   * @returns {Promise<TimelineDocumentApplication>} This application instance, once ready.
   */
  async initialize() {
    const source = this.config.source || {};
    // The document controller owns startup loading; retain legacy standalone contexts.
    this.config.source = { ...source, contexts: [] };
    await super.initialize();
    this.config.source = source;
    const legacy = (source.contexts || []).map((context) => ({ ...context, loadState: 'deferred', items: [] }));
    this.documentBands.set('dynamic', legacy);
    if (this.config.explorerHost || !legacy.length) this.rebuildDynamicBands();
    if (this.apiClient.isConfigured?.()) {
      try { await this.loadMapDocuments(this.config.documents?.query); }
      catch (error) { this.dispatch('heurist-timeline-error', { error }); }
    }
    if (this.config.explorerHost) {
      this.workspaceDataSources = uniqueDataSources(await this.host.bridge?.getWorkspaceDataSources?.() || []);
      this.rebuildDynamicBands();
    }
    const state = this.config.initialState;
    if (state?.activeDocumentId != null || state?.currentDataSource || state?.workspaceDataSources) await this.restoreState(state);
    else await this.activateMapDocument(this.config.documents?.initiallyActive || 'dynamic', { force: true });
    return this;
  }

  /**
   * Return lightweight available MapDocument entries, including the predefined dynamic document.
   *
   * @returns {Array<object>} Available MapDocument entries, each flagged with `active`.
   */
  getMapDocuments() {
    return [...this.documents.values()].map((document) => ({ ...document, active: String(document.id) === this.activeDocumentId }));
  }

  /**
   * Return the active lightweight MapDocument entry.
   *
   * @returns {object|undefined} The active MapDocument entry.
   */
  getActiveMapDocument() { return this.getMapDocuments().find((document) => document.active); }

  /**
   * Return the predefined dynamic ("Workspace") MapDocument entry.
   *
   * @returns {object|undefined} The dynamic MapDocument entry.
   */
  getDynamicDocument() { return this.getMapDocuments().find((document) => document.id === 'dynamic'); }

  /**
   * Load a lightweight list of available MapDocuments and replace the tracked document map.
   *
   * @param {*} [query] Optional MapDocument query filter.
   * @returns {Promise<Array<object>>} Available MapDocument entries after reloading.
   */
  async loadMapDocuments(query = null) {
    const result = await this.listProvider.search(query);
    const dynamic = this.documents.get('dynamic');
    this.documents = new Map([['dynamic', dynamic], ...result.items.map((item) => [String(item.id), { ...item, persistent: true, loadState: 'available' }])]);
    this.dispatch('heurist-timeline-documents-changed', {});
    return this.getMapDocuments();
  }

  /**
   * Activate one mutually exclusive MapDocument, loading its layers as temporal bands when needed.
   *
   * @param {*} documentId MapDocument id to activate (or `'dynamic'` for the Workspace document).
   * @param {{force?: boolean}} [options] Set `force` to reload the document even when it is already active.
   * @returns {Promise<object|null>} The activated MapDocument entry, or `null` when superseded by a later activation.
   * @throws {*} Rethrows the load error after recording it on the document entry, unless the activation was superseded/aborted.
   */
  async activateMapDocument(documentId, { force = false } = {}) {
    const id = String(documentId);
    if (!force && id === this.activeDocumentId && this.contexts === this.documentBands.get(id)) return this.getActiveMapDocument();
    const serial = ++this.activationSerial;
    this.activationController?.abort();
    const controller = new AbortController();
    this.activationController = controller;
    let entry = this.documents.get(id);
    if (!entry) {
      entry = { id: Number(id), title: `Map document ${id}`, persistent: true };
      this.documents.set(id, entry);
    }
    for (const document of this.documents.values()) document.activating = false;
    entry.activating = true;
    entry.error = null;
    this.dispatch('heurist-timeline-document-activating', { document: entry });
    try {
      if (id === 'dynamic') {
        if (this.config.explorerHost || !this.documentBands.has(id)) this.rebuildDynamicBands();
      } else if (force || !this.documentBands.has(id)) {
        const document = await loadMapRecord(this.apiClient, 'document', id, { signal: controller.signal });
        const references = [...(document.layers || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
        const bands = await Promise.all(references.map(async (reference, index) => {
          const recordId = Number(reference.recordId ?? reference.id ?? reference);
          const layer = await loadMapRecord(this.apiClient, 'layer', recordId, { signal: controller.signal });
          // Raster and external geographic layers cannot supply temporal records.
          const source = layer.options?.dataSource || dataSourceFromLayerDefinition(layer);
          if (!source) return null;
          return this.bandFromSource(source, `map-layer-${recordId}-${index}`, {
            recordId, title: reference.title || layer.title || source.title,
            visible: reference.visible !== false && layer.visible !== false
          });
        }));
        if (serial !== this.activationSerial) return null;
        entry.title = document.title;
        this.documentBands.set(id, bands.filter(Boolean));
      }
      if (serial !== this.activationSerial) return null;
      this.cancelBandLoads();
      this.activeDocumentId = id;
      this.contexts = this.documentBands.get(id) || [];
      entry.activating = false;
      entry.loadState = 'loaded';
      this.dispatch('heurist-timeline-document-activated', { document: this.getActiveMapDocument() });
      await this.renderBands();
      this.applySavedVisibility();
      await this.loadVisibleBands({ fit: true });
      return this.getActiveMapDocument();
    } catch (error) {
      if (serial !== this.activationSerial || controller.signal.aborted) return null;
      entry.activating = false;
      entry.loadState = 'error';
      entry.error = { message: error.message };
      this.dispatch('heurist-timeline-error', { error });
      throw error;
    }
  }

  /**
   * Build a temporal band descriptor from a DataSource snapshot.
   *
   * @param {object} source DataSource snapshot (query/request, timeline presentation profile).
   * @param {string} id Band id.
   * @param {object} [overrides] Fields merged over the derived band (e.g. `recordId`, `title`, `visible`).
   * @returns {object} The band descriptor.
   */
  bandFromSource(source, id, overrides = {}) {
    const profile = source?.presentation?.timeline || {};
    return {
      id, title: source?.title || 'Current result', query: source?.request?.q ?? null,
      request: structuredClone(source?.request || {}), timefields: profile.timefields ?? profile.timeFields ?? null,
      fields: profile.fields || [], visible: profile.visible !== false, options: { ...profile, dataSource: source },
      loadState: 'deferred', items: [], ...overrides
    };
  }

  /**
   * Rebuild the dynamic ("Workspace") document's bands from the current/workspace DataSources,
   * reusing existing band state (visibility, loaded items) when a band's request is unchanged.
   *
   * @returns {void}
   */
  rebuildDynamicBands() {
    const previous = this.documentBands.get('dynamic') || [];
    const current = previous.find((band) => band.id === 'current-results');
    const desired = [this.bandFromSource(this.currentDataSource, 'current-results', {
      visible: current?.visible ?? true, emptyStub: !this.currentDataSource
    }), ...this.workspaceDataSources.map((source) => this.bandFromSource(source, `workspace-${stableHash(source.reference.key)}`, { workspaceEntry: true }))];
    const bands = desired.map((band) => {
      const old = previous.find((item) => item.id === band.id);
      if (old && JSON.stringify([old.request, old.timefields, old.fields]) === JSON.stringify([band.request, band.timefields, band.fields])) {
        return Object.assign(old, { title: band.title, options: band.options, workspaceEntry: band.workspaceEntry });
      }
      if (old) band.visible = band.workspaceEntry
        ? (band.options.visible ?? old.visible) : old.visible;
      return band;
    });
    this.documentBands.set('dynamic', bands);
    if (this.activeDocumentId === 'dynamic') this.contexts = bands;
  }

  /**
   * Replace the current/Workspace DataSource snapshot without activating another document.
   *
   * @param {{currentDataSource?: object, workspaceDataSources?: Array<object>}} [value] Partial DataSource snapshot update.
   * @returns {Promise<object|undefined>} The dynamic MapDocument entry.
   */
  async setDynamicDataSources(value = {}) {
    if (Object.hasOwn(value, 'workspaceDataSources')) this.workspaceDataSources = uniqueDataSources(value.workspaceDataSources);
    if (Object.hasOwn(value, 'currentDataSource')) {
      const source = normalizeRuntimeDataSource(value.currentDataSource);
      const key = source?.reference.key || null;
      const matching = key && this.contexts.find((band) => band.id !== 'current-results' && band.options?.dataSource?.reference.key === key);
      const workspace = key && this.workspaceDataSources.some((item) => item.reference.key === key);
      this.activeDataSourceKey = key;
      this.activeLayerId = matching?.id || null;
      if (!matching && !workspace) this.currentDataSource = source;
    }
    if (this.activeDocumentId === 'dynamic') this.cancelBandLoads();
    this.rebuildDynamicBands();
    this.dispatch('heurist-timeline-documents-changed', {});
    if (this.activeDocumentId === 'dynamic') {
      await this.renderBands();
      await this.loadVisibleBands();
    }
    return this.getDynamicDocument();
  }

  /**
   * Abort every in-flight band request and reset any `loading` band back to `deferred`.
   *
   * @returns {void}
   */
  cancelBandLoads() {
    ++this.generation;
    for (const controller of this.abortControllers.values()) controller.abort();
    this.abortControllers.clear();
    for (const bands of this.documentBands.values()) for (const band of bands) if (band.loadState === 'loading') band.loadState = 'deferred';
  }

  /**
   * Load every visible, not-yet-loaded band of the active document, then re-render.
   *
   * @param {{fit?: boolean}} [options] Set `fit` to zoom the viewport to the newly rendered items.
   * @returns {Promise<void>} Resolves once loading and rendering complete.
   */
  async loadVisibleBands({ fit = false } = {}) {
    const generation = this.generation;
    await Promise.all(this.contexts.filter((band) => band.visible && !band.emptyStub && band.loadState === 'deferred').map((band) => this.loadBand(band)));
    if (generation === this.generation) await this.renderBands({ fit });
  }

  /**
   * Load one band's temporal records and convert them into timeline items.
   *
   * @param {object} band Band descriptor (mutated in place with its load state/items/error).
   * @returns {Promise<void>} Resolves once the load attempt completes.
   */
  async loadBand(band) {
    const controller = new AbortController();
    this.abortControllers.get(band.id)?.abort();
    this.abortControllers.set(band.id, controller);
    band.loadState = 'loading';
    this.dispatch('heurist-timeline-layer-state-changed', {});
    try {
      const response = await this.provider.load({ ...band.request, ...band, signal: controller.signal });
      if (controller.signal.aborted || !this.contexts.includes(band)) return;
      band.response = response;
      band.items = TemporalAdapter.convertContext(band, response);
      band.loadState = 'loaded';
      band.error = null;
    } catch (error) {
      if (controller.signal.aborted) return;
      band.loadState = 'error';
      band.error = { message: error.message };
    } finally {
      if (this.abortControllers.get(band.id) === controller) this.abortControllers.delete(band.id);
      this.dispatch('heurist-timeline-layer-state-changed', {});
    }
  }

  /**
   * Push the active document's visible, loaded bands and their items into the rendering engine.
   *
   * @param {{fit?: boolean}} [options] Set `fit` to zoom the viewport to the rendered items.
   * @returns {Promise<void>} Resolves once the engine has rendered the update.
   */
  async renderBands({ fit = false } = {}) {
    const visible = this.contexts.filter((band) => band.visible && band.items?.length);
    await this.engine.setData({
      groups: visible.map((band, order) => ({ id: band.id,
        content: `<span data-timeline-band="${escapeHtml(band.id)}">${escapeHtml(band.title)}</span>`, order })),
      items: visible.flatMap((band) => band.items), fit
    });
    await this.engine.setSelection(this.selection, { zoom: false });
    this.dispatch('heurist-timeline-layer-state-changed', {});
  }

  /**
   * Return all bands of the active document in the layer-panel shape, including load state
   * and which one (if any) is the active DataSource's "showing" layer.
   *
   * @returns {Array<object>} Layer-panel-shaped band descriptions.
   */
  getLayers() {
    const preferred = this.contexts.find((band) => band.id === this.activeLayerId && band.options?.dataSource?.reference.key === this.activeDataSourceKey)
      || this.contexts.find((band) => band.id !== 'current-results' && band.options?.dataSource?.reference.key === this.activeDataSourceKey);
    return this.contexts.map((band) => ({
      id: band.id, title: band.title, recordId: band.recordId, visible: band.visible, loadState: band.loadState,
      error: band.error, count: band.items?.length || 0, emptyStub: band.emptyStub,
      partial: band.response?.pagination?.hasMore === true || band.response?.pagination?.isPartial === true
        || Number(band.response?.pagination?.total) > Number(band.response?.records?.length),
      options: band.options, workspaceEntry: band.workspaceEntry,
      activeDataSource: Boolean(this.activeDataSourceKey && band.options?.dataSource?.reference.key === this.activeDataSourceKey && (!preferred || preferred.id === band.id))
    }));
  }

  /**
   * Show or hide one band, persisting the change for workspace-linked bands and (re)loading as needed.
   *
   * @param {*} id Band id.
   * @param {boolean} visible Whether the band should be visible.
   * @returns {Promise<void>} Resolves once the visibility change has been applied.
   */
  async setLayerVisibility(id, visible) {
    const band = this.contexts.find((item) => item.id === id);
    if (!band) return;
    band.visible = Boolean(visible);
    if (band.workspaceEntry && band.options?.dataSource) {
      const source = structuredClone(band.options.dataSource);
      source.presentation ||= {};
      source.presentation.timeline = { ...(source.presentation.timeline || {}), visible: band.visible };
      await this.host.bridge?.updateDataSourceInWorkspace?.(source);
    }
    if (!visible && band.loadState === 'loading') {
      this.abortControllers.get(id)?.abort();
      band.loadState = 'deferred';
    }
    await this.renderBands();
    if (visible) await this.loadVisibleBands();
  }

  /**
   * Mark a band's DataSource as the active one and ask the host to show its underlying data.
   *
   * @param {*} id Band id.
   * @returns {Promise<boolean|*>} `false` when the band has no DataSource; otherwise the host's result.
   */
  async showLayerDataSource(id) {
    const band = this.contexts.find((item) => item.id === id);
    const source = band?.options?.dataSource;
    if (!source) return false;
    this.activeDataSourceKey = source.reference.key;
    this.activeLayerId = id;
    this.dispatch('heurist-timeline-documents-changed', {});
    if (band.visible) this.engine.scrollToBand?.(id);
    return this.host.bridge?.showDatasource?.(source);
  }

  /**
   * Reload one band's temporal records and re-render.
   *
   * @param {*} id Band id.
   * @returns {Promise<void>} Resolves once the band has reloaded.
   */
  async reloadLayer(id) {
    const band = this.contexts.find((item) => item.id === id);
    if (band) { band.loadState = 'deferred'; await this.loadBand(band); await this.renderBands(); }
  }

  /**
   * Reload every band of the active document from its source payload.
   *
   * @returns {Promise<void>} Resolves once all visible bands have reloaded.
   */
  async refresh() { for (const band of this.contexts) band.loadState = 'deferred'; await this.loadVisibleBands(); }

  /**
   * Request host editing of a persisted MapDocument record, then reactivate it.
   *
   * @param {*} id MapDocument id.
   * @returns {Promise<object|null>} The reactivated MapDocument entry.
   */
  async requestEditMapDocument(id) { await this.host.editRecord(id); return this.activateMapDocument(id, { force: true }); }

  /**
   * Request host editing of a persisted MapLayer record, then reactivate the owning document.
   *
   * @param {*} id Band id.
   * @returns {Promise<void>} Resolves once editing and reactivation complete.
   */
  async requestEditLayer(id) {
    const band = this.contexts.find((item) => item.id === id);
    if (band?.recordId) { await this.host.editRecord(band.recordId); await this.activateMapDocument(this.activeDocumentId, { force: true }); }
  }

  /**
   * Return the current serialized application state, including document/DataSource selection
   * and per-document band visibility.
   *
   * @returns {object} Current application state.
   */
  getState() {
    return { ...super.getState(), activeDocumentId: this.activeDocumentId, currentDataSource: this.currentDataSource,
      workspaceDataSources: this.workspaceDataSources, activeDataSourceKey: this.activeDataSourceKey,
      bandVisibility: { ...this.savedBandVisibility, ...Object.fromEntries([...this.documentBands].map(([id, bands]) => [id, Object.fromEntries(bands.map((band) => [band.id, band.visible]))])) },
      range: this.engine.getRange?.() };
  }

  /**
   * Restore a previously captured application state (DataSources, active document, band
   * visibility, selection, and viewport range).
   *
   * @param {object} state Previously captured state.
   * @returns {Promise<void>} Resolves once the state has been restored.
   */
  async restoreState(state) {
    this.currentDataSource = state.currentDataSource || null;
    this.workspaceDataSources = uniqueDataSources(state.workspaceDataSources || this.workspaceDataSources);
    this.activeDataSourceKey = state.activeDataSourceKey || null;
    this.savedBandVisibility = structuredClone(state.bandVisibility || {});
    this.rebuildDynamicBands();
    await this.activateMapDocument(state.activeDocumentId || 'dynamic', { force: true });
    for (const band of this.contexts) {
      const visible = state.bandVisibility?.[this.activeDocumentId]?.[band.id];
      if (typeof visible === 'boolean') band.visible = visible;
    }
    this.selection = state.selection || [];
    await this.loadVisibleBands();
    if (state.range) this.engine.setRange?.(state.range);
  }
  /**
   * Apply and consume the saved band visibility for the active document, if any was restored.
   *
   * @returns {void}
   */
  applySavedVisibility() {
    const saved = this.savedBandVisibility?.[this.activeDocumentId];
    if (!saved) return;
    for (const band of this.contexts) if (typeof saved[band.id] === 'boolean') band.visible = saved[band.id];
    delete this.savedBandVisibility[this.activeDocumentId];
  }

  /**
   * Abort any in-flight activation/band loads and tear down the base application.
   *
   * @returns {Promise<void>} Resolves once teardown completes.
   */
  async destroy() { this.activationController?.abort(); this.cancelBandLoads(); await super.destroy(); }
}

/**
 * Escape HTML so content inserted in band group labels stays safe.
 *
 * @param {string} value Raw text.
 * @returns {string} Safe HTML string.
 */
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
