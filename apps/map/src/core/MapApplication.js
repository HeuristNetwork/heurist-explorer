import { normalizeRuntimeDataSource, uniqueDataSources, stableHash, dataSourceFromLayerDefinition } from '#shared/data/DocumentDataSources.js';
/**
 * @file MapApplication.js
 * @brief Engine-neutral map controller coordinating map initialization, MapDocument
 *        loading, layer preparation, rendering, application state, cancellation, and
 *        public map operations.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-map
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { normalizeMapDocument } from './MapDocument.js';
import { normalizeMapLayer, reapplyMapLayerDefaults } from './MapLayer.js';
import { createMapEnvironment } from './createMapEnvironment.js';
import { normalizeMapConfigurationSettings } from '../ui/config/mapConfigurationSchema.js';
import { getDefaultBaseMaps } from '../basemaps/defaultBasemaps.js';
import { activateThematicMap } from '../thematic/thematicAttributes.js';
import { normalizePopupMode } from '../data/PopupProvider.js';
import { DEFAULT_MAP_SYMBOL, normalizeMapSymbol } from '../utils/normalizeMapSymbol.js';

/**
 * Engine-neutral application controller.
 */
export class MapApplication {
  /**
   * Create the application controller and its predefined dynamic MapDocument.
   *
   * @param {Object} options Constructor options.
   * @param {HTMLElement} options.container DOM element hosting the map.
   * @param {Object} options.config Engine-neutral application configuration.
   * @param {Object} options.mapEngine Concrete {@link MapEngineAdapter} implementation.
   * @param {Object} options.host Host integration adapter.
   * @param {Object} [options.providers={}] Data providers (MapDocument, MapLayer, etc).
   * @param {Object} options.layerLoaders Loader registry used to prepare runtime layers.
   */
  constructor({ container, config, mapEngine, host, providers = {}, layerLoaders }) {
    this.container = container;
    this.config = config;
    this.mapEngine = mapEngine;
    this.host = host;
    this.providers = providers;
    this.layerLoaders = layerLoaders;
    this.layers = new Map();
    this.deferredLayers = new Map();
    this.pendingLayerLoads = new Map();
    this.layerLoadGeneration = 0;
    this.initialized = false;
    this.destroyed = false;
    this.activeLoadController = null;
    this.documentActivationSerial = 0;
    this.defaultBaseMapId = config.baseMaps?.[0]?.id || null;
    this.mapDocuments = new Map();
    this.activeMapDocumentId = null;
    this.controlPanel = null;
    this.baseMaps = new Map((config.baseMaps || []).map((item) => [String(item.id), clonePlain(item)]));
    const initialBaseMap = findBaseMapByName(this.baseMaps, config.mapDocument?.worldBaseMap?.label)
      || this.baseMaps.get(String(this.defaultBaseMapId));
    this.activeBaseMapId = initialBaseMap?.id ?? null;
    this.selectionLayerId = null;
    this.selectedFeatures = new Map();
    this.runtimeLayerSerial = 0;
    this.dynamicRefreshTimer = null;
    this.dynamicRefreshController = null;
    this.dynamicRefreshSerial = 0;
    this.dynamicRefreshDelay = 250;
    this.dynamicRequestKeys = new Map();
    this.dynamicDocumentId = String(config.dynamicDocument?.id || 'dynamic');
    this.currentDataSource = null;
    this.activeDataSourceKey = null;
    this.activeDataSourceLayerId = null;
    this.dataSourceUpdateQueue = Promise.resolve();
    this.workspaceDataSources = [];
    this.hasExplorerDataSourceSnapshot = false;
    this.initializeDynamicDocument();

    // When Filtered Result is the configured startup document, initialize the
    // engine from its real document-specific environment immediately. Previously
    // the synthetic empty MapDocument was initialized first, so dynamic min/max
    // zoom settings were skipped until applyConfiguration() ran.
    const initialDocument = this.activeMapDocumentId === this.dynamicDocumentId
      ? createDynamicMapDocument(this.config, this.getDynamicDocumentEntry())
      : config.mapDocument;
    this.mapEnvironment = createMapEnvironment(initialDocument, config.defaults);
    this.mapEnvironment.baseMap = findBaseMapByName(this.baseMaps, initialDocument?.worldBaseMap?.label)
      || this.baseMaps.get(String(this.defaultBaseMapId))
      || null;
  }

  /**
   * Create the predefined non-persistent MapDocument entry.
   *
   * @returns {void}
   */
  initializeDynamicDocument() {
    if (this.config.dynamicDocument?.enabled === false) return;
    const active = String(this.config.documents?.initiallyActive) === this.dynamicDocumentId;
    this.mapDocuments.set(this.dynamicDocumentId, {
      id: this.dynamicDocumentId,
      kind: 'dynamic',
      persistent: false,
      title: this.config.dynamicDocument?.title || 'Dynamic map',
      active,
      activating: false,
      loadState: active ? 'loaded' : 'available',
      error: null,
      showInPanel: this.config.ui?.showCurrentDocument === true,
      layerDefinitions: (this.config.dynamicDocument?.layers || []).map((definition, index) => {
        const requestedRuntimeId = definition.runtimeId ?? definition.id ?? null;
        const mapLayer = normalizeMapLayer({
          ...definition,
          options: { ...(definition.options || {}), runtimeId: requestedRuntimeId }
        }, { defaults: this.getLayerDefaults(this.mapDocuments.get(this.dynamicDocumentId)) });
        return {
          mapLayer,
          reference: {
            id: createRuntimeLayerId(mapLayer, index + 1),
            recordId: mapLayer.id,
            title: mapLayer.title,
            order: index + 1,
            visible: mapLayer.visible !== false
          },
          runtimeAdded: true
        };
      })
    });
    if (active) this.activeMapDocumentId = this.dynamicDocumentId;
  }

  /**
   * Return the internal dynamic MapDocument entry.
   *
   * @returns {?Object} The dynamic MapDocument registry entry, or `null` when disabled.
   */
  getDynamicDocumentEntry() {
    return this.mapDocuments.get(this.dynamicDocumentId) || null;
  }

  /**
   * Return the public dynamic MapDocument description.
   *
   * @returns {?Object} Public dynamic MapDocument entry, or `null` when disabled.
   */
  getDynamicDocument() {
    const entry = this.getDynamicDocumentEntry();
    return entry ? createPublicDocumentEntry(entry) : null;
  }

  /**
   * Initialize the map engine, host integration, and initial view/zoom limits.
   *
   * @returns {Promise<void>} Resolves once `heurist-map-ready` has been dispatched.
   * @throws {Error} When the map engine or host cannot be initialized.
   */
  async initialize() {
    this.assertActive();
    await this.host.initialize({ application: this, config: this.config });

    try {
      await this.initializeMapEngine(this.mapEnvironment);
      await this.applyInitialView(this.mapEnvironment.initialView);
      await this.applyDocumentZoomLimits(this.mapEnvironment);
      this.initialized = true;
      this.dispatch('heurist-map-ready', { mapDocument: this.config.mapDocument });
    } catch (error) {
      await this.mapEngine.destroy();
      await this.host.destroy();
      throw addContext(error, 'Cannot initialize map rendering');
    }
  }

  /**
   * Load the lightweight list of available MapDocuments.
   *
   * @param {*} [query=null] Provider-specific search query, or `false`/`null` for all documents.
   * @param {Object} [options={}] Load options.
   * @param {AbortSignal} [options.signal] Abort signal for the underlying request.
   * @param {boolean} [options.activateFirst=true] Whether to activate the resolved initial document.
   * @returns {Promise<Array<Object>>} Resolves with the available MapDocuments in API order.
   * @throws {Error} When the MapDocument list provider is not configured, or the request fails.
   */
  async loadMapDocuments(query = null, { signal, activateFirst = true } = {}) {
    this.assertActive();
    if (!this.providers.mapDocumentList) {
      throw new Error('MapDocument list provider is not configured');
    }
    this.dispatch('heurist-map-documents-loading', { query });
    const previousActiveId = this.activeMapDocumentId;
    try {
      const result = await this.providers.mapDocumentList.search(query, { signal });
      const dynamicEntry = this.getDynamicDocumentEntry();
      this.mapDocuments.clear();
      if (dynamicEntry) this.mapDocuments.set(this.dynamicDocumentId, dynamicEntry);
      for (const entry of result.items) {
        const active = entry.id === previousActiveId;
        this.mapDocuments.set(entry.id, {
          ...entry, kind: 'record', active, activating: false,
          loadState: active ? 'loaded' : 'available', error: null
        });
      }
      if (previousActiveId && !this.mapDocuments.has(previousActiveId)) this.activeMapDocumentId = null;
      this.dispatch('heurist-map-documents-loaded', { documents: this.getMapDocuments(), pagination: result.pagination });
      const configuredInitial = this.config.documents?.initiallyActive;
      const normalizedInitial = configuredInitial === this.dynamicDocumentId
        ? this.dynamicDocumentId
        : (Number.isInteger(Number(configuredInitial)) && Number(configuredInitial) > 0
          ? Number(configuredInitial)
          : null);
      const targetId = normalizedInitial != null && this.mapDocuments.has(normalizedInitial)
        ? normalizedInitial
        : (this.activeMapDocumentId && this.mapDocuments.has(this.activeMapDocumentId)
          ? this.activeMapDocumentId
          : result.items[0]?.id);
      if (activateFirst && targetId && this.config.mapDocument?.id !== targetId) {
        await this.activateMapDocument(targetId, { signal });
      }
      return this.getMapDocuments();
    } catch (error) {
      this.dispatch('heurist-map-error', { operation: 'load-map-documents', error: serializeError(error) });
      throw addContext(error, 'Cannot load MapDocument list');
    }
  }

  /**
   * Return available MapDocuments in API order.
   *
   * @returns {Array<Object>} Public MapDocument list entries.
   */
  getMapDocuments() { return [...this.mapDocuments.values()].map(createPublicDocumentEntry); }

  /**
   * Return the active MapDocument list entry.
   *
   * @returns {?Object} Public active MapDocument list entry, or `null` when none is active.
   */
  getActiveMapDocument() {
    const item = this.mapDocuments.get(this.activeMapDocumentId);
    return item ? createPublicDocumentEntry(item) : null;
  }

  /**
   * Activate exactly one persisted MapDocument.
   *
   * @param {string|number} documentId MapDocument list entry identifier.
   * @param {Object} [options={}] Activation options.
   * @param {AbortSignal} [options.signal] Abort signal for the underlying request.
   * @param {boolean} [options.force=false] Reactivate even if already the active document.
   * @returns {Promise<Object>} Resolves with the activated public MapDocument.
   * @throws {Error} When `documentId` is not in the available document list.
   */
  async activateMapDocument(documentId, { signal, force = false } = {}) {
    const requestedId = String(documentId);
    if (requestedId === this.dynamicDocumentId) {
      return this.activateDynamicMapDocument({ signal, force });
    }
    const id = Number(documentId);
    const item = this.mapDocuments.get(id) || this.mapDocuments.get(Number(id));
    if (!item) throw new Error(`MapDocument ${documentId} is not in the available document list`);
    if (!force && this.activeMapDocumentId === id && this.config.mapDocument?.id === id) {
      return this.config.mapDocument;
    }

    const activationSerial = ++this.documentActivationSerial;
    this.cancelPendingRequests('Superseded by a newer MapDocument activation');
    this.cancelPendingLayerLoads('Superseded by a newer MapDocument activation');

    // A superseded activation does not enter its own catch branch because its
    // serial is stale. Reset those document rows here so their loading spinner
    // is removed immediately and the radio selector is restored.
    for (const document of this.mapDocuments.values()) {
      if (document.id !== id && (document.activating || document.loadState === 'loading')) {
        document.activating = false;
        document.loadState = document.active ? 'loaded' : 'available';
        document.error = null;
      }
    }

    item.activating = true;
    item.loadState = 'loading';
    item.error = null;
    this.dispatch('heurist-map-document-activating', { document: clonePlain(item) });
    this.dispatch('heurist-map-documents-changed', { documents: this.getMapDocuments() });

    try {
      let activationPublished = false;
      const publishActivation = async (document) => {
        if (activationSerial !== this.documentActivationSerial) {
          throw new DOMException('Stale MapDocument activation', 'AbortError');
        }

        for (const documentItem of this.mapDocuments.values()) {
          documentItem.active = documentItem.id === id;
          documentItem.activating = documentItem.id === id;
        }
        this.activeMapDocumentId = id;
        await this.applyDocumentBaseMap(document);
        this.dispatch('heurist-map-document-activated', {
          document: clonePlain(item),
          mapDocument: document,
          loading: true
        });
        this.dispatch('heurist-map-documents-changed', { documents: this.getMapDocuments() });
        activationPublished = true;
      };

      const document = await this.loadMapDocument(id, { signal, onEnvironmentReady: publishActivation });
      if (activationSerial !== this.documentActivationSerial) {
        throw new DOMException('Stale MapDocument activation', 'AbortError');
      }

      if (!activationPublished) await publishActivation(document);
      for (const documentItem of this.mapDocuments.values()) {
        documentItem.active = documentItem.id === id;
        documentItem.activating = false;
      }
      item.loadState = 'loaded';
      item.error = null;
      this.dispatch('heurist-map-document-state-changed', { document: clonePlain(item) });
      this.dispatch('heurist-map-documents-changed', { documents: this.getMapDocuments() });
      return document;
    } catch (error) {
      if (activationSerial === this.documentActivationSerial) {
        item.activating = false;
        item.loadState = isAbortError(error) ? 'available' : 'error';
        item.error = isAbortError(error) ? null : serializeError(error);
        this.dispatch('heurist-map-document-state-changed', { document: clonePlain(item) });
        this.dispatch('heurist-map-documents-changed', { documents: this.getMapDocuments() });
      }
      throw error;
    }
  }

  /**
   * Activate the predefined dynamic MapDocument using stored layer definitions.
   *
   * @param {Object} [options={}] Activation options.
   * @param {AbortSignal} [options.signal] Abort signal used while preparing stored layers.
   * @param {boolean} [options.force=false] Reactivate even if already the active document.
   * @returns {Promise<Object>} Resolves with the activated dynamic MapDocument.
   * @throws {Error} When the dynamic MapDocument is disabled.
   */
  async activateDynamicMapDocument({ signal, force = false } = {}) {
    const item = this.getDynamicDocumentEntry();
    if (!item) throw new Error('Dynamic MapDocument is disabled');
    if (!force && this.activeMapDocumentId === this.dynamicDocumentId) return this.getMapDocument();

    // Rebuild definitions from the latest snapshot before rendering the document.
    if (this.host.getHostContext?.()?.name === 'heurist-explorer'
      && this.hasExplorerDataSourceSnapshot) {
      this.replaceExplorerDynamicLayerDefinitions();
    }

    const activationSerial = ++this.documentActivationSerial;
    this.cancelPendingRequests('Superseded by dynamic MapDocument activation');
    this.cancelPendingLayerLoads('Superseded by dynamic MapDocument activation');
    item.activating = true;
    item.loadState = 'loading';
    item.error = null;
    this.dispatch('heurist-map-document-activating', { document: createPublicDocumentEntry(item) });
    this.dispatch('heurist-map-documents-changed', { documents: this.getMapDocuments() });

    try {
      const document = createDynamicMapDocument(this.config, item);
      const environment = createMapEnvironment(document, this.config.defaults);

      // Switch the visible map immediately. Dynamic layer data may be expensive
      // to recreate, so do not leave the previous MapDocument on screen while
      // that work is in progress.
      await this.beginMapEnvironment(document, environment);

      // Filtered Result has no persisted worldBaseMap. Re-entering the dynamic
      // document after a persisted MapDocument must therefore restore the
      // configured initial/first allowed basemap explicitly. Do not inherit the
      // basemap (or lack of one) from the previously active MapDocument.
      await this.restoreDefaultBaseMap();

      if (activationSerial !== this.documentActivationSerial) {
        throw new DOMException('Stale dynamic MapDocument activation', 'AbortError');
      }

      for (const documentItem of this.mapDocuments.values()) {
        documentItem.active = String(documentItem.id) === this.dynamicDocumentId;
        documentItem.activating = String(documentItem.id) === this.dynamicDocumentId;
      }
      this.activeMapDocumentId = this.dynamicDocumentId;
      this.dispatch('heurist-map-document-activated', {
        document: createPublicDocumentEntry(item), mapDocument: document, loading: true
      });
      this.dispatch('heurist-map-documents-changed', { documents: this.getMapDocuments() });

      const preparedLayers = [];
      for (const stored of item.layerDefinitions || []) {
        throwIfAborted(signal);
        if (stored.mapLayer.visible === false) {
          preparedLayers.push({ ...stored, runtimeLayer: null });
        } else {
          preparedLayers.push({
            ...stored,
            runtimeLayer: await this.createRuntimeLayer(stored.mapLayer, stored.reference, signal)
          });
        }
      }
      if (activationSerial !== this.documentActivationSerial) {
        throw new DOMException('Stale dynamic MapDocument activation', 'AbortError');
      }
      await this.renderPreparedLayers(preparedLayers);
      for (const stored of item.layerDefinitions || []) {
        if (stored.runtimeOpacity != null && this.layers.has(stored.reference.id)) {
          await this.setLayerOpacity(stored.reference.id, stored.runtimeOpacity);
        }
      }
      for (const documentItem of this.mapDocuments.values()) {
        documentItem.active = String(documentItem.id) === this.dynamicDocumentId;
        documentItem.activating = false;
      }
      item.loadState = 'loaded';
      item.error = null;
      this.dispatch('heurist-map-document-state-changed', { document: createPublicDocumentEntry(item) });
      this.dispatch('heurist-map-documents-changed', { documents: this.getMapDocuments() });
      return document;
    } catch (error) {
      if (activationSerial === this.documentActivationSerial) {
        item.activating = false;
        item.loadState = isAbortError(error) ? 'available' : 'error';
        item.error = isAbortError(error) ? null : serializeError(error);
        this.dispatch('heurist-map-document-state-changed', { document: createPublicDocumentEntry(item) });
        this.dispatch('heurist-map-documents-changed', { documents: this.getMapDocuments() });
      }
      throw error;
    }
  }

  /**
   * Reload a persisted MapDocument and keep it active.
   *
   * @param {string|number} [documentId=this.activeMapDocumentId] MapDocument identifier.
   * @param {Object} [options={}] Reload options forwarded to {@link MapApplication#activateMapDocument}.
   * @returns {Promise<Object>} Resolves with the reloaded public MapDocument.
   * @throws {Error} When no MapDocument is active.
   */
  async reloadMapDocument(documentId = this.activeMapDocumentId, options = {}) {
    if (!documentId) throw new Error('No MapDocument is active');
    return this.activateMapDocument(documentId, { ...options, force: true });
  }

  /**
   * Unload the active MapDocument layers and restore the default base map.
   *
   * @param {string|number} [documentId=this.activeMapDocumentId] MapDocument identifier to unload.
   * @returns {Promise<boolean>} Resolves with whether the document was unloaded.
   */
  async unloadMapDocument(documentId = this.activeMapDocumentId) {
    const id = String(documentId);
    if (!id || id !== String(this.activeMapDocumentId)) return false;
    this.documentActivationSerial += 1;
    this.cancelPendingRequests('MapDocument unloaded');
    this.cancelPendingLayerLoads('MapDocument unloaded');
    await this.clearLayers();
    const item = this.mapDocuments.get(id) || this.mapDocuments.get(Number(id));
    if (item) { item.active = false; item.activating = false; item.loadState = 'available'; item.error = null; }
    this.activeMapDocumentId = null;
    this.config.mapDocument = normalizeMapDocument({});
    await this.restoreDefaultBaseMap();
    this.dispatch('heurist-map-document-unloaded', { documentId: id });
    this.dispatch('heurist-map-documents-changed', { documents: this.getMapDocuments() });
    return true;
  }

  /**
   * Zoom to a document bookmark, bounds, or combined visible layer extent.
   *
   * @param {string|number} documentId MapDocument identifier (persisted or dynamic).
   * @returns {Promise<*>} Resolves when the view change completes.
   */
  async zoomToMapDocument(documentId) {
    const requestedId = String(documentId);
    const id = Number(documentId);
    const document = requestedId === this.dynamicDocumentId
      ? createDynamicMapDocument(this.config, this.getDynamicDocumentEntry())
      : (this.config.mapDocument?.id === id
        ? this.config.mapDocument
        : await this.providers.mapDocument.getById(id));
    const view = createMapEnvironment(document, this.config.defaults).initialView;
    if (view.type === 'bounds') return this.fitBounds(view.bounds, { animate: false });
    if (document.mapBookmark?.type === 'point' || (document.mapBookmark?.type === 'view' && document.mapBookmark?.raw)) {
      return this.setView(view.center, view.zoom, { animate: false });
    }
    const combined = await this.mapEngine.getVisibleLayerBounds?.();
    if (combined) return this.fitBounds(combined, { animate: false });
    return this.setView(view.center, view.zoom, { animate: false });
  }

  /**
   * Zoom to the active MapDocument.
   *
   * @returns {Promise<*>} Resolves when the view change completes.
   */
  async zoomHome() {
    if (this.activeMapDocumentId) return this.zoomToMapDocument(this.activeMapDocumentId);
    const view = this.mapEnvironment.initialView;
    if (view.type === 'bounds') return this.fitBounds(view.bounds, { animate: false });
    return this.setView(view.center, view.zoom, { animate: false });
  }

  /**
   * Return configured engine-neutral base-map definitions.
   *
   * @returns {Array<Object>} Cloned base-map definitions.
   */
  getBaseMaps() { return [...this.baseMaps.values()].map(clonePlain); }

  /**
   * Return the active base-map definition.
   *
   * @returns {?Object} Cloned active base-map definition, or `null` when none is active.
   */
  getActiveBaseMap() {
    const item = this.baseMaps.get(String(this.activeBaseMapId));
    return item ? clonePlain(item) : null;
  }

  /**
   * Replace the active base map while preserving operational layers.
   *
   * @param {string} baseMapId Configured base-map identifier.
   * @returns {Promise<Object>} Resolves with the cloned activated base-map definition.
   * @throws {Error} When `baseMapId` is not a configured base map.
   */
  async setBaseMap(baseMapId) {
    const item = this.baseMaps.get(String(baseMapId));
    if (!item) throw new Error(`Unknown base map "${baseMapId}"`);
    await this.mapEngine.setBaseMap(item.type === 'none' ? null : item);
    this.activeBaseMapId = item.id;
    this.dispatch('heurist-map-basemap-changed', { baseMap: clonePlain(item) });
    return clonePlain(item);
  }

  /**
   * Resolve and apply the base map declared by a MapDocument, honoring curated
   * basemaps that fall outside the site's configured "allowed" catalog.
   *
   * @param {Object} document MapDocument whose `worldBaseMap` should be applied.
   * @returns {Promise<?Object>} Resolves with the cloned activated base-map definition, or `null`.
   */
  async applyDocumentBaseMap(document) {
    // MapPresentationService returns worldBaseMap as a Heurist term descriptor.
    // The term id/code are not basemap identifiers; the reliable value is label.
    const label = document?.worldBaseMap?.label;
    let baseMap = findBaseMapByName(this.baseMaps, label);
    if (!baseMap) {
      // The document's basemap may fall outside the site's configured "allowed"
      // catalog. It is still authored document content, so honor it as long as
      // it resolves to one of Heurist's curated basemaps, and register it so
      // the base-map selector reflects what is actually rendered.
      const curated = findBaseMapByName(getCuratedBaseMapsById(), label);
      if (curated) {
        baseMap = clonePlain(curated);
        this.baseMaps.set(String(baseMap.id), baseMap);
      }
    }
    return baseMap ? this.setBaseMap(baseMap.id) : this.restoreDefaultBaseMap();
  }

  /**
   * Restore the configured default base map, or clear the base map entirely
   * when none is configured.
   *
   * @returns {Promise<?Object>} Resolves with the cloned restored base-map definition, or `null`.
   */
  async restoreDefaultBaseMap() {
    if (this.defaultBaseMapId != null && this.baseMaps.has(String(this.defaultBaseMapId))) {
      return this.setBaseMap(this.defaultBaseMapId);
    }
    await this.mapEngine.setBaseMap(null);
    this.activeBaseMapId = null;
    this.dispatch('heurist-map-basemap-changed', { baseMap: null });
    return null;
  }

  /**
   * Zoom to a layer extent from source metadata or the map engine.
   *
   * @param {string|number} layerId Runtime layer identifier.
   * @returns {Promise<*>} Resolves when the view change completes.
   * @throws {Error} When the layer is not registered or has no resolvable extent.
   */
  async zoomToLayer(layerId) {
    const layer = this.layers.get(layerId);
    if (!layer) throw new Error(`Layer "${layerId}" is not registered`);
    const bounds = layer.source?.bounds || await this.mapEngine.getLayerBounds(layerId);
    if (!bounds) throw new Error(`Layer "${layer.title || layerId}" does not define an extent`);
    return this.fitBounds(bounds, { animate: false });
  }

  /**
   * Apply a runtime global opacity multiplier; accepts 0-1 or 0-100.
   *
   * @param {string|number} layerId Runtime layer identifier.
   * @param {number} opacity Opacity in the 0-1 or 0-100 range.
   * @returns {Promise<number>} Resolves with the normalized 0-1 opacity applied.
   * @throws {Error} When the layer is not registered.
   */
  async setLayerOpacity(layerId, opacity) {
    const value = normalizeRuntimeOpacity(opacity);
    const layer = this.layers.get(layerId);
    if (!layer) throw new Error(`Layer "${layerId}" is not registered`);
    layer.opacity = value;
    const activeDocument = this.mapDocuments.get(this.activeMapDocumentId);
    const stored = activeDocument ? findStoredLayer(activeDocument, layerId) : null;
    if (stored) stored.runtimeOpacity = value;
    if (!this.deferredLayers.has(layerId)) await this.mapEngine.setLayerOpacity(layerId, value);
    this.dispatch('heurist-map-layer-opacity-changed', { layerId, opacity: value, layer: this.getLayer(layerId) });
    this.persistWorkspaceLayerState(layerId);
    return value;
  }

  /**
   * Activate one thematic map for a layer, or use null for the ordinary/default symbology.
   *
   * @param {string|number} layerId Runtime layer identifier.
   * @param {?number} [themeIndex=null] Thematic map index to activate, or `null` for the default symbology.
   * @returns {Promise<Object>} Resolves with the updated public layer description.
   * @throws {Error} When the layer is not registered.
   */
  async setLayerTheme(layerId, themeIndex = null) {
    const layer = this.layers.get(layerId);
    if (!layer) throw new Error(`Layer "${layerId}" is not registered`);

    const activeDocument = this.mapDocuments?.get?.(this.activeMapDocumentId)
      || this.mapDocuments?.get?.(String(this.activeMapDocumentId))
      || null;
    const stored = activeDocument ? findStoredLayer(activeDocument, layerId) : null;
    const sourceStyle = stored?.mapLayer?.style ?? layer.style ?? {};
    const nextStyle = activateThematicMap(sourceStyle, themeIndex);

    if (stored?.mapLayer) {
      stored.mapLayer.style = clonePlain(nextStyle);
      if (Object.prototype.hasOwnProperty.call(stored.mapLayer, '_sourceStyle')) {
        stored.mapLayer._sourceStyle = activateThematicMap(stored.mapLayer._sourceStyle, themeIndex);
      }
    }
    layer.style = clonePlain(nextStyle);
    const deferred = this.deferredLayers.get(layerId);
    if (deferred?.mapLayer) {
      deferred.mapLayer.style = clonePlain(nextStyle);
      if (Object.prototype.hasOwnProperty.call(deferred.mapLayer, '_sourceStyle')) {
        deferred.mapLayer._sourceStyle = activateThematicMap(deferred.mapLayer._sourceStyle, themeIndex);
      }
    }

    if (layer.loadState === 'loaded' && !this.deferredLayers.has(layerId)) {
      await this.mapEngine.setLayerStyle(layerId, nextStyle);
    }

    this.dispatch('heurist-map-layer-style-changed', {
      layerId,
      themeIndex: themeIndex == null ? null : Number(themeIndex),
      layer: this.getLayer(layerId)
    });
    return this.getLayer(layerId);
  }

  /**
   * Replace a layer style in memory and redraw it without reloading geometry/data.
   *
   * @param {string|number} layerId Runtime layer identifier.
   * @param {Object} style Sparse or complete style definition to apply.
   * @returns {Promise<Object>} Resolves with the updated public layer description.
   * @throws {Error} When the layer is not registered.
   */
  async setLayerStyle(layerId, style) {
    const layer = this.layers.get(layerId);
    if (!layer) throw new Error(`Layer "${layerId}" is not registered`);

    const activeDocument = this.mapDocuments?.get?.(this.activeMapDocumentId)
      || this.mapDocuments?.get?.(String(this.activeMapDocumentId))
      || null;
    const stored = activeDocument ? findStoredLayer(activeDocument, layerId) : null;
    const defaults = this.getLayerDefaults(activeDocument);
    const normalized = normalizeMapLayer({
      ...(stored?.mapLayer || {}),
      style: style || {}
    }, { defaults }).style;

    if (stored?.mapLayer) {
      stored.mapLayer.style = clonePlain(normalized);
      if (Object.prototype.hasOwnProperty.call(stored.mapLayer, '_sourceStyle')) {
        stored.mapLayer._sourceStyle = clonePlain(style || {});
      }
    }
    layer.style = clonePlain(normalized);
    const deferred = this.deferredLayers.get(layerId);
    if (deferred?.mapLayer) {
      deferred.mapLayer.style = clonePlain(normalized);
      if (Object.prototype.hasOwnProperty.call(deferred.mapLayer, '_sourceStyle')) {
        deferred.mapLayer._sourceStyle = clonePlain(style || {});
      }
    }

    if (layer.loadState === 'loaded' && !this.deferredLayers.has(layerId)) {
      await this.mapEngine.setLayerStyle(layerId, normalized);
    }

    this.dispatch('heurist-map-layer-style-changed', {
      layerId,
      layer: this.getLayer(layerId)
    });
    this.persistWorkspaceLayerState(layerId);
    return this.getLayer(layerId);
  }

  /**
   * Open the host symbology editor and apply the returned canonical DT_SYMBOLOGY value.
   *
   * @param {string|number} layerId Runtime layer identifier.
   * @param {Object} [options={}] Editor options.
   * @param {boolean} [options.thematic=false] Whether to open the thematic-map editor.
   * @returns {Promise<?Object>} Resolves with the updated public layer description, or `null` when
   *          editing is unavailable or the editor was dismissed without saving.
   * @throws {Error} When the layer is not registered, or is not backed by a persisted MapLayer record.
   */
  async requestEditLayerSymbology(layerId, { thematic = false } = {}) {
    const layer = this.layers.get(layerId);
    if (!layer) throw new Error(`Layer "${layerId}" is not registered`);
    if (this.config.readonly || !this.host.supportsSymbologyEditing()) return null;

    const isCurrentResults = String(layerId) === 'current-results';
    const isWorkspaceLayer = layer.options?.workspaceEntry === true;
    const recordId = Number(layer.recordId);
    if (!isCurrentResults && !isWorkspaceLayer && !(recordId > 0)) {
      throw new Error(`Layer "${layerId}" is not backed by a persisted MapLayer record`);
    }
    if ((isCurrentResults || isWorkspaceLayer) && thematic === true) return null;

    // Edit the sparse/source definition rather than the normalized runtime style.
    // Runtime styles contain inherited values and engine-only compatibility fields
    // (for example radius and normalized iconSize arrays); sending those back to the
    // host would materialise defaults and can leak raster filter properties into a
    // vector DT_SYMBOLOGY value.
    const activeDocument = this.mapDocuments?.get?.(this.activeMapDocumentId)
      || this.mapDocuments?.get?.(String(this.activeMapDocumentId))
      || null;
    const stored = activeDocument ? findStoredLayer(activeDocument, layerId) : null;
    const usesGlobalDefault = isCurrentResults && !isWorkspaceLayer;
    const sourceStyle = usesGlobalDefault
      ? (this.config.defaults?.symbology ?? {})
      : (stored?.mapLayer?._sourceStyle ?? layer.style);
    const currentValue = canonicalVectorSymbology(sourceStyle);
    // Main Heurist's editor displays the effective symbol but persists only the
    // sparse difference from this parent. Default/current-results symbology
    // inherits directly from the built-in symbol; persisted MapLayers inherit
    // from the configured effective default symbol. The thematic editor uses the
    // same parent to resolve layer -> theme -> range internally.
    const parentSymbol = usesGlobalDefault
      ? normalizeMapSymbol({}, DEFAULT_MAP_SYMBOL)
      : normalizeMapSymbol(this.config.defaults?.symbology ?? {}, DEFAULT_MAP_SYMBOL);
    const value = await this.host.editSymbology(currentValue, {
      recordId: recordId > 0 ? recordId : null,
      layerId,
      query: layer.source?.query ?? null,
      thematic: thematic === true,
      parentSymbol,
      persist: !isCurrentResults && !isWorkspaceLayer && recordId > 0
    });
    if (value == null) return null;

    if (usesGlobalDefault) {
      const canonical = canonicalVectorSymbology(value);
      const baseSymbol = canonical?.symbol && Array.isArray(canonical?.thematic)
        ? canonical.symbol
        : canonical;

      // Filtered Result uses the same Default symbology edited in Map Configuration.
      // Treat the editor Save as an explicit preference change: persist it when the
      // host supports map preferences, then apply the complete configuration so every
      // layer that inherits from Default symbology is recomputed consistently.
      const settings = normalizeMapConfigurationSettings(
        clonePlain(this.config.persistedSettings || {})
      );
      settings.config.defaults.symbology = clonePlain(baseSymbol || {});
      if (this.host.getCapabilities?.().mapPreferences === true) {
        await this.host.savePreferences(settings);
      }
      return this.applyConfiguration(settings);
    }

    // Ordinary symbology can be redrawn in place. For thematic edits update the
    // local style first so the newly added renderer indices exist immediately in
    // MapControlPanel, then reload to refresh the thematic attribute payload.
    // This removes the short stale-style window that previously caused
    // activateThematicMap() to reject a newly selected renderer index.
    if (thematic === true) {
      await this.setLayerStyle(layerId, value);
      return this.reloadLayer(layerId);
    }
    return this.setLayerStyle(layerId, value);
  }

  /**
   * Apply synchronized record IDs to the first visible layer containing them.
   *
   * @param {number|Array<number>} recordIds Record ID or IDs to select.
   * @param {Object} [options={}] Selection options.
   * @param {boolean} [options.zoom] Whether to zoom to the resulting selection.
   * @returns {Promise<?Object>} Resolves with the resulting selection, or `null` when cleared.
   */
  async setSelection(recordIds, options = {}) {
    const ids = [...new Set((Array.isArray(recordIds) ? recordIds : [recordIds])
      .map(normalizeSelectedRecordId).filter((value) => value != null))];
    if (!ids.length) return this.clearSelection();
    const candidates = [...this.layers.values()]
      .filter((layer) => layer.visible !== false && layer.selectable !== false && layer.loadState === 'loaded');
    for (const layer of candidates) {
      const hasMatch = ids.some((id) => this.mapEngine.getFeatureIdsByRecord(layer.id, id).length > 0);
      if (hasMatch) return this.selectRecords(layer.id, ids, { replace: true, zoom: options.zoom === true });
    }
    return this.clearSelection();
  }

  /**
   * Return the lightweight single-layer selection.
   *
   * @returns {?Object} Current `{ layerId, features }` selection, or `null` when nothing is selected.
   */
  getSelection() {
    return this.selectionLayerId == null
      ? null
      : {
          layerId: this.selectionLayerId,
          features: [...this.selectedFeatures].map(([featureId, recordId]) => ({ featureId, recordId }))
        };
  }

  /**
   * Select one feature, optionally adding/toggling within the same layer.
   *
   * @param {string|number} layerId Runtime layer identifier.
   * @param {string|number} featureId Rendered feature identifier.
   * @param {Object} [options={}] Selection options.
   * @param {?number} [options.recordId=null] Record ID backing the feature, resolved from the
   *        engine when omitted.
   * @param {boolean} [options.additive=false] Add to the current selection instead of replacing it.
   * @param {boolean} [options.toggle=false] Toggle the feature out of the selection if already selected.
   * @param {boolean} [options.zoom=false] Zoom to the resulting selection.
   * @returns {Promise<?Object>} Resolves with the resulting selection, or `null` when cleared.
   * @throws {Error} When the layer is not registered, not selectable, or not visible/loaded.
   */
  async selectFeature(layerId, featureId, { recordId = null, additive = false, toggle = false, zoom = false } = {}) {
    if (this.config.interaction?.selectionEnabled === false) return null;
    const layer = this.layers.get(layerId);
    if (!layer) throw new Error(`Layer "${layerId}" is not registered`);
    if (layer.selectable === false) throw new Error(`Layer "${layer.title || layerId}" is not selectable`);
    if (layer.visible === false || layer.loadState !== 'loaded') {
      throw new Error(`Layer "${layer.title || layerId}" must be visible and loaded before selection`);
    }

    const id = String(featureId);
    const resolvedRecordId = recordId ?? this.mapEngine.getFeatureRecordId(layerId, id);
    const previous = this.getSelection();

    if (this.selectionLayerId !== layerId || !additive) {
      // When replacing a selection in the same layer, do not clear native
      // selection first. setFeatureSelection() receives the final set below
      // and the engine adapter can update only the changed features.
      if (this.selectionLayerId != null && this.selectionLayerId !== layerId) {
        await this.mapEngine.setFeatureSelection(this.selectionLayerId, []);
      }
      this.selectionLayerId = layerId;
      this.selectedFeatures.clear();
    }

    if (toggle && this.selectedFeatures.has(id)) {
      this.selectedFeatures.delete(id);
    } else {
      this.selectedFeatures.set(id, normalizeSelectedRecordId(resolvedRecordId));
    }

    if (this.selectedFeatures.size === 0) {
      this.selectionLayerId = null;
      this.dispatch('heurist-map-selection-cleared', { previous });
      this.dispatch('heurist-map-selection-changed', { selection: null, previous });
      return null;
    }

    await this.mapEngine.setFeatureSelection(layerId, [...this.selectedFeatures.keys()]);
    const selection = this.getSelection();
    this.dispatch('heurist-map-feature-selected', {
      layerId, feature: { featureId: id, recordId: normalizeSelectedRecordId(resolvedRecordId) }, selection
    });
    this.dispatch('heurist-map-selection-changed', { selection, previous });
    if (zoom) await this.zoomToSelection();
    return selection;
  }

  /**
   * Select all rendered geometries for one record in a selectable layer.
   *
   * @param {string|number} layerId Runtime layer identifier.
   * @param {number} recordId Record ID whose rendered geometries should be selected.
   * @param {Object} [options={}] Selection options.
   * @param {boolean} [options.zoom] Zoom to the resulting selection.
   * @returns {Promise<?Object>} Resolves with the resulting selection, or `null` when cleared.
   */
  async selectRecord(layerId, recordId, options = {}) {
    return this.selectRecords(layerId, [recordId], {
      replace: true,
      zoom: options.zoom === true
    });
  }

  /**
   * Select all rendered geometries for multiple records in one selectable layer.
   *
   * @param {string|number} layerId Runtime layer identifier.
   * @param {number|Array<number>} recordIds Record ID or IDs whose geometries should be selected.
   * @param {Object} [options={}] Selection options.
   * @param {boolean} [options.replace=true] Replace the current selection instead of adding to it.
   * @param {boolean} [options.zoom=false] Zoom to the resulting selection.
   * @returns {Promise<?Object>} Resolves with the resulting selection, or `null` when cleared.
   * @throws {Error} When the layer is not registered, not selectable, or not visible/loaded.
   */
  async selectRecords(layerId, recordIds, { replace = true, zoom = false } = {}) {
    if (this.config.interaction?.selectionEnabled === false) return null;
    const layer = this.layers.get(layerId);
    if (!layer) throw new Error(`Layer "${layerId}" is not registered`);
    if (layer.selectable === false) throw new Error(`Layer "${layer.title || layerId}" is not selectable`);
    if (layer.visible === false || layer.loadState !== 'loaded') {
      throw new Error(`Layer "${layer.title || layerId}" must be visible and loaded before selection`);
    }

    const ids = [...new Set((Array.isArray(recordIds) ? recordIds : [recordIds])
      .map(normalizeSelectedRecordId)
      .filter((value) => value != null))];
    const previous = this.getSelection();

    if (replace || this.selectionLayerId !== layerId) {
      // Same-layer replacement is sent as one final feature-id set. The map
      // engine is responsible for applying only the selection delta.
      if (this.selectionLayerId != null && this.selectionLayerId !== layerId) {
        await this.mapEngine.setFeatureSelection(this.selectionLayerId, []);
      }
      this.selectionLayerId = layerId;
      this.selectedFeatures.clear();
    }

    for (const recordId of ids) {
      const featureIds = this.mapEngine.getFeatureIdsByRecord(layerId, recordId);
      for (const featureId of featureIds) {
        this.selectedFeatures.set(String(featureId), recordId);
      }
    }

    if (this.selectedFeatures.size === 0) {
      this.selectionLayerId = null;
      if (previous) {
        this.dispatch('heurist-map-selection-cleared', { previous });
        this.dispatch('heurist-map-selection-changed', { selection: null, previous });
      }
      return null;
    }

    await this.mapEngine.setFeatureSelection(layerId, [...this.selectedFeatures.keys()]);
    const selection = this.getSelection();
    this.dispatch('heurist-map-selection-changed', { selection, previous });
    if (zoom) await this.zoomToSelection();
    return selection;
  }

  /**
   * Clear selected features and restore their native styles.
   *
   * @returns {Promise<?Object>} Resolves with the selection that was cleared, or `null` if none.
   */
  async clearSelection() {
    const previous = this.getSelection();
    if (this.selectionLayerId != null) {
      try { await this.mapEngine.setFeatureSelection(this.selectionLayerId, []); } catch { /* layer may already be gone */ }
    }
    this.selectionLayerId = null;
    this.selectedFeatures.clear();
    if (previous) {
      this.dispatch('heurist-map-selection-cleared', { previous });
      this.dispatch('heurist-map-selection-changed', { selection: null, previous });
    }
    return previous;
  }

  /**
   * Zoom to all selected geometries.
   *
   * @returns {Promise<boolean>} Resolves with whether the view actually changed.
   */
  async zoomToSelection() {
    if (this.selectionLayerId == null || this.selectedFeatures.size === 0) return false;
    const bounds = await this.mapEngine.getSelectionBounds(
      this.selectionLayerId, [...this.selectedFeatures.keys()]
    );
    if (!bounds) return false;

    const isPoint = Number(bounds.west) === Number(bounds.east)
      && Number(bounds.south) === Number(bounds.north);
    const pointKm = Number(this.mapEnvironment?.zoomToPointInKM);
    if (isPoint && pointKm > 0) {
      const center = { latitude: Number(bounds.south), longitude: Number(bounds.west) };
      const zoom = this.mapEngine.distanceKmToZoom?.(pointKm, { latitude: center.latitude });
      if (zoom != null) {
        await this.setView(center, zoom, { animate: false });
        return true;
      }
    }

    await this.fitBounds(bounds, { animate: false });
    return true;
  }

  /**
   * Handle an engine-neutral feature click: dispatch click events, apply record
   * selection, and open a feature popup when configured.
   *
   * @param {Object} detail Engine-neutral feature click detail.
   * @returns {Promise<void>} Resolves once selection and popup handling complete.
   */
  async handleFeatureClick(detail) {
    const payload = {
      layerId: detail.layerId,
      featureId: String(detail.featureId),
      recordId: normalizeSelectedRecordId(detail.recordId),
      latlng: detail.latlng || null,
      selectable: detail.selectable !== false
    };
    this.dispatch('heurist-map-feature-click', payload);
    this.dispatch('heurist-map-layer-click', { layerId: detail.layerId, latlng: detail.latlng || null });

    const layer = this.layers.get(detail.layerId);
    const selectionEnabled = this.config.interaction?.selectionEnabled !== false
      && detail.selectable !== false
      && layer?.selectable !== false;
    if (selectionEnabled) {
      try {
        // Heurist selection is record-based. A record may be represented by
        // several rendered geometries (for example birth and death places).
        // Select all geometries for the clicked record in one operation instead
        // of first selecting one feature and relying on the host selection
        // round-trip to expand it to the whole record. The clicked featureId is
        // still retained below for opening the popup on the geometry clicked.
        if (payload.recordId != null && !detail.additive) {
          await this.selectRecord(detail.layerId, payload.recordId, {
            zoom: this.config.interaction?.zoomOnSelection === true
          });
        } else {
          await this.selectFeature(detail.layerId, detail.featureId, {
            recordId: detail.recordId,
            additive: Boolean(detail.additive),
            toggle: Boolean(detail.additive),
            zoom: this.config.interaction?.zoomOnSelection === true
          });
        }
      } catch (error) {
        this.dispatch('heurist-map-error', { operation: 'select-feature', error: serializeError(error) });
      }
    }

    const configuredPopupMode = normalizePopupMode(layer?.popup?.template);
    const heuristBackedPopup = layer?.source?.type === 'heurist-query' || layer?.source?.type === 'record';
    const popupMode = heuristBackedPopup || configuredPopupMode === 'none' || configuredPopupMode === 'minimal'
      ? configuredPopupMode
      : 'minimal';
    if (layer?.popup?.enabled === false || popupMode === 'none') return;
    if (popupMode !== 'minimal' && payload.recordId == null) return;
    try {
      // Reopen a popup already fetched/bound for this runtime feature without
      // repeating the HTTP request. Runtime layer replacement clears this cache.
      const opened = await this.mapEngine.openFeaturePopup?.(detail.layerId, payload.featureId, null);
      if (opened) return;

      const popupProvider = this.providers.popup;
      if (!popupProvider) return;
      if (popupMode !== 'minimal' && !popupProvider.isConfigured?.()) return;
      const html = await popupProvider.load(heuristBackedPopup ? payload.recordId : null, {
        template: popupMode,
        properties: detail.popupProperties || null
      });
      if (html) await this.mapEngine.openFeaturePopup?.(detail.layerId, payload.featureId, html);
    } catch (error) {
      if (error?.name === 'AbortError') return;
      this.dispatch('heurist-map-warning', {
        operation: 'load-popup',
        layerId: detail.layerId,
        recordId: payload.recordId,
        error: serializeError(error)
      });
    }
  }

  /**
   * Handle a background map click and clear current selection.
   *
   * @param {Object} detail Engine-neutral map click detail.
   * @returns {Promise<void>} Resolves once the selection has been cleared.
   */
  async handleMapClick(detail) {
    this.dispatch('heurist-map-map-click', { latlng: detail.latlng || null });
    await this.clearSelection();
  }

  /**
   * Open the host record editor for a persisted MapDocument and reload it on save.
   *
   * @param {string|number} documentId Persisted MapDocument record ID.
   * @returns {Promise<?Object>} Resolves with the host edit result, or `null` when editing
   *          is unavailable (the stable `heurist-map-edit-document-requested` event is
   *          dispatched as a fallback in that case).
   * @throws {Error} When `documentId` does not resolve to a positive record ID.
   */
  async requestEditMapDocument(documentId) {
    const recordId = Number(documentId);
    if (!(recordId > 0)) throw new Error('A persisted MapDocument record ID is required for editing');

    if (!this.config.readonly && this.host.supportsEditing()) {
      const result = await this.host.editRecord(recordId);
      if (result?.saved === true) {
        await this.reloadMapDocument(recordId);
      }
      return result ?? null;
    }

    // Keep the stable event as a fallback for custom hosts which integrate externally.
    this.dispatch('heurist-map-edit-document-requested', { documentId: recordId, recordId });
    return null;
  }

  /**
   * Create a new persisted MapDocument record through the host editor and activate it.
   *
   * @returns {Promise<?Object>} Resolves with the host creation result, or `null` when
   *          editing is unavailable (the stable `heurist-map-add-document-requested`
   *          event is dispatched as a fallback in that case).
   * @throws {Error} When the MapDocument record type cannot be resolved.
   */
  async requestAddMapDocument() {
    if (!this.config.readonly && this.host.supportsEditing()) {
      const typeResult = await this.providers.mapDocumentList?.search(false);
      const recordTypeId = Number(typeResult?.recordTypeId);
      if (!(recordTypeId > 0)) throw new Error('MapDocument record type is not available');
      const created = await this.host.addRecord(recordTypeId);
      const recordId = Number(created?.recordId ?? created?.rec_ID ?? created?.id);
      if (recordId > 0) {
        const ids = this.getMapDocuments().filter((item) => item.persistent !== false)
          .map((item) => Number(item.id)).filter((id) => id > 0);
        ids.push(recordId);
        await this.loadMapDocuments([...new Set(ids)], { activateFirst: false });
        await this.activateMapDocument(recordId);
      }
      return created ?? null;
    }
    this.dispatch('heurist-map-add-document-requested', {});
    return null;
  }

  /**
   * Open the host record editor for a persisted MapLayer and reload it on save.
   *
   * @param {string|number} layerId Runtime layer identifier.
   * @returns {Promise<?Object>} Resolves with the host edit result, or `null` when editing
   *          is unavailable (the stable `heurist-map-edit-layer-requested` event is
   *          dispatched as a fallback in that case).
   * @throws {Error} When the layer is not backed by a persisted MapLayer record.
   */
  async requestEditLayer(layerId) {
    const layer = this.layers.get(layerId);
    const recordId = Number(layer?.recordId);
    if (!(recordId > 0)) throw new Error(`Layer "${layerId}" is not backed by a persisted MapLayer record`);

    if (!this.config.readonly && this.host.supportsEditing()) {
      const result = await this.host.editRecord(recordId);
      if (result?.saved === true) {
        await this.reloadLayer(layerId);
      }
      return result ?? null;
    }

    // Keep the stable event as a fallback for custom hosts which integrate externally.
    this.dispatch('heurist-map-edit-layer-requested', { layerId, recordId });
    return null;
  }

  /**
   * Load, prepare, and render a MapDocument and its ordered MapLayer references.
   *
   * @param {string|number} recordId Persisted MapDocument record ID.
   * @param {Object} [options={}] Load options.
   * @param {AbortSignal} [options.signal] Abort signal for the underlying requests.
   * @param {Function} [options.onEnvironmentReady] Called with `(mapDocument, environment)`
   *        once the document shell (bookmark/bounds/base map) is ready, before layers load.
   * @returns {Promise<Object>} Resolves with the loaded MapDocument.
   * @throws {Error} When data-integration providers are not configured, or loading fails.
   */
  async loadMapDocument(recordId, { signal, onEnvironmentReady } = {}) {
    this.assertActive();
    this.assertDataIntegrationConfigured();

    this.cancelPendingRequests('Superseded by a newer MapDocument request');
    this.cancelPendingLayerLoads('Superseded by a newer MapDocument request');
    const controller = new AbortController();
    this.activeLoadController = controller;
    const combinedSignal = combineAbortSignals(controller.signal, signal);

    try {
      const mapDocument = await this.providers.mapDocument.getById(recordId, {
        signal: combinedSignal
      });
      const documentEntry = this.mapDocuments.get(Number(recordId));
      // Keep the lightweight MapDocument list entry in sync with the authoritative
      // record returned by the document endpoint. In particular, an edited title
      // must be reflected by MapControlPanel after reload/refresh.
      if (documentEntry && mapDocument.title != null) {
        documentEntry.title = mapDocument.title;
      }
      const runtimeDefinitions = (documentEntry?.layerDefinitions || [])
        .filter((item) => item.runtimeAdded === true);

      // The MapDocument record already contains the bookmark/bounds and base-map
      // information. Apply that shell immediately, before potentially expensive
      // MapLayer/GeoJSON preparation, so activation is visible without delay.
      const environment = createMapEnvironment(mapDocument, this.config.defaults);
      throwIfAborted(combinedSignal);
      await this.beginMapEnvironment(mapDocument, environment);
      if (typeof onEnvironmentReady === 'function') {
        await onEnvironmentReady(mapDocument, environment);
      }

      const preparedLayers = await this.prepareReferencedLayers(mapDocument, combinedSignal);
      for (const stored of runtimeDefinitions) {
        preparedLayers.push({
          ...stored,
          runtimeLayer: stored.mapLayer.visible === false
            ? null
            : await this.createRuntimeLayer(stored.mapLayer, stored.reference, combinedSignal)
        });
      }
      if (documentEntry) {
        documentEntry.layerDefinitions = [
          ...preparedLayers
            .filter((item) => item.runtimeAdded !== true)
            .map(({ mapLayer, reference }) => ({ mapLayer, reference, runtimeAdded: false })),
          ...runtimeDefinitions
        ];
      }

      throwIfAborted(combinedSignal);
      await this.renderPreparedLayers(preparedLayers);

      this.dispatch('heurist-map-document-loaded', {
        mapDocument,
        layerCount: preparedLayers.length,
        loadedLayerCount: preparedLayers.filter((item) => item.runtimeLayer).length,
        deferredLayerCount: preparedLayers.filter((item) => !item.runtimeLayer).length
      });
      return mapDocument;
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      throw addContext(error, `Cannot load MapDocument record ${recordId}`);
    } finally {
      if (this.activeLoadController === controller) {
        this.activeLoadController = null;
      }
    }
  }

  /**
   * Cancel the currently active MapDocument or data-loading request.
   *
   * @param {string} [reason='Map request cancelled'] Abort reason message.
   * @returns {boolean} Whether a pending request was cancelled.
   */
  cancelPendingRequests(reason = 'Map request cancelled') {
    if (!this.activeLoadController) {
      return false;
    }
    this.activeLoadController.abort(new DOMException(reason, 'AbortError'));
    this.activeLoadController = null;
    return true;
  }


  /**
   * Cancel all independently loading operational layers.
   *
   * The generation counter prevents a loader that ignores or races an abort
   * signal from attaching its result after another MapDocument is activated.
   *
   * @param {string} reason Cancellation reason.
   * @returns {number} Number of pending layer loads cancelled.
   */
  cancelPendingLayerLoads(reason = 'Layer loading cancelled') {
    this.layerLoadGeneration += 1;
    const pendingLoads = [...this.pendingLayerLoads.values()];
    for (const pending of pendingLoads) {
      pending.controller?.abort(new DOMException(reason, 'AbortError'));
    }
    this.pendingLayerLoads.clear();
    return pendingLoads.length;
  }

  /**
   * Add an engine-neutral runtime layer and register its application state.
   *
   * @param {Object} definition Prepared runtime layer definition.
   * @returns {Promise<*>} Resolves with the map engine's `addLayer()` result.
   * @throws {TypeError} When the definition has no `id`.
   * @throws {Error} When a layer with the same ID is already registered, or rendering fails.
   */
  async renderRuntimeLayer(definition) {
    this.assertActive();
    if (!definition?.id) {
      throw new TypeError('Layer definition requires an id');
    }
    if (this.layers.has(definition.id)) {
      throw new Error(`Layer "${definition.id}" already exists`);
    }

    // Keep only lightweight, engine-neutral metadata in the application
    // registry. Large GeoJSON payloads remain in the rendering pipeline and
    // are never cloned by getLayer(), getLayers(), or layer events.
    const state = createLayerState(definition);
    this.layers.set(state.id, state);

    try {
      const result = await this.mapEngine.addLayer(definition);
      state.loadState = 'loaded';
      this.dispatch('heurist-map-layer-state-changed', { layer: this.getLayer(state.id) });
      this.dispatch('heurist-map-layer-loaded', { layer: this.getLayer(state.id) });
      return result;
    } catch (error) {
      state.loadState = 'error';
      state.error = serializeError(error);
      this.dispatch('heurist-map-error', {
        operation: 'add-layer',
        layer: this.getLayer(state.id),
        error: state.error
      });
      throw addContext(error, `Cannot render layer "${state.title || state.id}"`);
    }
  }

  /**
   * Remove a runtime layer from the map and application registry.
   *
   * @param {string|number} layerId Runtime layer identifier.
   * @returns {Promise<boolean>} Resolves with whether a layer was removed.
   */
  async removeRuntimeLayer(layerId) {
    this.assertActive();
    if (this.selectionLayerId === layerId) await this.clearSelection();

    const pending = this.pendingLayerLoads.get(layerId);
    if (pending) {
      pending.controller?.abort(new DOMException('Layer was removed', 'AbortError'));
      this.pendingLayerLoads.delete(layerId);
    }

    if (this.deferredLayers.has(layerId)) {
      this.deferredLayers.delete(layerId);
      return this.layers.delete(layerId);
    }

    const removed = await this.mapEngine.removeLayer(layerId);
    if (removed) {
      this.layers.delete(layerId);
    }
    return removed;
  }

  /**
   * Return layer fallbacks for one document. Dynamic loading is document-specific.
   *
   * @param {?Object} document MapDocument registry entry.
   * @returns {Object} Effective layer defaults for `document`.
   */
  getLayerDefaults(document) {
    if (String(document?.id) === this.dynamicDocumentId) {
      return {
        ...(this.config.defaults || {}),
        dynamicRequests: this.config.dynamicDocument?.dynamicRequests === true
      };
    }
    return this.config.defaults || {};
  }

  /**
   * Add a MapLayer definition or persisted MapLayer record to a document.
   *
   * @param {number|Object} definition Persisted MapLayer record ID, a public MapLayer
   *        definition, or a prepared runtime layer.
   * @param {Object} [options={}] Add options.
   * @param {string|number} [options.documentId=this.activeMapDocumentId] Target MapDocument.
   * @param {AbortSignal} [options.signal] Abort signal for the underlying request.
   * @returns {Promise<Object>} Resolves with the added public layer description.
   * @throws {TypeError} When a MapLayer definition has no `source.type`.
   * @throws {Error} When the resolved layer ID already exists in the target document.
   */
  async addLayer(definition, { documentId = this.activeMapDocumentId, signal } = {}) {
    // Backward-compatible internal/runtime path used by existing integrations
    // and tests. Public MapLayer definitions use source.type and are stored on
    // the target document before being prepared by the loader registry.
    if (isPreparedRuntimeLayer(definition)) {
      return this.renderRuntimeLayer(definition);
    }
    const document = this.resolveMutableDocument(documentId);
    const requestedRuntimeId = definition && typeof definition === 'object'
      ? definition.runtimeId ?? definition.id
      : null;
    const mapLayer = typeof definition === 'number' || /^\d+$/.test(String(definition))
      ? await this.providers.mapLayer.getById(Number(definition), { signal, defaults: this.getLayerDefaults(document) })
      : normalizeMapLayer({
          ...definition,
          options: {
            ...(definition?.options || {}),
            runtimeId: requestedRuntimeId || definition?.options?.runtimeId || null
          }
        }, { defaults: this.getLayerDefaults(document) });
    if (!mapLayer.source?.type) throw new TypeError('MapLayer definition requires source.type');

    const id = createRuntimeLayerId(mapLayer, ++this.runtimeLayerSerial);
    if (document.layerDefinitions?.some((item) => String(item.reference.id) === String(id))) {
      throw new Error(`Layer "${id}" already exists in MapDocument "${document.id}"`);
    }
    const reference = {
      id,
      recordId: mapLayer.id,
      title: mapLayer.title,
      order: nextDocumentLayerOrder(document),
      visible: mapLayer.visible !== false
    };
    const stored = { mapLayer, reference, runtimeAdded: true };
    document.layerDefinitions ||= [];
    document.layerDefinitions.push(stored);

    if (String(document.id) === String(this.activeMapDocumentId)) {
      if (mapLayer.visible === false) {
        this.registerDeferredLayer(mapLayer, reference);
      } else if (this.isDynamicQueryLayer(mapLayer)) {
        this.registerDeferredLayer(mapLayer, reference, { preserveVisible: true });
        await this.refreshDynamicLayer();
      } else {
        const runtimeLayer = await this.createRuntimeLayer(mapLayer, reference, signal);
        await this.renderRuntimeLayer(runtimeLayer);
        if (stored.runtimeOpacity != null) await this.setLayerOpacity(id, stored.runtimeOpacity);
      }
    }
    this.dispatch('heurist-map-document-layer-added', {
      documentId: document.id, layerId: id, layer: this.getLayer(id)
    });
    this.dispatch('heurist-map-documents-changed', { documents: this.getMapDocuments() });
    return this.getLayer(id) || { id, recordId: mapLayer.id, title: mapLayer.title };
  }

  /**
   * Remove a layer definition and its active native representation.
   *
   * @param {string|number} layerId Runtime layer identifier.
   * @param {Object} [options={}] Remove options.
   * @param {string|number} [options.documentId=this.activeMapDocumentId] MapDocument owning the layer.
   * @returns {Promise<boolean>} Resolves with whether a stored layer definition was removed.
   */
  async removeLayer(layerId, { documentId = this.activeMapDocumentId } = {}) {
    const document = this.resolveMutableDocument(documentId);
    const index = findStoredLayerIndex(document, layerId);
    if (index < 0) return false;
    document.layerDefinitions.splice(index, 1);
    if (String(document.id) === String(this.activeMapDocumentId) && this.layers.has(layerId)) {
      await this.removeRuntimeLayer(layerId);
    }
    this.dispatch('heurist-map-document-layer-removed', { documentId: document.id, layerId });
    this.dispatch('heurist-map-documents-changed', { documents: this.getMapDocuments() });
    return true;
  }

  /**
   * Keep a layer definition but remove its data/native representation.
   *
   * @param {string|number} layerId Runtime layer identifier.
   * @param {Object} [options={}] Clear options.
   * @param {string|number} [options.documentId=this.activeMapDocumentId] MapDocument owning the layer.
   * @returns {Promise<boolean>} Resolves with whether the layer was cleared.
   */
  async clearLayer(layerId, { documentId = this.activeMapDocumentId } = {}) {
    const document = this.resolveMutableDocument(documentId);
    const stored = findStoredLayer(document, layerId);
    if (!stored) return false;
    if (String(document.id) === String(this.activeMapDocumentId)) {
      if (this.layers.has(layerId)) await this.removeRuntimeLayer(layerId);
      stored.mapLayer.visible = false;
      stored.reference.visible = false;
      this.registerDeferredLayer(stored.mapLayer, stored.reference);
    }
    this.dispatch('heurist-map-document-layer-cleared', { documentId: document.id, layerId });
    return true;
  }

  /**
   * Remember the shared Current-result query. The fixed `current-results`
   * source belongs to the predefined dynamic MapDocument; updating it must
   * never activate that document or replace an active persisted MapDocument.
   *
   * @param {*} query Query value, or `null`/`''` to clear the current-results layer.
   * @param {Object} [options={}] Query options.
   * @param {string} [options.title] Layer title used when the layer is created.
   * @param {AbortSignal} [options.signal] Abort signal for the underlying request.
   * @returns {Promise<?Object>} Resolves with the updated public layer description, or `null`.
   */
  async setQuery(query, options = {}) {
    const layerId = 'current-results';
    const normalizedQuery = query == null || query === '' ? null : query;
    const document = this.getDynamicDocumentEntry();
    if (!document) return null;
    let stored = findStoredLayer(document, layerId);

    if (!normalizedQuery) {
      if (!stored) return null;
      stored.mapLayer.source = { ...stored.mapLayer.source, query: null };
      this.dynamicRequestKeys.delete(layerId);
      if (String(this.activeMapDocumentId) === this.dynamicDocumentId && this.layers.has(layerId)) {
        await this.removeRuntimeLayer(layerId);
      }
      this.dispatch('heurist-map-query-layer-changed', {
        documentId: this.dynamicDocumentId, layerId, query: null
      });
      return null;
    }

    if (!stored) {
      // This creates the one intrinsic Current-result definition, not an
      // arbitrary query layer. It remains dormant while another MapDocument
      // is active.
      return this.addLayer({
        id: layerId,
        title: options.title || 'Filtered Result',
        visible: true,
        selectable: true,
        source: { type: 'heurist-query', query: normalizedQuery },
        style: {},
        options: { runtimeId: layerId }
      }, { documentId: this.dynamicDocumentId, signal: options.signal });
    }

    return this.setQueryForLayer(layerId, normalizedQuery, {
      ...options,
      reload: options.reload !== false
    });
  }

  /**
   * Cache and reconcile the Explorer current-result and Workspace layers.
   *
   * @param {Object} [options={}] Data-source options.
   * @param {?Object} [options.currentDataSource] Selected Explorer datasource; omission preserves selection.
   * @param {Array<Object>} [options.workspaceDataSources] Workspace snapshot; omission preserves the list.
   * @returns {Promise<boolean|Object>} Resolves with `false` outside the Explorer host, otherwise
   *          the updated public dynamic MapDocument description.
   */
  setDynamicDataSources(value = {}) {
    // Serialize reconciliation so an older search cannot replace a newer result.
    const snapshot = clonePlain(value);
    const update = this.dataSourceUpdateQueue.then(() => this.applyDynamicDataSources(snapshot));
    this.dataSourceUpdateQueue = update.catch(() => {});
    return update;
  }

  async applyDynamicDataSources(value) {
    if (this.host.getHostContext?.()?.name !== 'heurist-explorer') return false;
    if (Object.hasOwn(value, 'workspaceDataSources')) {
      this.workspaceDataSources = uniqueDataSources(value.workspaceDataSources);
    }
    if (Object.hasOwn(value, 'currentDataSource')) {
      const source = normalizeRuntimeDataSource(value.currentDataSource);
      const key = source?.reference?.key || null;
      const matching = key && this.getLayers().find((layer) =>
        layer.options?.dataSource?.reference?.key === key
        && (String(this.activeMapDocumentId) !== this.dynamicDocumentId || layer.id !== 'current-results'));
      const workspace = key && this.workspaceDataSources.some((item) => item.reference.key === key);
      this.activeDataSourceKey = key;
      this.activeDataSourceLayerId = matching?.id || null;
      if (!matching && !workspace) this.currentDataSource = source;
    }
    this.hasExplorerDataSourceSnapshot = true;
    if (String(this.activeMapDocumentId) !== this.dynamicDocumentId) {
      this.replaceExplorerDynamicLayerDefinitions();
      this.controlPanel?.refresh?.();
      return this.getDynamicDocument();
    }
    await this.reconcileDynamicDataSourceLayers();
    this.controlPanel?.refresh?.();
    return this.getDynamicDocument();
  }

  /** Build desired layers while retaining the current-result row's live controls. */
  explorerDynamicLayers(document) {
    const desired = createExplorerDynamicLayers(this.currentDataSource, this.workspaceDataSources, this.getLayerDefaults(document));
    const previous = findStoredLayer(document, 'current-results');
    if (this.currentDataSource && previous?.mapLayer.options?.dataSource) {
      const current = desired[0];
      current.mapLayer.visible = previous.mapLayer.visible !== false && previous.reference.visible !== false;
      current.reference.visible = current.mapLayer.visible;
      current.mapLayer.style = clonePlain(previous.mapLayer.style);
      current.runtimeOpacity = previous.runtimeOpacity ?? 1;
    }
    for (const item of desired) {
      item.workspaceFingerprint = JSON.stringify({ layer: item.mapLayer, opacity: item.runtimeOpacity });
    }
    return desired;
  }

  /** Selection is independent of layer visibility and feature selection. */
  isActiveDataSourceLayer(layer) {
    if (!this.activeDataSourceKey || layer.options?.dataSource?.reference?.key !== this.activeDataSourceKey) return false;
    const exact = this.layers.get(this.activeDataSourceLayerId);
    if (exact?.options?.dataSource?.reference?.key === this.activeDataSourceKey) return layer.id === exact.id;
    const workspace = [...this.layers.values()].find((item) => item.id !== 'current-results'
      && item.options?.dataSource?.reference?.key === this.activeDataSourceKey);
    return !workspace || layer.id === workspace.id;
  }

  /**
   * Replace the dynamic MapDocument's Explorer-managed layer definitions with
   * ones freshly derived from the cached current-result/Workspace data sources.
   *
   * @returns {boolean} Whether the dynamic MapDocument entry was updated.
   */
  replaceExplorerDynamicLayerDefinitions() {
    const document = this.getDynamicDocumentEntry();
    if (!document) return false;
    document.layerDefinitions = [
      ...(document.layerDefinitions || []).filter((item) => !isExplorerDynamicLayer(item)),
      ...this.explorerDynamicLayers(document)
    ];
    document.layerDefinitions.sort((a, b) => compareRuntimeLayers(
      { id: a.reference.id, order: a.reference.order }, { id: b.reference.id, order: b.reference.order }));
    return true;
  }

  /**
   * Reconcile the dynamic MapDocument's rendered layers with the cached Explorer
   * current-result/Workspace data sources, adding, removing, and reordering
   * layers as needed without disturbing unchanged ones.
   *
   * @returns {Promise<boolean>} Resolves with whether reconciliation ran (`false` when the
   *          dynamic MapDocument is disabled or not active).
   */
  async reconcileDynamicDataSourceLayers() {
    const document = this.getDynamicDocumentEntry();
    if (!document) return false;
    const desired = this.explorerDynamicLayers(document);
    const desiredById = new Map(desired.map((item) => [String(item.reference.id), item]));
    const managed = (document.layerDefinitions || []).filter(isExplorerDynamicLayer);

    if (String(this.activeMapDocumentId) !== this.dynamicDocumentId) return false;

    for (const stored of managed) {
      const id = String(stored.reference.id);
      const next = desiredById.get(id);
      if (!next || stored.workspaceFingerprint !== next.workspaceFingerprint) {
        // A query-only change on the Current-result row (the common case for an
        // Explorer search) updates the existing layer in place, loaded -> loading
        // -> loaded, instead of removing and re-adding it. Removing it first
        // would blank the panel/legend row for the duration of the reload.
        if (next && id === 'current-results' && isQueryOnlyChange(stored, next)) {
          await this.setQueryForLayer(id, next.mapLayer.source.query, { reload: true });
          stored.mapLayer = next.mapLayer;
          stored.workspaceFingerprint = next.workspaceFingerprint;
          continue;
        }
        await this.removeLayer(id, { documentId: this.dynamicDocumentId });
      }
    }

    for (const next of desired) {
      const id = String(next.reference.id);
      const existing = findStoredLayer(document, id);
      if (existing && existing.workspaceFingerprint === next.workspaceFingerprint) {
        existing.reference.order = next.reference.order;
        if (this.layers.has(id)) this.layers.get(id).order = next.reference.order;
        continue;
      }
      await this.addLayer(dynamicLayerDefinition(next), { documentId: this.dynamicDocumentId });
      const added = findStoredLayer(document, id);
      if (added) {
        added.reference.order = next.reference.order;
        if (this.layers.has(id)) this.layers.get(id).order = next.reference.order;
        added.workspaceFingerprint = next.workspaceFingerprint;
        added.runtimeOpacity = next.runtimeOpacity;
        if (next.runtimeOpacity != null && this.layers.has(id)) {
          await this.setLayerOpacity(id, next.runtimeOpacity);
        }
      }
    }
    document.layerDefinitions.sort((a, b) => compareRuntimeLayers(a.reference, b.reference));
    this.dispatch('heurist-map-documents-changed', { documents: this.getMapDocuments() });
    return true;
  }

  /**
   * Add or remove a layer's backing data source from the host Workspace.
   *
   * @param {string|number} layerId Runtime layer identifier.
   * @returns {Promise<boolean>} Resolves with `false` when the layer has no data source or the
   *          host does not support Workspace, otherwise the new "in workspace" state.
   */
  async toggleLayerWorkspace(layerId) {
    const layer = this.getLayer(layerId);
    const source = layer?.options?.dataSource;
    if (!source || !this.host.supportsWorkspace?.()) return false;
    const stored = findStoredLayer(this.getDynamicDocumentEntry(), layerId);
    const inWorkspace = stored?.mapLayer?.options?.workspaceEntry === true
      || this.host.isDataSourceInWorkspace(source);
    if (inWorkspace) await this.host.removeDataSourceFromWorkspace(source);
    else await this.host.addDataSourceToWorkspace(this.dataSourceWithLayerState(source, layer));
    if (stored?.mapLayer?.options) stored.mapLayer.options.workspaceEntry = !inWorkspace;
    if (layer.options) layer.options.workspaceEntry = !inWorkspace;
    this.controlPanel?.refresh?.();
    return !inWorkspace;
  }

  /**
   * Remove a layer's backing data source from the host Workspace.
   *
   * @param {string|number} layerId Runtime layer identifier.
   * @returns {Promise<boolean>} Resolves with `false` when the layer has no data source or the
   *          host does not support Workspace, otherwise the host removal result.
   */
  async removeLayerFromWorkspace(layerId) {
    const layer = this.getLayer(layerId);
    const source = layer?.options?.dataSource;
    if (!source || !this.host.supportsWorkspace?.()) return false;
    return this.host.removeDataSourceFromWorkspace(source);
  }

  /**
   * Ask the host to display a layer's backing data source.
   *
   * @param {string|number} layerId Runtime layer identifier.
   * @returns {Promise<boolean>} Resolves with `false` when the layer has no data source or the
   *          host does not support it, otherwise the host display result.
   */
  async showLayerDataSource(layerId) {
    const source = this.getLayer(layerId)?.options?.dataSource;
    if (!source || typeof this.host.showDatasource !== 'function') return false;
    this.activeDataSourceKey = source.reference.key;
    this.activeDataSourceLayerId = layerId;
    this.controlPanel?.refresh?.();
    return this.host.showDatasource(source);
  }

  /**
   * Merge a runtime layer's live style/opacity/visibility into a cloned data source's
   * map presentation profile.
   *
   * @param {Object} source Data source to clone and update.
   * @param {?Object} layer Public layer description providing the current live state.
   * @returns {Object} Cloned data source with an updated `presentation.map` profile.
   */
  dataSourceWithLayerState(source, layer) {
    const value = clonePlain(source);
    value.presentation ||= {};
    value.presentation.map = {
      ...(value.presentation.map || {}),
      style: clonePlain(layer?.style || {}),
      opacity: normalizeRuntimeOpacity(layer?.opacity ?? 1),
      visible: layer?.visible !== false
    };
    return value;
  }

  /**
   * Push a Workspace-linked layer's current style/opacity/visibility back to the
   * host Workspace entry, so external Workspace views stay in sync.
   *
   * @param {string|number} layerId Runtime layer identifier.
   * @returns {*} Host update result, or `null` when the layer is not a Workspace entry.
   */
  persistWorkspaceLayerState(layerId) {
    const layer = this.getLayer(layerId);
    if (layer?.options?.workspaceEntry !== true) return null;
    return this.host.updateDataSourceInWorkspace?.(
      this.dataSourceWithLayerState(layer.options.dataSource, layer)
    );
  }

  /**
   * Add a query-backed layer to the predefined dynamic MapDocument.
   *
   * @param {*} query Query value for the new layer's source.
   * @param {Object} [options={}] Layer options.
   * @param {string} [options.id] Explicit runtime layer identifier.
   * @param {string} [options.title='Query layer'] Layer title.
   * @param {string} [options.description=''] Layer description.
   * @param {boolean} [options.visible] Initial visibility, default visible.
   * @param {boolean} [options.selectable] Whether features are selectable, default selectable.
   * @param {number} [options.limit] Maximum number of results to request.
   * @param {boolean} [options.simplify] Whether to request simplified geometries.
   * @param {Object} [options.style] Layer style definition.
   * @param {Object} [options.layerOptions] Additional engine-neutral layer options (`options.options` also accepted).
   * @param {AbortSignal} [options.signal] Abort signal for the underlying request.
   * @returns {Promise<Object>} Resolves with the added public layer description.
   */
  async addQueryLayer(query, options = {}) {
    const definition = {
      id: options.id || null,
      title: options.title || 'Query layer',
      description: options.description || '',
      visible: options.visible !== false,
      selectable: options.selectable !== false,
      source: {
        type: 'heurist-query', query,
        limit: options.limit,
        simplify: options.simplify === true
      },
      style: options.style || {},
      options: options.layerOptions || options.options || {}
    };
    return this.addLayer(definition, { documentId: this.dynamicDocumentId, signal: options.signal });
  }

  /**
   * Replace the query for one dynamic query layer and optionally reload it.
   *
   * @param {string|number} layerId Runtime layer identifier.
   * @param {*} query Replacement query value.
   * @param {Object} [options={}] Options.
   * @param {boolean} [options.reload=true] Whether to reload the layer immediately when visible.
   * @param {AbortSignal} [options.signal] Abort signal used when recreating the runtime layer.
   * @returns {Promise<Object>} Resolves with the updated public layer description.
   * @throws {Error} When the dynamic MapDocument is disabled, the layer is not found in it,
   *          or the layer is not a query layer.
   */
  async setQueryForLayer(layerId, query, options = {}) {
    const document = this.getDynamicDocumentEntry();
    if (!document) throw new Error('Dynamic MapDocument is disabled');
    const stored = findStoredLayer(document, layerId);
    if (!stored) throw new Error(`Layer "${layerId}" is not in the dynamic MapDocument`);
    if (stored.mapLayer.source?.type !== 'heurist-query') {
      throw new Error(`Layer "${layerId}" is not a query layer`);
    }
    stored.mapLayer.source = { ...stored.mapLayer.source, query };
    this.dynamicRequestKeys.delete(String(layerId));
    const wasVisible = this.layers.get(layerId)?.visible ?? stored.mapLayer.visible !== false;
    if (this.isDynamicQueryLayer(stored.mapLayer)
      && String(this.activeMapDocumentId) === this.dynamicDocumentId
      && options.reload !== false && wasVisible) {
      stored.mapLayer.visible = true;
      stored.reference.visible = true;
      if (!this.layers.has(layerId)) this.registerDeferredLayer(stored.mapLayer, stored.reference, { preserveVisible: true });
      await this.refreshDynamicLayer();
    } else if (String(this.activeMapDocumentId) === this.dynamicDocumentId) {
      const reloading = options.reload !== false && wasVisible;
      if (reloading) {
        // Flag the still-present layer row as loading before tearing down its
        // runtime representation, so the panel shows the spinner throughout
        // the reload instead of nothing (removeRuntimeLayer below does not
        // itself dispatch a change, so this stays the last-rendered state).
        const state = this.layers.get(layerId);
        if (state) {
          state.loadState = 'loading';
          state.error = null;
          this.dispatch('heurist-map-layer-state-changed', { layer: this.getLayer(layerId) });
        }
      }
      if (this.layers.has(layerId)) await this.removeRuntimeLayer(layerId);
      if (!reloading) {
        stored.mapLayer.visible = false;
        stored.reference.visible = false;
        this.registerDeferredLayer(stored.mapLayer, stored.reference);
      } else {
        stored.mapLayer.visible = true;
        stored.reference.visible = true;
        const runtimeLayer = await this.createRuntimeLayer(stored.mapLayer, stored.reference, options.signal);
        await this.renderRuntimeLayer(runtimeLayer);
      }
    }
    this.dispatch('heurist-map-query-layer-changed', {
      documentId: this.dynamicDocumentId, layerId, query
    });
    return this.getLayer(layerId) || { id: layerId, title: stored.mapLayer.title };
  }

  /**
   * Resolve one mutable runtime MapDocument entry.
   *
   * @param {string|number} [documentId=this.activeMapDocumentId] MapDocument identifier.
   * @returns {Object} Mutable MapDocument registry entry, with `layerDefinitions` initialized.
   * @throws {Error} When the MapDocument is not available.
   */
  resolveMutableDocument(documentId = this.activeMapDocumentId) {
    const key = String(documentId);
    const document = this.mapDocuments.get(key) || this.mapDocuments.get(Number(key));
    if (!document) throw new Error(`MapDocument "${documentId}" is not available`);
    document.layerDefinitions ||= [];
    return document;
  }

  /**
   * Show or hide a runtime layer.
   *
   * @param {string|number} layerId Runtime layer identifier.
   * @param {boolean} visible Requested visibility.
   * @returns {Promise<void>} Resolves once the layer visibility change is applied.
   * @throws {Error} When the layer is not registered.
   */
  async setLayerVisibility(layerId, visible) {
    this.assertActive();
    const nextVisible = Boolean(visible);
    const layer = this.layers.get(layerId);

    if (!layer) {
      throw new Error(`Layer "${layerId}" is not registered`);
    }

    if (!nextVisible && this.selectionLayerId === layerId) {
      await this.clearSelection();
    }

    const pending = this.pendingLayerLoads.get(layerId);
    if (!nextVisible && pending) {
      pending.controller.abort(new DOMException('Layer hidden while loading', 'AbortError'));
      const currentDeferred = this.deferredLayers.get(layerId);
      if (currentDeferred) {
        layer.loadState = 'deferred';
        layer.error = null;
      }
    } else if (nextVisible && this.deferredLayers.has(layerId)) {
      const deferred = this.deferredLayers.get(layerId);
      if (deferred?.dynamic) {
        layer.visible = true;
      } else {
        await this.loadDeferredLayer(layerId);
      }
    } else if (!this.deferredLayers.has(layerId)) {
      await this.mapEngine.setLayerVisibility(layerId, nextVisible);
    }

    const current = this.layers.get(layerId);
    if (current) {
      current.visible = nextVisible;
    }
    const activeDocument = this.mapDocuments.get(this.activeMapDocumentId);
    const stored = activeDocument ? findStoredLayer(activeDocument, layerId) : null;
    if (stored) {
      stored.mapLayer.visible = nextVisible;
      stored.reference.visible = nextVisible;
    }

    this.dispatch('heurist-map-layer-visibility-changed', {
      layerId, visible: nextVisible, layer: this.getLayer(layerId)
    });
    this.dispatch('heurist-map-layer-state-changed', { layer: this.getLayer(layerId) });
    if (current?.options?.dynamicRequests === true || stored?.mapLayer?.options?.dynamicRequests === true) {
      this.scheduleDynamicLayerRefresh(null, { immediate: true });
    }
    this.persistWorkspaceLayerState(layerId);
  }

  /**
   * Register one failed MapLayer without aborting the containing MapDocument.
   *
   * @param {?Object} mapLayer Normalized public MapLayer definition, or `null` when unresolved.
   * @param {Object} reference MapDocument layer reference.
   * @param {*} error Error describing why the layer could not be loaded/prepared.
   * @returns {Object} Lightweight registered layer state with `loadState: 'error'`.
   */
  registerFailedLayer(mapLayer, reference, error) {
    const id = reference.id ?? `map-layer-${reference.recordId}`;
    const definition = {
      id,
      recordId: mapLayer?.id ?? reference.recordId ?? null,
      title: mapLayer?.title || reference.title || `Map layer ${reference.recordId}`,
      description: mapLayer?.description || '',
      type: mapLayer?.source?.type || null,
      visible: mapLayer?.visible !== false && reference.visible !== false,
      selectable: mapLayer?.selectable !== false,
      source: mapLayer?.source || null,
      style: mapLayer?.style || null,
      options: mapLayer?.options || null,
      order: reference.order ?? 0
    };
    const state = createLayerState(definition);
    state.loadState = 'error';
    state.error = clonePlain(error || { name: 'Error', message: 'Layer loading failed' });
    this.layers.set(id, state);
    this.deferredLayers.delete(id);
    this.dispatch('heurist-map-layer-state-changed', { layer: this.getLayer(id) });
    this.dispatch('heurist-map-error', {
      operation: 'load-map-layer',
      layer: this.getLayer(id),
      error: state.error
    });
    return state;
  }

  /**
   * Register an initially hidden MapLayer without loading its source data.
   *
   * @param {Object} mapLayer Normalized public MapLayer definition.
   * @param {Object} reference MapDocument layer reference.
   * @param {Object} [options={}] Registration options.
   * @param {boolean} [options.preserveVisible=false] Preserve the definition's own visibility
   *        instead of forcing the layer hidden (used for dynamic layers deferred by zoom range).
   * @returns {Object} Lightweight registered layer state with `loadState: 'deferred'`.
   */
  registerDeferredLayer(mapLayer, reference, { preserveVisible = false } = {}) {
    const id = reference.id ?? `map-layer-${reference.recordId}`;
    const definition = {
      id,
      recordId: mapLayer.id,
      title: mapLayer.title,
      description: mapLayer.description,
      type: mapLayer.source?.type || null,
      visible: preserveVisible ? (mapLayer.visible !== false && reference.visible !== false) : false,
      selectable: mapLayer.selectable !== false,
      source: mapLayer.source,
      style: mapLayer.style,
      options: mapLayer.options,
      visibilityMinZoom: this.resolveLayerZoomRange(mapLayer).minZoom,
      visibilityMaxZoom: this.resolveLayerZoomRange(mapLayer).maxZoom,
      order: reference.order ?? 0
    };
    const state = createLayerState(definition);
    state.visible = preserveVisible ? (mapLayer.visible !== false && reference.visible !== false) : false;
    state.loadState = 'deferred';
    this.layers.set(id, state);
    this.deferredLayers.set(id, { mapLayer, reference, dynamic: mapLayer.options?.dynamicRequests === true });
    return state;
  }

  /**
   * Load and render a previously deferred layer on first visibility request.
   * Concurrent requests for the same layer share one promise.
   *
   * @param {string|number} layerId Runtime layer identifier.
   * @returns {Promise<Object>} Rendered runtime layer definition.
   */
  async loadDeferredLayer(layerId) {
    const deferred = this.deferredLayers.get(layerId);
    if (!deferred) {
      return this.getLayer(layerId);
    }

    const existing = this.pendingLayerLoads.get(layerId);
    if (existing?.promise) {
      return existing.promise;
    }

    const controller = new AbortController();
    const loadGeneration = this.layerLoadGeneration;
    const deferredEntry = deferred;
    const state = this.layers.get(layerId);
    if (state) {
      state.loadState = 'loading';
      state.error = null;
      this.dispatch('heurist-map-layer-state-changed', {
        layer: this.getLayer(layerId)
      });
    }

    const promise = (async () => {
      try {
        const runtimeLayer = await this.createRuntimeLayer(
          deferred.mapLayer,
          deferred.reference,
          controller.signal
        );
        throwIfAborted(controller.signal);
        if (loadGeneration !== this.layerLoadGeneration
          || this.deferredLayers.get(layerId) !== deferredEntry) {
          throw new DOMException('Stale layer load', 'AbortError');
        }
        runtimeLayer.visible = true;
        await this.mapEngine.addLayer(runtimeLayer);
        throwIfAborted(controller.signal);
        if (loadGeneration !== this.layerLoadGeneration
          || this.deferredLayers.get(layerId) !== deferredEntry) {
          throw new DOMException('Stale layer render', 'AbortError');
        }

        const loadedState = createLayerState(runtimeLayer);
        loadedState.visible = true;
        loadedState.loadState = 'loaded';
        this.layers.set(layerId, loadedState);
        this.deferredLayers.delete(layerId);

        this.dispatch('heurist-map-layer-loaded', {
          layer: this.getLayer(layerId),
          deferred: true
        });
        return runtimeLayer;
      } catch (error) {
        if (state) {
          state.loadState = isAbortError(error) ? 'deferred' : 'error';
          state.error = isAbortError(error) ? null : serializeError(error);
        }
        if (!isAbortError(error)) {
          this.dispatch('heurist-map-error', {
            operation: 'load-deferred-layer',
            layer: this.getLayer(layerId),
            error: serializeError(error)
          });
          throw addContext(error, `Cannot load deferred layer "${state?.title || layerId}"`);
        }
        throw error;
      } finally {
        this.pendingLayerLoads.delete(layerId);
      }
    })();

    this.pendingLayerLoads.set(layerId, { controller, promise });
    return promise;
  }

  /**
   * Return all registered runtime layers in display order.
   * @returns {Array<Object>} Cloned runtime layer descriptions.
   */
  getLayers() {
    return [...this.layers.values()]
      .sort(compareRuntimeLayers)
      .map((layer) => ({ ...clonePlain(layer), activeDataSource: this.isActiveDataSourceLayer(layer) }));
  }

  /**
   * Return one registered runtime layer by ID.
   * @returns {?Object} Cloned runtime layer description, or null.
   */
  getLayer(layerId) {
    const layer = this.layers.get(layerId);
    return layer ? clonePlain(layer) : null;
  }

  /**
   * Return one layer stored in a MapDocument, including layers whose document
   * is inactive or whose runtime rendering failed.
   *
   * @param {string|number} layerId Runtime layer identifier.
   * @param {string|number} [documentId=this.activeMapDocumentId] MapDocument ID.
   * @returns {?Object} Lightweight stored layer state, or null.
   */
  getDocumentLayer(layerId, documentId = this.activeMapDocumentId) {
    const document = this.mapDocuments.get(String(documentId))
      || this.mapDocuments.get(Number(documentId));
    if (!document) return null;

    const stored = findStoredLayer(document, layerId);
    if (!stored) return null;

    const runtime = this.layers.get(layerId);
    return clonePlain({
      id: stored.reference.id,
      recordId: stored.reference.recordId ?? stored.mapLayer.id ?? null,
      title: stored.mapLayer.title || stored.reference.title || '',
      visible: stored.mapLayer.visible !== false && stored.reference.visible !== false,
      selectable: stored.mapLayer.selectable !== false,
      source: stored.mapLayer.source || null,
      loadState: runtime?.loadState || (stored.mapLayer.visible === false ? 'deferred' : 'stored'),
      error: runtime?.error || null
    });
  }

  /**
   * Reload a persisted MapLayer record and replace its rendered runtime layer.
   *
   * @param {string|number} layerId Runtime layer identifier.
   * @param {Object} [options={}] Reload options.
   * @param {AbortSignal} [options.signal] Abort signal for the underlying request.
   * @returns {Promise<Object>} Resolves with the rendered or deferred layer state.
   * @throws {Error} When the layer is not backed by a MapLayer record.
   */
  async reloadLayer(layerId, { signal } = {}) {
    this.assertDataIntegrationConfigured();
    const current = this.layers.get(layerId);
    if (!current?.recordId) {
      throw new Error(`Layer "${layerId}" is not backed by a MapLayer record`);
    }

    const reference = {
      id: current.id,
      recordId: current.recordId,
      order: current.order
    };
    const mapLayer = await this.providers.mapLayer.getById(current.recordId, { signal, defaults: this.config.defaults });
    const shouldBeVisible = current.visible !== false;
    await this.removeRuntimeLayer(layerId);

    if (!shouldBeVisible) {
      return this.registerDeferredLayer(mapLayer, reference);
    }

    const runtimeLayer = await this.createRuntimeLayer(mapLayer, reference, signal);
    runtimeLayer.visible = true;
    return this.renderRuntimeLayer(runtimeLayer);
  }

  /**
   * Remove all runtime layers from the application.
   *
   * @returns {Promise<void>} Resolves once every runtime layer has been removed.
   */
  async clearLayers() {
    for (const layerId of [...this.layers.keys()]) {
      await this.removeRuntimeLayer(layerId);
    }
  }

  /**
   * Set the map center and zoom.
   *
   * @param {{latitude: number, longitude: number}} center Target center coordinate.
   * @param {number} zoom Target native zoom level.
   * @param {Object} [options={}] Engine-specific view options (for example `animate`).
   * @returns {Promise<*>} Resolves when the operation completes.
   * @throws {Error} When the application has been destroyed.
   */
  async setView(center, zoom, options = {}) {
    this.assertActive();
    return this.mapEngine.setView(center, zoom, options);
  }

  /**
   * Fit the map viewport to geographic bounds.
   *
   * @param {{west: number, south: number, east: number, north: number}} bounds Target bounds.
   * @param {Object} [options={}] Engine-specific view options (for example `animate`).
   * @returns {Promise<*>} Resolves when the operation completes.
   * @throws {Error} When the application has been destroyed.
   */
  async fitBounds(bounds, options = {}) {
    this.assertActive();
    return this.mapEngine.fitBounds(bounds, options);
  }

  /**
   * Notify the map engine that its container dimensions changed.
   *
   * @returns {Promise<*>} Resolves when the operation completes.
   * @throws {Error} When the application has been destroyed.
   */
  async invalidateSize() {
    this.assertActive();
    return this.mapEngine.invalidateSize();
  }

  /**
   * Return the current engine-neutral map view state.
   *
   * @returns {*} Current map engine view state.
   * @throws {Error} When the application has been destroyed.
   */
  getViewState() {
    this.assertActive();
    return this.mapEngine.getViewState();
  }


  /**
   * Apply persisted map settings to the current application without rebuilding
   * the Leaflet engine or changing the current document/view.
   *
   * Startup-only choices (allowed/default documents and base maps) are stored
   * for the next initialization. Live UI and current-results settings are
   * applied immediately where this is safe.
   *
   * @param {Object} [settings={}] Raw map configuration settings payload.
   * @returns {Promise<{applied: boolean, requiresReload: boolean, settings: Object}>} Resolves
   *          with the normalized settings that were applied.
   * @throws {Error} When the application has been destroyed.
   */
  async applyConfiguration(settings = {}) {
    this.assertActive();
    const normalized = normalizeMapConfigurationSettings(settings);
    const previous = this.config.persistedSettings || normalizeMapConfigurationSettings({});
    const previousDefaults = previous.config.defaults || {};
    const nextDefaults = normalized.config.defaults || {};
    const previousInteraction = previous.options.interaction || {};
    const nextInteraction = normalized.options.interaction || {};
    const activeDocumentId = this.activeMapDocumentId;
    const viewState = this.mapEngine.getViewState?.() || null;
    const selection = this.getSelection();

    this.config.persistedSettings = normalized;
    this.config.documents = {
      ...(this.config.documents || {}),
      query: normalized.options.mapDocuments.allowed,
      initiallyActive: normalized.options.mapDocuments.initiallyActive == null
        ? this.dynamicDocumentId
        : normalized.options.mapDocuments.initiallyActive
    };
    this.config.ui = { ...(this.config.ui || {}), ...normalized.options.ui };
    this.config.nativeControls = { ...(this.config.nativeControls || {}), ...normalized.options.nativeControls };
    this.config.interaction = { ...(this.config.interaction || {}), ...normalized.options.interaction };
    this.config.defaults = clonePlain(nextDefaults);
    this.config.dynamicDocument = {
      ...(this.config.dynamicDocument || {}),
      ...clonePlain(normalized.config.dynamicDocument),
      id: this.dynamicDocumentId,
      keepContent: this.config.dynamicDocument?.keepContent !== false
    };

    // Base-map availability is live configuration too. Rebuild the effective
    // definitions before refreshing MapControlPanel so its Base maps section
    // immediately reflects the saved Allowed base maps selection.
    const configuredBaseMaps = resolveConfiguredBaseMaps(
      normalized.options.baseMaps,
      nextDefaults.preventContinuousWorldBasemap === true
    );
    this.baseMaps = new Map(configuredBaseMaps.map((item) => [String(item.id), clonePlain(item)]));
    this.defaultBaseMapId = configuredBaseMaps[0]?.id ?? null;
    const activeBaseMapStillAllowed = this.activeBaseMapId != null
      && this.baseMaps.has(String(this.activeBaseMapId));
    if (!activeBaseMapStillAllowed) {
      if (this.defaultBaseMapId != null) await this.setBaseMap(this.defaultBaseMapId);
      else {
        await this.mapEngine.setBaseMap(null);
        this.activeBaseMapId = null;
        this.dispatch('heurist-map-basemap-changed', { baseMap: null });
      }
    }

    const dynamicEntry = this.getDynamicDocumentEntry();
    if (dynamicEntry) {
      dynamicEntry.title = this.config.dynamicDocument.title || 'Filtered Result';
      dynamicEntry.showInPanel = this.config.ui.showCurrentDocument !== false;
    }

    // Reapply changed global defaults only to values that each stored layer
    // originally inherited. Explicit layer settings are never overwritten.
    const dynamicLoadingChanged = previous.config.dynamicDocument?.dynamicRequests !== normalized.config.dynamicDocument?.dynamicRequests;
    const layerDefaultsChanged = !sameJson(previousDefaults, nextDefaults) || dynamicLoadingChanged;
    const popupPolicyChanged = previousInteraction.popupEnabled !== nextInteraction.popupEnabled;
    let dynamicDefaultsNeedRefresh = false;
    if (layerDefaultsChanged || popupPolicyChanged) {
      for (const documentEntry of this.mapDocuments.values()) {
        for (const stored of documentEntry.layerDefinitions || []) {
          const defaultsChangedForLayer = layerDefaultsChanged
            ? reapplyMapLayerDefaults(stored.mapLayer, this.getLayerDefaults(documentEntry))
            : false;
          const layerId = stored.reference.id;
          if (String(documentEntry.id) !== String(activeDocumentId)) continue;

          const runtime = this.layers.get(layerId);
          if (!runtime) continue; // deferred/inactive definitions use current settings on next load
          const popupChangedForLayer = popupPolicyChanged && runtime.popup != null;
          if (!defaultsChangedForLayer && !popupChangedForLayer) continue;

          const wasVisible = runtime.visible !== false;
          await this.removeRuntimeLayer(layerId);
          if (this.isDynamicQueryLayer(stored.mapLayer)) {
            this.dynamicRequestKeys.delete(String(layerId));
            this.registerDeferredLayer(stored.mapLayer, stored.reference, { preserveVisible: wasVisible });
            dynamicDefaultsNeedRefresh = dynamicDefaultsNeedRefresh || wasVisible;
          } else if (wasVisible) {
            const runtimeLayer = await this.createRuntimeLayer(stored.mapLayer, stored.reference);
            runtimeLayer.visible = true;
            await this.renderRuntimeLayer(runtimeLayer);
            if (stored.runtimeOpacity != null) await this.setLayerOpacity(layerId, stored.runtimeOpacity);
          } else {
            this.registerDeferredLayer(stored.mapLayer, stored.reference);
          }
        }
      }
    }

    if (dynamicDefaultsNeedRefresh) await this.refreshDynamicLayer();

    // selectionEnabled is a global policy. Reflect its effective value in the
    // public runtime state as well as enforcing it in selection operations.
    for (const [layerId, runtime] of this.layers) {
      const activeEntry = this.mapDocuments.get(this.activeMapDocumentId);
      const stored = activeEntry ? findStoredLayer(activeEntry, layerId) : null;
      runtime.selectable = nextInteraction.selectionEnabled !== false
        && (stored?.mapLayer?.selectable !== false);
    }

    // Recompute document-specific zoom limits and the global zoom-to-point
    // fallback without changing the active document or current map view.
    const activeDocument = String(activeDocumentId) === this.dynamicDocumentId
      ? createDynamicMapDocument(this.config, dynamicEntry)
      : this.config.mapDocument;
    if (activeDocument) {
      const environment = createMapEnvironment(activeDocument, this.config.defaults);
      if (String(activeDocumentId) === this.dynamicDocumentId) {
        await this.applyDocumentZoomLimits(environment);
        this.mapEnvironment.zoomLimits = environment.zoomLimits;
        this.mapEnvironment.effectiveZoomLimits = environment.effectiveZoomLimits;
      }
      this.mapEnvironment.zoomToPointInKM = environment.zoomToPointInKM;
    }

    // Recreate the active tile layer when continuous-world behavior changes.
    if (previousDefaults.preventContinuousWorldBasemap !== nextDefaults.preventContinuousWorldBasemap
        && this.activeBaseMapId != null && this.baseMaps.has(String(this.activeBaseMapId))) {
      await this.setBaseMap(this.activeBaseMapId);
    }

    await this.mapEngine.setNativeControls?.(this.config.nativeControls || {});
    this.controlPanel?.applyOptions?.(this.config.ui);

    // Reloading current-results can clear its selection; restore it if possible.
    if (selection?.layerId === 'current-results' && Array.isArray(selection.features)) {
      const ids = [...new Set(selection.features.map((item) => item.recordId).filter((id) => id != null))];
      if (ids.length && this.layers.has('current-results')) {
        try { await this.selectRecords('current-results', ids, { replace: true, zoom: false }); } catch { /* layer may now be hidden */ }
      }
    }
    if (viewState?.bounds) await this.fitBounds(viewState.bounds, { animate: false });
    else if (viewState?.center && viewState?.zoom != null) await this.setView(viewState.center, viewState.zoom, { animate: false });

    this.dispatch('heurist-map-configuration-applied', { settings: normalized });
    return { applied: true, requiresReload: false, settings: normalized };
  }

  /**
   * Return host integration capabilities.
   *
   * @returns {{mapPreferences: boolean, mapPublishing: boolean}} Host capability flags.
   */
  getHostCapabilities() {
    return this.host?.getCapabilities?.() || { mapPreferences: false, mapPublishing: false };
  }

  /**
   * Capture the reproducible, non-persistent state of the current map.
   *
   * @returns {Object} Serializable map state suitable for {@link MapApplication#restoreMapState}.
   */
  captureMapState() {
    const view = this.getViewState();
    const currentLayer = this.getDocumentLayer('current-results', this.dynamicDocumentId);
    const selectedRecordIds = [...new Set(
      [...this.selectedFeatures.values()].map((item) => item.recordId).filter((id) => id != null)
    )];
    const layers = this.getLayers();
    return {
      extent: view?.bounds || null,
      zoom: view?.zoom ?? null,
      activeDocumentId: this.activeMapDocumentId ?? null,
      baseMap: this.activeBaseMapId ?? null,
      visibleLayerIds: layers.filter((layer) => layer.visible !== false).map((layer) => layer.id),
      layerOpacities: Object.fromEntries(layers.map((layer) => [
        String(layer.id), normalizeRuntimeOpacity(layer.opacity ?? 1)
      ])),
      activeThemes: Object.fromEntries(layers.map((layer) => [
        String(layer.id), activeThemeIndex(layer.style)
      ])),
      activeLayerId: this.selectionLayerId ?? null,
      query: currentLayer?.source?.query ?? null,
      selection: selectedRecordIds
    };
  }

  /**
   * Restore a previously captured published/initial map state.
   *
   * @param {Object} [state={}] Serialized map state from {@link MapApplication#captureMapState}.
   * @returns {Promise<boolean>} Resolves with whether the state was applied.
   */
  async restoreMapState(state = {}) {
    if (!state || typeof state !== 'object') return false;

    const targetDocument = state.activeDocumentId;
    if (targetDocument != null) {
      const key = String(targetDocument);
      const numeric = Number(targetDocument);
      if (key === this.dynamicDocumentId || this.mapDocuments.has(numeric) || this.mapDocuments.has(key)) {
        await this.activateMapDocument(targetDocument);
      }
    }

    // The saved query belongs only to the Filtered Result document. A published
    // persisted MapDocument may still carry state.query for later switching, but
    // it must not create/reload current-results while that document is active.
    if (state.query && String(this.activeMapDocumentId) === this.dynamicDocumentId) {
      const existing = this.getDocumentLayer('current-results', this.dynamicDocumentId);
      if (existing) {
        await this.setQueryForLayer('current-results', state.query, { reload: true });
      } else {
        await this.addQueryLayer(state.query, {
          id: 'current-results',
          title: 'Filtered Result',
          visible: true,
          selectable: true
        });
      }
    }

    // Restore visibility first. Making a deferred layer visible can load/recreate it
    // from the MapDocument definition, which also reapplies its stored theme/opacity.
    // Published live style state therefore has to be restored after visibility.
    if (Array.isArray(state.visibleLayerIds)) {
      const visible = new Set(state.visibleLayerIds.map(String));
      for (const layer of this.getLayers()) {
        await this.setLayerVisibility(layer.id, visible.has(String(layer.id)));
      }
    }

    if (state.activeThemes && typeof state.activeThemes === 'object') {
      for (const [layerId, themeIndex] of Object.entries(state.activeThemes)) {
        // Object.entries() always yields string keys, while runtime MapLayer ids may
        // be numeric. Resolve the stored id back to the actual key used by layers.
        const runtimeLayerId = this.findRuntimeLayerKey(layerId);
        if (!this.layers.has(runtimeLayerId)) continue;
        const index = Number(themeIndex);
        // -1/null explicitly means ordinary/default symbology and must clear any
        // thematic map marked active by the MapDocument source.
        await this.setLayerTheme(runtimeLayerId, Number.isInteger(index) && index >= 0 ? index : null);
      }
    }

    // Opacity is deliberately last among layer-state restoration: style/theme and
    // deferred layer loading may recreate native layers with their source opacity.
    if (state.layerOpacities && typeof state.layerOpacities === 'object') {
      for (const [layerId, opacity] of Object.entries(state.layerOpacities)) {
        // See activeThemes above: published object keys are strings even when the
        // corresponding runtime layer is keyed by a numeric record id.
        const runtimeLayerId = this.findRuntimeLayerKey(layerId);
        if (!this.layers.has(runtimeLayerId)) continue;
        await this.setLayerOpacity(runtimeLayerId, opacity);
      }
    }

    // Restore the published basemap after MapDocument activation because
    // activation applies the document/default basemap by design. Published
    // live state must win over that startup choice.
    if (state.baseMap != null && this.baseMaps.has(String(state.baseMap))) {
      await this.setBaseMap(state.baseMap);
    }

    if (state.extent) await this.fitBounds(state.extent);
    else if (state.zoom != null && state.center) await this.setView(state.center, state.zoom);

    if (Array.isArray(state.selection) && state.selection.length && this.getLayer('current-results')) {
      await this.selectRecords('current-results', state.selection, { replace: true, zoom: false });
    }
    return true;
  }

  /**
   * Return the current public MapDocument representation.
   *
   * @returns {Object} Cloned current MapDocument.
   */
  getMapDocument() {
    return clonePlain(this.config.mapDocument);
  }

  /**
   * Return supported application or map-engine capabilities.
   *
   * @returns {Object} Merged map-engine and application capability flags.
   */
  getCapabilities() {
    return {
      ...this.mapEngine.getCapabilities(),
      publicApi: Boolean(this.config.apiBaseUrl) && Boolean(this.config.database),
      mapDocuments: Boolean(this.providers.mapDocument),
      queryGeoJson: Boolean(this.providers.queryGeoData),
      remoteGeoJson: true,
      timeline: false,
      editing: !this.config.readonly && this.host.supportsEditing(),
      symbologyEditing: !this.config.readonly && this.host.supportsSymbologyEditing()
    };
  }

  /**
   * Release resources, handlers, requests, layers, and host integrations.
   * @returns {Promise<*>} Resolves when the operation completes.
   */
  async destroy() {
    if (this.destroyed) {
      return;
    }
    this.cancelPendingRequests('Map application destroyed');
    if (this.dynamicRefreshTimer) clearTimeout(this.dynamicRefreshTimer);
    this.dynamicRefreshTimer = null;
    this.dynamicRefreshController?.abort(new DOMException('Map application destroyed', 'AbortError'));
    this.dynamicRefreshController = null;
    this.dynamicRequestKeys.clear();
    for (const pending of this.pendingLayerLoads.values()) {
      pending.controller.abort(new DOMException('Map application destroyed', 'AbortError'));
    }
    this.pendingLayerLoads.clear();
    await this.clearSelection();
    this.deferredLayers.clear();
    this.layers.clear();
    this.controlPanel?.destroy();
    await this.mapEngine.destroy();
    await this.host.destroy();
    this.destroyed = true;
    this.initialized = false;
  }

  /**
   * Load and prepare a MapDocument's referenced MapLayer records, tolerating
   * individual layer failures and resolving dynamic-layer zoom-range conflicts.
   *
   * @param {Object} mapDocument MapDocument whose `layers` references are prepared.
   * @param {AbortSignal} [signal] Abort signal for the underlying requests.
   * @returns {Promise<Array<Object>>} Resolves with `{ mapLayer, reference, runtimeLayer?, error? }`
   *          entries in reference order.
   * @throws {DOMException} When `signal` is aborted.
   */
  async prepareReferencedLayers(mapDocument, signal) {
    const references = [...mapDocument.layers].sort(compareLayerReferences);
    const prepared = [];

    // A MapDocument is a collection of independent operational layers. One bad
    // MapLayer record must not make the whole document unusable: preserve a
    // lightweight failed entry so the panel can show the problem and retry it.
    for (const reference of references) {
      throwIfAborted(signal);
      try {
        const mapLayer = await this.providers.mapLayer.getById(reference.recordId, {
          signal,
          defaults: this.config.defaults
        });
        prepared.push({ mapLayer, reference });
      } catch (error) {
        if (isAbortError(error)) throw error;
        const contextualError = addContext(error, `Cannot load MapLayer record ${reference.recordId}`);
        prepared.push({
          mapLayer: createFailedMapLayer(reference),
          reference,
          runtimeLayer: null,
          error: serializeError(contextualError)
        });
      }
    }

    const view = this.mapEngine.getViewState?.() || null;
    const dynamicWinner = this.selectDynamicLayer(
      prepared.filter((item) => !item.error),
      view
    );
    const result = [];

    for (const item of prepared) {
      const { mapLayer, reference } = item;
      if (item.error) {
        result.push(item);
        continue;
      }
      // A layer is operationally visible only when both its MapLayer definition
      // and the containing MapDocument reference allow it. Hidden layers must be
      // registered only; they must not cause source/data requests.
      if (mapLayer.visible === false || reference.visible === false) {
        result.push({ mapLayer, reference, runtimeLayer: null });
        continue;
      }

      if (this.isDynamicQueryLayer(mapLayer) && item !== dynamicWinner) {
        result.push({ mapLayer, reference, runtimeLayer: null, dynamicDeferred: true });
        continue;
      }

      try {
        result.push({
          mapLayer,
          reference,
          runtimeLayer: await this.createRuntimeLayer(mapLayer, reference, signal, {
            viewport: this.isDynamicQueryLayer(mapLayer) ? view?.bounds : null
          })
        });
      } catch (error) {
        if (isAbortError(error)) throw error;
        const contextualError = addContext(error, `Cannot prepare MapLayer record ${reference.recordId}`);
        result.push({
          mapLayer,
          reference,
          runtimeLayer: null,
          error: serializeError(contextualError)
        });
      }
    }
    return result;
  }

  /**
   * Whether a MapLayer is a dynamic (viewport-driven) query layer.
   *
   * @param {?Object} mapLayer Normalized public MapLayer definition.
   * @returns {boolean} `true` when the layer is a Heurist query layer with dynamic requests enabled.
   */
  isDynamicQueryLayer(mapLayer) {
    return mapLayer?.source?.type === 'heurist-query' && mapLayer?.options?.dynamicRequests === true;
  }

  /**
   * Select the single dynamic query layer that should be active for the current
   * zoom level, warning when more than one candidate's zoom range overlaps.
   *
   * @param {Array<Object>} items Candidate `{ mapLayer, reference }` entries (or MapLayer-shaped items).
   * @param {?Object} [view=this.mapEngine.getViewState?.()] Current engine-neutral view state.
   * @returns {?Object} The winning candidate item, or `null` when none qualify.
   */
  selectDynamicLayer(items, view = this.mapEngine.getViewState?.()) {
    const zoom = Number(view?.zoom);
    const candidates = items.filter((item) => {
      const mapLayer = item.mapLayer || item;
      const reference = item.reference || {};
      if (!this.isDynamicQueryLayer(mapLayer) || mapLayer.visible === false || reference.visible === false) return false;
      const range = this.resolveLayerZoomRange(mapLayer);
      return (!Number.isFinite(zoom) || ((range.minZoom == null || zoom >= range.minZoom)
        && (range.maxZoom == null || zoom <= range.maxZoom)));
    });
    if (candidates.length < 2) return candidates[0] || null;

    candidates.sort((a, b) => Number(b.reference?.order ?? b.order ?? 0) - Number(a.reference?.order ?? a.order ?? 0));
    const winner = candidates[0];
    const names = candidates.map((item) => item.mapLayer?.title || item.reference?.title || item.reference?.id || 'dynamic layer');
    const message = `Dynamic layer zoom ranges overlap at zoom ${view?.zoom ?? '?'}: ${names.join(', ')}. Only "${names[0]}" is loaded.`;
    console.warn(message);
    this.dispatch('heurist-map-warning', { code: 'dynamic-layer-overlap', message, layerIds: candidates.map((item) => item.reference?.id) });
    return winner;
  }

  /**
   * Debounce (or immediately run) a dynamic-layer viewport refresh.
   *
   * @param {?Object} [view=null] Engine-neutral view state to refresh with, or `null` to
   *        resolve it from the map engine when the refresh runs.
   * @param {Object} [options={}] Scheduling options.
   * @param {boolean} [options.immediate=false] Run the refresh immediately instead of debouncing.
   * @returns {void}
   */
  scheduleDynamicLayerRefresh(view = null, { immediate = false } = {}) {
    if (this.destroyed || !this.initialized) return;
    if (this.dynamicRefreshTimer) clearTimeout(this.dynamicRefreshTimer);
    const run = () => {
      this.dynamicRefreshTimer = null;
      void this.refreshDynamicLayer(view).catch((error) => {
        if (!isAbortError(error)) this.dispatch('heurist-map-error', { operation: 'dynamic-layer-refresh', error: serializeError(error) });
      });
    };
    if (immediate) run();
    else this.dynamicRefreshTimer = setTimeout(run, this.dynamicRefreshDelay);
  }

  /**
   * Resolve a runtime-layer registry key without assuming string/number identity.
   *
   * @param {string|number} layerId Runtime layer identifier as known by the caller.
   * @returns {string|number} The registry key found in {@link MapApplication#layers}, or `layerId` unchanged.
   */
  findRuntimeLayerKey(layerId) {
    if (this.layers.has(layerId)) return layerId;
    const wanted = String(layerId);
    for (const key of this.layers.keys()) {
      if (String(key) === wanted) return key;
    }
    return layerId;
  }

  /** Resolve a deferred-layer registry key without assuming string/number identity. */
  findDeferredLayerKey(layerId) {
    if (this.deferredLayers.has(layerId)) return layerId;
    const wanted = String(layerId);
    for (const key of this.deferredLayers.keys()) {
      if (String(key) === wanted) return key;
    }
    return null;
  }

  /**
   * Resolve the winning dynamic layer for the current viewport, hide losing
   * dynamic layers, and reload the winner's data when the viewport changed.
   *
   * @param {?Object} [view=null] Engine-neutral view state, or `null` to resolve it
   *        from the map engine.
   * @returns {Promise<?Object>} Resolves with the public description of the winning
   *          layer, or `null` when there is no active document/view or no dynamic layer.
   */
  async refreshDynamicLayer(view = null) {
    const document = this.mapDocuments.get(this.activeMapDocumentId);
    if (!document) return null;
    const currentView = view?.bounds ? view : (this.mapEngine.getViewState?.() || null);
    if (!currentView?.bounds) return null;

    const entries = (document.layerDefinitions || []).map((stored) => ({ mapLayer: stored.mapLayer, reference: stored.reference }));
    const winner = this.selectDynamicLayer(entries, currentView);
    const winnerId = winner?.reference?.id != null ? String(winner.reference.id) : null;

    for (const item of entries) {
      if (!this.isDynamicQueryLayer(item.mapLayer)) continue;
      const id = String(item.reference.id);
      const runtimeKey = this.findRuntimeLayerKey(id);
      const runtime = this.layers.get(runtimeKey);
      const deferredKey = this.findDeferredLayerKey(id);
      // Deferred layers have application state but no native engine layer yet.
      // Never address the map engine for them. This also covers layers hidden by
      // configuration/reference visibility and dynamic layers outside zoom range.
      if (id !== winnerId && runtime && deferredKey === null && runtime.loadState === 'loaded') {
        if (String(this.selectionLayerId) === id) await this.clearSelection();
        await this.mapEngine.setLayerVisibility(runtimeKey, false);
      }
    }
    if (!winner) return null;

    const requestKey = dynamicViewportKey(currentView);
    const winnerRuntimeKey = this.findRuntimeLayerKey(winnerId);
    const currentState = this.layers.get(winnerRuntimeKey);
    if (requestKey && this.dynamicRequestKeys.get(winnerId) === requestKey
      && currentState?.loadState === 'loaded' && this.findDeferredLayerKey(winnerId) === null) {
      await this.mapEngine.setLayerVisibility(winnerRuntimeKey, true);
      return this.getLayer(winnerId);
    }

    this.dynamicRefreshController?.abort(new DOMException('Superseded by a newer viewport request', 'AbortError'));
    const controller = new AbortController();
    this.dynamicRefreshController = controller;
    const serial = ++this.dynamicRefreshSerial;
    const layerId = winnerId;
    const selectedRecordIds = this.selectionLayerId === layerId
      ? [...new Set(this.selectedFeatures.values())]
      : [];
    const existingRuntimeKey = this.findRuntimeLayerKey(layerId);
    const existingState = this.layers.get(existingRuntimeKey);
    if (existingState) {
      existingState.loadState = 'loading';
      existingState.error = null;
      this.dispatch('heurist-map-layer-state-changed', { layer: this.getLayer(layerId) });
    }

    try {
      const runtimeLayer = await this.createRuntimeLayer(winner.mapLayer, winner.reference, controller.signal, { viewport: currentView.bounds });
      throwIfAborted(controller.signal);
      if (serial !== this.dynamicRefreshSerial || String(this.activeMapDocumentId) !== String(document.id)) {
        throw new DOMException('Stale dynamic viewport response', 'AbortError');
      }

      const runtimeKey = this.findRuntimeLayerKey(layerId);
      const deferredKey = this.findDeferredLayerKey(layerId);
      if (deferredKey !== null) {
        this.deferredLayers.delete(deferredKey);
        this.layers.delete(runtimeKey);
      } else if (this.layers.has(runtimeKey)) {
        await this.mapEngine.removeLayer(runtimeKey);
        this.layers.delete(runtimeKey);
      }
      runtimeLayer.visible = true;
      await this.renderRuntimeLayer(runtimeLayer);
      if (requestKey) this.dynamicRequestKeys.set(layerId, requestKey);
      if (selectedRecordIds.length) {
        try { await this.selectRecords(layerId, selectedRecordIds, { replace: true, zoom: false }); } catch { /* selected records may be outside the new viewport */ }
      }
      return this.getLayer(layerId);
    } catch (error) {
      if (isAbortError(error)) {
        console.debug('Dynamic viewport request cancelled:', error.message);
        return null;
      }
      throw error;
    } finally {
      if (this.dynamicRefreshController === controller) this.dynamicRefreshController = null;
    }
  }

  /**
   * Prepare an engine-neutral runtime layer definition from a normalized MapLayer.
   *
   * @param {Object} mapLayer Normalized public MapLayer definition.
   * @param {Object} reference MapDocument layer reference.
   * @param {AbortSignal} [signal] Abort signal for the underlying loader request.
   * @param {Object} [options={}] Preparation options.
   * @param {?Object} [options.viewport=null] Viewport bounds used by viewport-driven loaders;
   *        resolved from the map engine for dynamic query layers when omitted.
   * @returns {Promise<Object>} Resolves with the prepared runtime layer definition.
   * @throws {Error} When the MapLayer loader registry is not configured.
   */
  async createRuntimeLayer(mapLayer, reference, signal, { viewport = null } = {}) {
    if (this.isDynamicQueryLayer(mapLayer) && !viewport) {
      viewport = this.mapEngine.getViewState?.()?.bounds || null;
    }
    if (!this.layerLoaders) {
      throw new Error('MapLayer loader registry is not configured');
    }
    const runtimeLayer = await this.layerLoaders.load(mapLayer, { reference, signal, application: this, viewport });
    if (this.config.interaction?.selectionEnabled === false) runtimeLayer.selectable = false;
    if (runtimeLayer.popup && this.config.interaction?.popupEnabled === false) {
      runtimeLayer.popup = { ...runtimeLayer.popup, enabled: false };
    }
    const zoomRange = this.resolveLayerZoomRange(mapLayer);
    runtimeLayer.visibilityMinZoom = zoomRange.minZoom;
    runtimeLayer.visibilityMaxZoom = zoomRange.maxZoom;
    return runtimeLayer;
  }

  /**
   * Resolve effective native visibility zooms for one MapLayer.
   *
   * @param {?Object} mapLayer Normalized public MapLayer definition.
   * @returns {{minZoom: ?number, maxZoom: ?number}} Effective native zoom visibility range.
   */
  resolveLayerZoomRange(mapLayer) {
    const options = mapLayer?.options || {};
    let minZoom = finiteNumberOrNull(options.minZoom);
    let maxZoom = finiteNumberOrNull(options.maxZoom);
    const latitude = layerReferenceLatitude(mapLayer, this.mapEngine.getViewState?.());

    if (minZoom == null && Number(options.maximumZoomKm) > 0) {
      minZoom = this.mapEngine.distanceKmToZoom?.(options.maximumZoomKm, { latitude }) ?? null;
    }
    if (maxZoom == null && Number(options.minimumZoomKm) > 0) {
      maxZoom = this.mapEngine.distanceKmToZoom?.(options.minimumZoomKm, { latitude }) ?? null;
    }
    return { minZoom, maxZoom };
  }

  /**
   * Resolve and apply MapDocument-wide native zoom limits.
   *
   * @param {Object} environment Map environment produced by {@link createMapEnvironment}.
   * @returns {Promise<void>} Resolves once the zoom limits have been applied to the map engine.
   */
  async applyDocumentZoomLimits(environment) {
    const limits = environment?.zoomLimits || {};
    let minZoom = finiteNumberOrNull(limits.minZoom);
    let maxZoom = finiteNumberOrNull(limits.maxZoom);
    const latitude = environmentReferenceLatitude(environment, this.mapEngine.getViewState?.());

    // Distance range is inverse to native zoom: a larger visible distance is
    // the minimum native zoom, while a smaller distance is the maximum zoom.
    if (minZoom == null && Number(limits.maximumZoomKm) > 0) {
      minZoom = this.mapEngine.distanceKmToZoom?.(limits.maximumZoomKm, { latitude }) ?? null;
    }
    if (maxZoom == null && Number(limits.minimumZoomKm) > 0) {
      maxZoom = this.mapEngine.distanceKmToZoom?.(limits.minimumZoomKm, { latitude }) ?? null;
    }
    await this.mapEngine.setZoomLimits?.({ minZoom, maxZoom });
    environment.effectiveZoomLimits = { minZoom, maxZoom };
  }

  /**
   * Replace the active MapDocument environment and render its prepared layers.
   *
   * @param {Object} mapDocument MapDocument to make current.
   * @param {Object} environment Map environment produced by {@link createMapEnvironment}.
   * @param {Array<Object>} preparedLayers Prepared layer entries from {@link MapApplication#prepareReferencedLayers}.
   * @returns {Promise<void>} Resolves once the environment is replaced and layers are rendered.
   */
  async replaceMapEnvironment(mapDocument, environment, preparedLayers) {
    await this.beginMapEnvironment(mapDocument, environment);
    await this.renderPreparedLayers(preparedLayers);
  }

  /**
   * Replace the visible MapDocument shell before loading its operational layers.
   * This clears the previous document immediately and applies the new bookmark
   * or bounds so a document selection always has prompt visual feedback.
   *
   * @param {Object} mapDocument MapDocument to make current.
   * @param {Object} environment Map environment produced by {@link createMapEnvironment}.
   * @returns {Promise<void>} Resolves once the map engine has been reinitialized for `environment`.
   * @throws {Error} When the new MapDocument environment cannot be initialized.
   */
  async beginMapEnvironment(mapDocument, environment) {
    await this.clearSelection();
    this.cancelPendingLayerLoads('MapDocument environment replaced');
    await this.mapEngine.destroy();
    this.deferredLayers.clear();
    this.layers.clear();
    this.dynamicRequestKeys.clear();

    try {
      await this.initializeMapEngine(environment);
      await this.applyInitialView(environment.initialView);
      await this.applyDocumentZoomLimits(environment);
    } catch (error) {
      await this.mapEngine.destroy();
      this.deferredLayers.clear();
      this.layers.clear();
      throw addContext(
        error,
        'The new MapDocument environment could not be initialized'
      );
    }

    this.config.mapDocument = normalizeMapDocument(mapDocument);
    this.mapEnvironment = environment;
    this.initialized = true;
  }

  /**
   * Render already prepared operational layers into the active environment.
   *
   * @param {Array<Object>} preparedLayers Prepared layer entries from {@link MapApplication#prepareReferencedLayers}.
   * @returns {Promise<void>} Resolves once every prepared layer has been rendered, deferred, or failed.
   */
  async renderPreparedLayers(preparedLayers) {
    for (const item of preparedLayers) {
      if (item.error) {
        this.registerFailedLayer(item.mapLayer, item.reference, item.error);
        continue;
      }

      if (!item.runtimeLayer) {
        this.registerDeferredLayer(item.mapLayer, item.reference, {
          preserveVisible: item.dynamicDeferred === true
        });
        continue;
      }

      try {
        await this.renderRuntimeLayer(item.runtimeLayer);
      } catch (error) {
        if (isAbortError(error)) throw error;
        // renderRuntimeLayer has already registered this layer as loadState=error
        // and dispatched its layer-specific error. Continue with sibling layers.
      }
    }
  }

  /**
   * Initialize the concrete map engine for a resolved map environment and wire
   * its engine-neutral interaction handlers.
   *
   * @param {Object} environment Map environment produced by {@link createMapEnvironment}.
   * @returns {Promise<void>} Resolves once the map engine has been initialized.
   */
  async initializeMapEngine(environment) {
    const initialView = environment.initialView;
    await this.mapEngine.initialize(this.container, {
      center: initialView.center,
      zoom: initialView.zoom,
      minZoom: environment.zoomLimits?.minZoom ?? undefined,
      maxZoom: environment.zoomLimits?.maxZoom ?? undefined,
      crs: environment.crs,
      baseMapProviderOptions: this.config.baseMapProviderOptions || {},
      controls: {
        ...(this.config.nativeControls || {}),
        attribution: true
      },
      baseLayer: environment.baseMapSpecified
        ? environment.baseMap
        : this.getConfiguredDefaultBaseMap()
    });
    this.mapEngine.setInteractionHandlers?.({
      onFeatureClick: (detail) => { void this.handleFeatureClick(detail); },
      onMapClick: (detail) => { void this.handleMapClick(detail); },
      onViewChange: (detail) => { this.scheduleDynamicLayerRefresh(detail); }
    });
  }

  /**
   * Apply the resolved initial view when it is bounds-based; point/view bookmarks
   * are already applied by the map engine's own initial center/zoom.
   *
   * @param {Object} initialView Resolved initial view from a map environment.
   * @returns {Promise<*>} Resolves when the operation completes.
   */
  async applyInitialView(initialView) {
    if (initialView.type === 'bounds') {
      await this.fitBounds(initialView.bounds, { animate: false });
    }
  }

  /**
   * Return the configured initial/first allowed basemap as an engine-neutral layer.
   *
   * @returns {?Object} Cloned default base-map definition, or `null` when none is configured.
   */
  getConfiguredDefaultBaseMap() {
    if (this.defaultBaseMapId == null) return null;
    const item = this.baseMaps.get(String(this.defaultBaseMapId));
    return item && item.type !== 'none' ? clonePlain(item) : null;
  }

  /**
   * Assert that Heurist public API data-integration providers/configuration are present.
   *
   * @returns {void}
   * @throws {Error} When the required providers or runtime configuration are missing.
   */
  assertDataIntegrationConfigured() {
    if (!this.providers.mapDocument || !this.providers.mapLayer || !this.providers.queryGeoData) {
      throw new Error('Heurist public API providers are not configured');
    }
    if (!this.config.apiBaseUrl || !this.config.database) {
      throw new Error(
        'MapDocument loading requires heuristModuleBootstrap.runtime.apiBaseUrl and database'
      );
    }
  }

  /**
   * Dispatch an engine-neutral application event on the map container.
   *
   * @param {string} name Event name (for example `heurist-map-ready`).
   * @param {*} detail Event detail payload.
   * @returns {void}
   */
  dispatch(name, detail) {
    this.container.dispatchEvent(new CustomEvent(name, { detail }));
  }

  /**
   * Assert that the application has not been destroyed.
   *
   * @returns {void}
   * @throws {Error} When the application has been destroyed.
   */
  assertActive() {
    if (this.destroyed) {
      throw new Error('The map application has been destroyed');
    }
  }
}

/**
 * Whether a value already looks like a prepared engine-neutral runtime layer
 * definition rather than a public MapLayer definition/record ID.
 *
 * @param {*} definition Candidate value.
 * @returns {boolean} `true` when `definition` is a usable runtime layer definition.
 */
function isPreparedRuntimeLayer(definition) {
  if (!definition || typeof definition !== 'object' || !definition.type) return false;
  if (definition.type === 'geojson') return definition.data != null;
  if (definition.type === 'tile' || definition.type === 'image') return Boolean(definition.url);
  return false;
}

/**
 * Strip internal `layerDefinitions` storage from a MapDocument registry entry.
 *
 * @param {?Object} entry MapDocument registry entry.
 * @returns {Object} Cloned public MapDocument list entry.
 */
function createPublicDocumentEntry(entry) {
  const { layerDefinitions, ...publicEntry } = entry || {};
  return clonePlain(publicEntry);
}

/**
 * Normalize a raw Explorer data source, discarding ones without a usable query.
 *
 * @param {*} value Candidate data source.
 * @returns {?Object} Cloned normalized data source, or `null` when unusable.
 */


/**
 * Normalize a list of Workspace data sources, discarding duplicates by reference key.
 *
 * @param {*} values Candidate data source list.
 * @returns {Array<Object>} Normalized, deduplicated data sources.
 */


/**
 * Build engine-neutral stored layer entries for the Explorer current-result and
 * Workspace data sources, choosing which one qualifies for viewport-driven loading.
 *
 * @param {?Object} current Explorer current-result data source, or `null`.
 * @param {Array<Object>} workspace Workspace data sources.
 * @param {Object} defaults Effective layer defaults for the dynamic MapDocument.
 * @returns {Array<Object>} Stored `{ mapLayer, reference, runtimeAdded, runtimeOpacity, workspaceFingerprint }` entries.
 */
function createExplorerDynamicLayers(current, workspace, defaults) {
  const sources = [{
    source: current || { title: 'Current result', reference: {}, request: { q: null }, presentation: { map: { visible: false } } },
    id: 'current-results', current: true, workspaceEntry: false
  }];
  for (const source of workspace) {
    sources.push({
      source,
      id: `workspace-${stableHash(source.reference.key)}`,
      current: false,
      workspaceEntry: true
    });
  }

  const viewportCandidates = sources.filter((item) => {
    const map = item.source.presentation?.map || {};
    return map.visible !== false && requestedViewportLoading(map, defaults);
  });
  viewportCandidates.sort((a, b) => resultCount(b.source) - resultCount(a.source)
    || String(a.source.reference.key).localeCompare(String(b.source.reference.key)));
  const viewportWinnerKey = viewportCandidates[0]?.source?.reference?.key || null;

  return sources.map((item, index) => {
    const map = item.source.presentation?.map || {};

    const definition = {
      id: item.id,
      title: item.source.title || (item.current ? 'Current result' : 'Workspace result'),
      visible: map.visible !== false,
      selectable: true,
      source: {
        type: 'heurist-query',
        query: clonePlain(item.source.request.q),
        geoFields: normalizeGeoPaths(map.geoFields ?? map.geofields),
        geoOutputMode: map.geoOutputMode || 'records'
      },
      style: clonePlain(map.style || {}),
      options: {
        runtimeId: item.id,
        explorerWorkspace: true,
        currentResult: item.current,
        workspaceEntry: item.workspaceEntry,
        dataSourceKey: item.source.reference.key,
        dataSource: item.source.request.q == null ? null : clonePlain(item.source),
        emptyCurrentResult: item.current && item.source.request.q == null,
        dynamicRequests: item.source.reference.key === viewportWinnerKey,
        minZoom: finiteNumberOrNull(map.minZoom),
        maxZoom: finiteNumberOrNull(map.maxZoom)
      }
    };
    const mapLayer = normalizeMapLayer(definition, { defaults });
    const reference = {
      id: item.id,
      recordId: null,
      title: definition.title,
      order: index + 1,
      visible: definition.visible
    };
    return {
      mapLayer,
      reference,
      runtimeAdded: true,
      runtimeOpacity: normalizeRuntimeOpacity(map.opacity ?? 1),
      workspaceFingerprint: JSON.stringify(definition)
    };
  });
}

/**
 * Convert a stored explorer-dynamic layer entry back into a public MapLayer definition.
 *
 * @param {Object} stored Stored `{ mapLayer, reference }` entry.
 * @returns {Object} Public MapLayer definition suitable for {@link MapApplication#addLayer}.
 */
function dynamicLayerDefinition(stored) {
  return {
    id: stored.reference.id,
    title: stored.reference.title,
    visible: stored.reference.visible,
    selectable: stored.mapLayer.selectable,
    source: clonePlain(stored.mapLayer.source),
    style: clonePlain(stored.mapLayer._sourceStyle || stored.mapLayer.style || {}),
    options: clonePlain(stored.mapLayer.options)
  };
}

/**
 * Whether a stored layer entry is managed by the Explorer current-result/Workspace
 * reconciliation logic rather than authored directly on the dynamic MapDocument.
 *
 * @param {?Object} stored Stored `{ mapLayer, reference }` entry.
 * @returns {boolean} `true` when the entry is Explorer-managed.
 */
function isExplorerDynamicLayer(stored) {
  return stored?.mapLayer?.options?.explorerWorkspace === true
    || String(stored?.reference?.id) === 'current-results';
}

/**
 * Resolve whether a data source's map presentation should use viewport-driven loading.
 *
 * @param {Object} map Data source `presentation.map` profile.
 * @param {Object} defaults Effective layer defaults for the dynamic MapDocument.
 * @returns {boolean} `true` when viewport-driven (dynamic) loading is requested.
 */
function requestedViewportLoading(map, defaults) {
  const value = map.dynamicRequests ?? map.viewportQueries ?? map.useViewportExtentQueries;
  return typeof value === 'boolean' ? value : defaults?.dynamicRequests === true;
}

/**
 * Resolve a data source's known result count for ranking viewport-loading candidates.
 *
 * @param {?Object} source Explorer/Workspace data source.
 * @returns {number} Non-negative result count, or `-1` when unknown.
 */
function resultCount(source) {
  const value = Number(source?.meta?.count);
  return Number.isFinite(value) && value >= 0 ? value : -1;
}

/**
 * Normalize a list of geo-field paths (bare strings or `{ field|code }` objects) to strings.
 *
 * @param {*} values Raw geo-field path list.
 * @returns {Array<string>} Trimmed, non-empty geo-field path strings.
 */
function normalizeGeoPaths(values) {
  return (Array.isArray(values) ? values : [])
    .map((value) => typeof value === 'object' ? value.field ?? value.code : value)
    .map((value) => String(value || '').trim()).filter(Boolean);
}

/**
 * Compute a short, stable, non-cryptographic hash (FNV-1a) for a value's string form.
 *
 * @param {*} value Value to hash (coerced to a string).
 * @returns {string} Base-36 encoded unsigned hash.
 */


/**
 * Find a base-map definition by title or ID within a base-map registry.
 *
 * @param {Map<string, Object>} baseMaps Base-map registry keyed by string ID.
 * @param {*} name Base-map title or ID to match.
 * @returns {?Object} The matching base-map definition, or `null` when not found.
 */
function findBaseMapByName(baseMaps, name) {
  const requestedName = String(name || '').trim();
  if (!requestedName) return null;

  for (const baseMap of baseMaps.values()) {
    if (String(baseMap.title || '').trim() === requestedName
      || String(baseMap.id || '').trim() === requestedName) {
      return baseMap;
    }
  }
  return null;
}

let curatedBaseMapsById = null;

/**
 * Full Heurist curated basemap catalog, independent of any site "allowed" filter.
 *
 * @returns {Map<string, Object>} Curated base-map registry keyed by string ID, memoized.
 */
function getCuratedBaseMapsById() {
  if (!curatedBaseMapsById) {
    curatedBaseMapsById = new Map(getDefaultBaseMaps().map((item) => [String(item.id), item]));
  }
  return curatedBaseMapsById;
}

/**
 * Build the synthetic MapDocument representing the current dynamic-document state.
 *
 * @param {Object} config Application configuration.
 * @param {?Object} entry Dynamic MapDocument registry entry.
 * @returns {Object} Synthetic MapDocument with `id: null` and the entry's stored layer references.
 */
function createDynamicMapDocument(config, entry) {
  const base = normalizeMapDocument(config.mapDocument || {});
  const dynamic = config.dynamicDocument || {};
  return {
    ...base,
    id: null,
    title: entry?.title || dynamic.title || 'Filtered Result',
    bounds: dynamic.bounds ?? base.bounds,
    minZoom: dynamic.minZoom ?? null,
    maxZoom: dynamic.maxZoom ?? null,
    minimumZoomKm: dynamic.minimumZoomKm ?? null,
    maximumZoomKm: dynamic.maximumZoomKm ?? null,
    layers: (entry?.layerDefinitions || []).map((item) => ({ ...item.reference }))
  };
}

/**
 * Resolve a stable runtime layer identifier for a MapLayer.
 *
 * @param {Object} mapLayer Normalized public MapLayer definition.
 * @param {number} serial Fallback serial number used when no ID can be resolved.
 * @returns {string} Runtime layer identifier.
 */
function createRuntimeLayerId(mapLayer, serial) {
  if (mapLayer?.options?.runtimeId) return String(mapLayer.options.runtimeId);
  if (mapLayer?.id) return String(mapLayer.id);
  return `dynamic-layer-${serial}`;
}

/**
 * Compute the next available display order for a new layer in a MapDocument.
 *
 * @param {Object} document MapDocument registry entry.
 * @returns {number} Next display order, one greater than the current maximum.
 */
function nextDocumentLayerOrder(document) {
  return Math.max(0, ...(document.layerDefinitions || []).map((item) => Number(item.reference.order) || 0)) + 1;
}

/**
 * Find the index of a stored layer definition within a MapDocument.
 *
 * @param {Object} document MapDocument registry entry.
 * @param {string|number} layerId Runtime layer identifier.
 * @returns {number} Index of the stored entry, or `-1` when not found.
 */
function findStoredLayerIndex(document, layerId) {
  return (document.layerDefinitions || []).findIndex((item) => String(item.reference.id) === String(layerId));
}

/**
 * Find a stored layer definition within a MapDocument.
 *
 * @param {Object} document MapDocument registry entry.
 * @param {string|number} layerId Runtime layer identifier.
 * @returns {?Object} Stored `{ mapLayer, reference }` entry, or `null` when not found.
 */
function findStoredLayer(document, layerId) {
  const index = findStoredLayerIndex(document, layerId);
  return index < 0 ? null : document.layerDefinitions[index];
}

/**
 * Build a placeholder MapLayer definition for a layer reference that failed to load.
 *
 * @param {Object} reference MapDocument layer reference.
 * @returns {Object} Minimal, non-selectable MapLayer definition.
 */
function createFailedMapLayer(reference) {
  return {
    id: reference.recordId,
    title: reference.title || `Map layer ${reference.recordId}`,
    description: '',
    visible: reference.visible !== false,
    selectable: false,
    source: null,
    style: null,
    options: {}
  };
}

/**
 * Build the lightweight registered runtime layer state kept in {@link MapApplication#layers}.
 *
 * @param {Object} definition Runtime or deferred/failed layer definition.
 * @returns {Object} Registered layer state with `loadState: 'loading'`.
 */
function createLayerState(definition) {
  const dataSource = definition.options?.dataSource || dataSourceFromLayerDefinition(definition);
  return {
    id: definition.id,
    recordId: definition.recordId ?? null,
    title: definition.title ?? '',
    description: definition.description ?? '',
    type: definition.type ?? null,
    source: clonePlain(definition.source ?? null),
    style: clonePlain(definition.style ?? null),
    popup: clonePlain(definition.popup ?? null),
    options: {
      ...(clonePlain(definition.options ?? {}) || {}),
      ...(dataSource ? { dataSource } : {})
    },
    order: Number(definition.order ?? 0),
    visible: definition.visible !== false,
    selectable: definition.selectable !== false,
    featureCount: getFeatureCount(definition),
    resultMeta: clonePlain(definition.resultMeta ?? null),
    geometryTypes: clonePlain(definition.geometryTypes ?? null),
    recordTypeIds: clonePlain(definition.recordTypeIds ?? null),
    iconContext: clonePlain(definition.iconContext ?? null),
    opacity: normalizeRuntimeOpacity(definition.opacity ?? 1),
    loadState: 'loading',
    error: null
  };
}

/**
 * Synthesize an engine-neutral data-source description from a query-backed MapLayer
 * definition, for layers not explicitly linked to an Explorer data source.
 *
 * @param {Object} definition MapLayer or runtime layer definition.
 * @returns {?Object} Synthesized data source, or `null` when not query-backed.
 */


/**
 * Count features in a GeoJSON runtime layer definition.
 *
 * @param {Object} definition Runtime layer definition.
 * @returns {?number} Feature count for GeoJSON layers, or `null` for other layer types.
 */
function getFeatureCount(definition) {
  if (definition.type !== 'geojson') {
    return null;
  }
  if (Array.isArray(definition.data?.features)) {
    return definition.data.features.length;
  }
  return definition.data ? 1 : 0;
}

/**
 * Coerce a value to a finite number, or `null` when it is empty/non-numeric.
 *
 * @param {*} value Candidate value.
 * @returns {?number} The finite number, or `null`.
 */
function finiteNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * Resolve a representative latitude for a map environment's initial view, used to
 * convert kilometre-based zoom settings to native zoom levels.
 *
 * @param {Object} environment Map environment produced by {@link createMapEnvironment}.
 * @param {?Object} viewState Current engine-neutral view state, used as a fallback.
 * @returns {number} Representative latitude, defaulting to `0`.
 */
function environmentReferenceLatitude(environment, viewState) {
  const bounds = environment?.initialView?.bounds;
  if (bounds) return (Number(bounds.south) + Number(bounds.north)) / 2;
  const latitude = environment?.initialView?.center?.latitude ?? viewState?.center?.latitude;
  return Number.isFinite(Number(latitude)) ? Number(latitude) : 0;
}

/**
 * Resolve a representative latitude for a MapLayer, used to convert kilometre-based
 * zoom settings to native zoom levels.
 *
 * @param {Object} mapLayer Normalized public MapLayer definition.
 * @param {?Object} viewState Current engine-neutral view state, used as a fallback.
 * @returns {number} Representative latitude, defaulting to `0`.
 */
function layerReferenceLatitude(mapLayer, viewState) {
  const bounds = mapLayer?.source?.bounds;
  if (bounds) return (Number(bounds.south) + Number(bounds.north)) / 2;
  const latitude = viewState?.center?.latitude;
  return Number.isFinite(Number(latitude)) ? Number(latitude) : 0;
}

/**
 * Build a cache key identifying a dynamic layer's current viewport request, so
 * repeated identical requests can be skipped.
 *
 * @param {?Object} view Engine-neutral view state.
 * @returns {?string} Cache key combining zoom and bounds, or `null` when incomplete.
 */
function dynamicViewportKey(view) {
  const bounds = view?.bounds;
  const zoom = Number(view?.zoom);
  if (!bounds || !Number.isFinite(zoom)) return null;
  const values = [bounds.west, bounds.south, bounds.east, bounds.north].map((value) => Number(value));
  if (!values.every(Number.isFinite)) return null;
  return `${zoom}|${values.map((value) => value.toFixed(5)).join(',')}`;
}

/**
 * Sort comparator for MapDocument layer references by order, then record ID.
 *
 * @param {Object} a First layer reference.
 * @param {Object} b Second layer reference.
 * @returns {number} Negative, zero, or positive per the standard comparator contract.
 */
function compareLayerReferences(a, b) {
  const orderDifference = Number(a.order || 0) - Number(b.order || 0);
  return orderDifference || Number(a.recordId || a.id) - Number(b.recordId || b.id);
}

/**
 * Sort comparator for runtime layer states by order, then ID.
 *
 * @param {Object} a First runtime layer state.
 * @param {Object} b Second runtime layer state.
 * @returns {number} Negative, zero, or positive per the standard comparator contract.
 */
function compareRuntimeLayers(a, b) {
  if (a.id === 'current-results' && b.id !== 'current-results') return -1;
  if (b.id === 'current-results' && a.id !== 'current-results') return 1;
  return Number(a.order || 0) - Number(b.order || 0)
    || String(a.id).localeCompare(String(b.id));
}

/**
 * Combine an internal AbortSignal with an optional caller-supplied one, aborting
 * when either fires.
 *
 * @param {AbortSignal} internalSignal Signal owned by the calling operation.
 * @param {?AbortSignal} externalSignal Optional caller-supplied signal.
 * @returns {AbortSignal} Combined signal that aborts when either input aborts.
 */
function combineAbortSignals(internalSignal, externalSignal) {
  if (!externalSignal) return internalSignal;
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any([internalSignal, externalSignal]);
  }
  const controller = new AbortController();
  const abort = (signal) => controller.abort(
    signal.reason || new DOMException('The request was aborted', 'AbortError')
  );
  for (const signal of [internalSignal, externalSignal]) {
    if (signal.aborted) {
      abort(signal);
      break;
    }
    signal.addEventListener('abort', () => abort(signal), { once: true });
  }
  return controller.signal;
}

/**
 * Throw when an abort signal has already fired.
 *
 * @param {?AbortSignal} signal Signal to check.
 * @returns {void}
 * @throws {Error} The signal's abort reason, or a generic `AbortError` when `signal` is aborted.
 */
function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw signal.reason instanceof Error
      ? signal.reason
      : new DOMException('The request was aborted', 'AbortError');
  }
}

/**
 * Whether an error represents a cancelled (aborted) operation.
 *
 * @param {*} error Candidate error.
 * @returns {boolean} `true` when `error.name === 'AbortError'`.
 */
function isAbortError(error) {
  return error?.name === 'AbortError';
}

/**
 * Wrap an error with additional human-readable context while preserving its
 * name and transport-related properties, and passing abort errors through unchanged.
 *
 * @param {*} error Original error.
 * @param {string} context Context message prefixed to the error message.
 * @returns {*} The original abort error, or a new contextualized `Error`.
 */
function addContext(error, context) {
  if (isAbortError(error)) return error;
  const contextualError = new Error(`${context}: ${error?.message || String(error)}`, { cause: error });
  contextualError.name = error?.name || 'Error';
  for (const property of ['status', 'statusText', 'url', 'method', 'code', 'details']) {
    if (error?.[property] !== undefined) contextualError[property] = error[property];
  }
  return contextualError;
}

/**
 * Coerce a value to a positive integer record ID suitable for selection tracking.
 *
 * @param {*} value Candidate value.
 * @returns {?number} The positive integer record ID, or `null`.
 */
function normalizeSelectedRecordId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Resolve the effective, ordered base-map catalog from site settings.
 *
 * @param {Object} [settings={}] Base-map settings (`allowed` IDs, `initial` ID).
 * @param {boolean} [preventContinuousWorldBasemap=false] Disable continuous world wrapping on tile base maps.
 * @returns {Array<Object>} Effective base-map definitions, with the initial base map first.
 */
function resolveConfiguredBaseMaps(settings = {}, preventContinuousWorldBasemap = false) {
  const defaults = getDefaultBaseMaps();
  const defaultById = new Map(defaults.map((item) => [String(item.id), item]));
  let result = defaults;
  if (Array.isArray(settings?.allowed)) {
    result = settings.allowed.map((id) => {
      const key = String(id);
      return defaultById.get(key) || {
        id: key,
        title: key,
        type: key === 'None' ? 'none' : 'tile',
        provider: key
      };
    });
  }
  if (preventContinuousWorldBasemap) {
    result = result.map((item) => item.type === 'tile' ? { ...item, noWrap: true } : item);
  }
  if (settings?.initial != null) {
    const index = result.findIndex((item) => String(item.id) === String(settings.initial));
    if (index > 0) result = [result[index], ...result.slice(0, index), ...result.slice(index + 1)];
  }
  return result;
}

/** Style keys accepted by the main-Heurist vector symbology editor/storage contract. */
const VECTOR_SYMBOL_KEYS = new Set([
  'iconType', 'iconUrl', 'iconFont', 'iconSize', 'iconAnchor', 'popupAnchor',
  'color', 'fillColor', 'weight', 'opacity', 'fillOpacity', 'fill', 'stroke',
  'dashArray', 'radius'
]);

/**
 * Reduce a runtime/normalized style to the sparse `{ symbol, thematic? }` shape
 * accepted by the main-Heurist symbology editor and persisted as DT_SYMBOLOGY.
 *
 * @param {*} style Runtime or source style value.
 * @returns {Object} Canonical vector symbology, either a bare symbol or `{ symbol, thematic }`.
 */
function canonicalVectorSymbology(style) {
  const value = style && typeof style === 'object' && !Array.isArray(style) ? style : {};
  const rawSymbol = value.symbol && typeof value.symbol === 'object' && !Array.isArray(value.symbol)
    ? value.symbol
    : value;
  const symbol = {};
  for (const [key, raw] of Object.entries(rawSymbol || {})) {
    if (!VECTOR_SYMBOL_KEYS.has(key) || raw === undefined || raw === null) continue;
    let item = clonePlain(raw);
    // iconSize is the canonical marker diameter. Runtime normalization uses a
    // square [w,h] pair for engines, but the main-Heurist editor/storage contract
    // uses one scalar size.
    if (key === 'iconSize' && Array.isArray(item)) item = item[0];
    symbol[key] = item;
  }

  const thematic = Array.isArray(value.thematic)
    ? clonePlain(value.thematic)
    : [];

  return thematic.length ? { symbol, thematic } : symbol;
}

/**
 * Whether two values are deeply equal by JSON serialization.
 *
 * @param {*} left First value.
 * @param {*} right Second value.
 * @returns {boolean} `true` when both values serialize identically.
 */
function sameJson(left, right) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

/**
 * Whether a stored dynamic layer entry and its desired replacement differ
 * only in their query (not style, geo fields, options, or opacity).
 *
 * @param {{mapLayer: Object, runtimeOpacity?: number}} stored Currently stored layer entry.
 * @param {{mapLayer: Object, runtimeOpacity?: number}} next Desired replacement layer entry.
 * @returns {boolean}
 */
function isQueryOnlyChange(stored, next) {
  const strip = (item) => {
    const mapLayer = clonePlain(item.mapLayer) || {};
    if (mapLayer.source) mapLayer.source = { ...mapLayer.source, query: null };
    // `options.dataSource` embeds the whole originating DataSource (including
    // its own `request.q` and result `meta`, e.g. `count`) as metadata; a
    // re-resolved parameterized query changes those too - almost always a
    // different result count - without making this a different data source.
    const embedded = mapLayer.options?.dataSource;
    if (embedded) {
      mapLayer.options = { ...mapLayer.options, dataSource: {
        ...embedded,
        request: embedded.request ? { ...embedded.request, q: null } : embedded.request,
        meta: embedded.meta ? {} : embedded.meta
      } };
    }
    return { mapLayer, opacity: item.runtimeOpacity };
  };
  return sameJson(strip(stored), strip(next));
}

/**
 * Deep-clone a plain JSON-serializable value.
 *
 * @param {*} value Value to clone.
 * @returns {*} Cloned value, or `undefined` when `value` is `undefined`.
 */
function clonePlain(value) {
  if (value === undefined) return undefined;
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

/**
 * Reduce an error to a plain, serializable `{ name, message, code, status }` shape
 * suitable for dispatched application events.
 *
 * @param {*} error Source error.
 * @returns {{name: string, message: string, code: *, status: *}} Serializable error description.
 */
function serializeError(error) {
  return {
    name: error?.name || 'Error',
    message: error?.message || String(error),
    code: error?.code ?? null,
    status: error?.status ?? null
  };
}

/**
 * Resolve the index of the currently active thematic map within a layer style.
 *
 * @param {*} style Runtime or source style value.
 * @returns {number} Index of the active thematic map, or `-1` when none is active.
 */
function activeThemeIndex(style) {
  const thematic = Array.isArray(style?.thematic)
    ? style.thematic
    : Array.isArray(style?.thematic?.maps)
      ? style.thematic.maps
      : [];
  return thematic.findIndex((theme) => theme?.active === true);
}

/**
 * Normalize a runtime opacity value expressed as either a 0-1 fraction or a
 * 0-100 percentage to a clamped 0-1 fraction.
 *
 * @param {*} value Raw opacity value.
 * @returns {number} Normalized opacity in the `[0, 1]` range, defaulting to `1`.
 */
function normalizeRuntimeOpacity(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 1;
  const normalized = number > 1 ? number / 100 : number;
  return Math.min(1, Math.max(0, normalized));
}
