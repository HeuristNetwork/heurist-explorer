/**
 * MapApplication.js - Engine-neutral map controller
 *
 * @fileOverview Coordinates map initialization, MapDocument loading, layer preparation, rendering, application state, cancellation, and public map operations.
 * @project     Heurist mapping application
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2026 Heurist Network
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @author      Artem Osmakov <osmakov@gmail.com>
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
   * Create and initialize the class instance.
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

  /** Create the predefined non-persistent MapDocument entry. */
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

  /** Return the internal dynamic MapDocument entry. */
  getDynamicDocumentEntry() {
    return this.mapDocuments.get(this.dynamicDocumentId) || null;
  }

  /** Return the public dynamic MapDocument description. */
  getDynamicDocument() {
    const entry = this.getDynamicDocumentEntry();
    return entry ? createPublicDocumentEntry(entry) : null;
  }

  /**
   * Initialize the component and its required resources.
   * @returns {Promise<*>} Resolves when the operation completes.
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

  /** Load the lightweight list of available MapDocuments. */
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

  /** Return available MapDocuments in API order. */
  getMapDocuments() { return [...this.mapDocuments.values()].map(createPublicDocumentEntry); }

  /** Return the active MapDocument list entry. */
  getActiveMapDocument() {
    const item = this.mapDocuments.get(this.activeMapDocumentId);
    return item ? createPublicDocumentEntry(item) : null;
  }

  /** Activate exactly one persisted MapDocument. */
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

  /** Activate the predefined dynamic MapDocument using stored layer definitions. */
  async activateDynamicMapDocument({ signal, force = false } = {}) {
    const item = this.getDynamicDocumentEntry();
    if (!item) throw new Error('Dynamic MapDocument is disabled');
    if (!force && this.activeMapDocumentId === this.dynamicDocumentId) return this.getMapDocument();

    // Workspace changes made while another MapDocument is active remain only
    // in the cached DataSource snapshot. Materialise them immediately before
    // activation so inactive documents are not mutated in the background.
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

  /** Reload a persisted MapDocument and keep it active. */
  async reloadMapDocument(documentId = this.activeMapDocumentId, options = {}) {
    if (!documentId) throw new Error('No MapDocument is active');
    return this.activateMapDocument(documentId, { ...options, force: true });
  }

  /** Unload the active MapDocument layers and restore the default base map. */
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

  /** Zoom to a document bookmark, bounds, or combined visible layer extent. */
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

  /** Zoom to the active MapDocument. */
  async zoomHome() {
    if (this.activeMapDocumentId) return this.zoomToMapDocument(this.activeMapDocumentId);
    const view = this.mapEnvironment.initialView;
    if (view.type === 'bounds') return this.fitBounds(view.bounds, { animate: false });
    return this.setView(view.center, view.zoom, { animate: false });
  }

  /** Return configured engine-neutral base-map definitions. */
  getBaseMaps() { return [...this.baseMaps.values()].map(clonePlain); }

  /** Return the active base-map definition. */
  getActiveBaseMap() {
    const item = this.baseMaps.get(String(this.activeBaseMapId));
    return item ? clonePlain(item) : null;
  }

  /** Replace the active base map while preserving operational layers. */
  async setBaseMap(baseMapId) {
    const item = this.baseMaps.get(String(baseMapId));
    if (!item) throw new Error(`Unknown base map "${baseMapId}"`);
    await this.mapEngine.setBaseMap(item.type === 'none' ? null : item);
    this.activeBaseMapId = item.id;
    this.dispatch('heurist-map-basemap-changed', { baseMap: clonePlain(item) });
    return clonePlain(item);
  }

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

  async restoreDefaultBaseMap() {
    if (this.defaultBaseMapId != null && this.baseMaps.has(String(this.defaultBaseMapId))) {
      return this.setBaseMap(this.defaultBaseMapId);
    }
    await this.mapEngine.setBaseMap(null);
    this.activeBaseMapId = null;
    this.dispatch('heurist-map-basemap-changed', { baseMap: null });
    return null;
  }

  /** Zoom to a layer extent from source metadata or the map engine. */
  async zoomToLayer(layerId) {
    const layer = this.layers.get(layerId);
    if (!layer) throw new Error(`Layer "${layerId}" is not registered`);
    const bounds = layer.source?.bounds || await this.mapEngine.getLayerBounds(layerId);
    if (!bounds) throw new Error(`Layer "${layer.title || layerId}" does not define an extent`);
    return this.fitBounds(bounds, { animate: false });
  }

  /** Apply a runtime global opacity multiplier; accepts 0-1 or 0-100. */
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

  /** Activate one thematic map for a layer, or use null for the ordinary/default symbology. */
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

  /** Replace a layer style in memory and redraw it without reloading geometry/data. */
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

  /** Open the host symbology editor and apply the returned canonical DT_SYMBOLOGY value. */
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

  /** Apply synchronized record IDs to the first visible layer containing them. */
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

  /** Return the lightweight single-layer selection. */
  getSelection() {
    return this.selectionLayerId == null
      ? null
      : {
          layerId: this.selectionLayerId,
          features: [...this.selectedFeatures].map(([featureId, recordId]) => ({ featureId, recordId }))
        };
  }

  /** Select one feature, optionally adding/toggling within the same layer. */
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

  /** Select all rendered geometries for one record in a selectable layer. */
  async selectRecord(layerId, recordId, options = {}) {
    return this.selectRecords(layerId, [recordId], {
      replace: true,
      zoom: options.zoom === true
    });
  }

  /** Select all rendered geometries for multiple records in one selectable layer. */
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

  /** Clear selected features and restore their native styles. */
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

  /** Zoom to all selected geometries. */
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

  /** Handle an engine-neutral feature click. */
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

  /** Handle a background map click and clear current selection. */
  async handleMapClick(detail) {
    this.dispatch('heurist-map-map-click', { latlng: detail.latlng || null });
    await this.clearSelection();
  }

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
   * @returns {Promise<*>} Resolves when the operation completes.
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
   * @returns {boolean} Operation result.
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
   * @returns {Promise<*>} Resolves when the operation completes.
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

  /** Return layer fallbacks for one document. Dynamic loading is document-specific. */
  getLayerDefaults(document) {
    if (String(document?.id) === this.dynamicDocumentId) {
      return {
        ...(this.config.defaults || {}),
        dynamicRequests: this.config.dynamicDocument?.dynamicRequests === true
      };
    }
    return this.config.defaults || {};
  }

  /** Add a MapLayer definition or persisted MapLayer record to a document. */
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

  /** Remove a layer definition and its active native representation. */
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

  /** Keep a layer definition but remove its data/native representation. */
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

  /** Cache and reconcile the Explorer current-result and Workspace layers. */
  async setDynamicDataSources({ currentDataSource = null, workspaceDataSources = [] } = {}) {
    if (this.host.getHostContext?.()?.name !== 'heurist-explorer') return false;
    this.currentDataSource = normalizeRuntimeDataSource(currentDataSource);
    this.workspaceDataSources = uniqueDataSources(workspaceDataSources);
    this.hasExplorerDataSourceSnapshot = true;
    if (String(this.activeMapDocumentId) !== this.dynamicDocumentId) {
      return this.getDynamicDocument();
    }
    await this.reconcileDynamicDataSourceLayers();
    return this.getDynamicDocument();
  }

  replaceExplorerDynamicLayerDefinitions() {
    const document = this.getDynamicDocumentEntry();
    if (!document) return false;
    document.layerDefinitions = [
      ...(document.layerDefinitions || []).filter((item) => !isExplorerDynamicLayer(item)),
      ...createExplorerDynamicLayers(
        this.currentDataSource,
        this.workspaceDataSources,
        this.getLayerDefaults(document)
      )
    ];
    return true;
  }

  async reconcileDynamicDataSourceLayers() {
    const document = this.getDynamicDocumentEntry();
    if (!document) return false;
    const desired = createExplorerDynamicLayers(
      this.currentDataSource,
      this.workspaceDataSources,
      this.getLayerDefaults(document)
    );
    const desiredById = new Map(desired.map((item) => [String(item.reference.id), item]));
    const managed = (document.layerDefinitions || []).filter(isExplorerDynamicLayer);

    if (String(this.activeMapDocumentId) !== this.dynamicDocumentId) return false;

    for (const stored of managed) {
      const id = String(stored.reference.id);
      const next = desiredById.get(id);
      if (!next || stored.workspaceFingerprint !== next.workspaceFingerprint) {
        await this.removeLayer(id, { documentId: this.dynamicDocumentId });
      }
    }

    for (const next of desired) {
      const id = String(next.reference.id);
      const existing = findStoredLayer(document, id);
      if (existing && existing.workspaceFingerprint === next.workspaceFingerprint) {
        existing.reference.order = next.reference.order;
        continue;
      }
      await this.addLayer(dynamicLayerDefinition(next), { documentId: this.dynamicDocumentId });
      const added = findStoredLayer(document, id);
      if (added) {
        added.workspaceFingerprint = next.workspaceFingerprint;
        added.runtimeOpacity = next.runtimeOpacity;
        if (next.runtimeOpacity != null && this.layers.has(id)) {
          await this.setLayerOpacity(id, next.runtimeOpacity);
        }
      }
    }
    document.layerDefinitions.sort((a, b) => Number(a.reference.order) - Number(b.reference.order));
    this.dispatch('heurist-map-documents-changed', { documents: this.getMapDocuments() });
    return true;
  }

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

  async removeLayerFromWorkspace(layerId) {
    const layer = this.getLayer(layerId);
    const source = layer?.options?.dataSource;
    if (!source || !this.host.supportsWorkspace?.()) return false;
    return this.host.removeDataSourceFromWorkspace(source);
  }

  async showLayerDataSource(layerId) {
    const source = this.getLayer(layerId)?.options?.dataSource;
    if (!source || typeof this.host.showDatasource !== 'function') return false;
    return this.host.showDatasource(source);
  }

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

  persistWorkspaceLayerState(layerId) {
    const layer = this.getLayer(layerId);
    if (layer?.options?.workspaceEntry !== true) return null;
    return this.host.updateDataSourceInWorkspace?.(
      this.dataSourceWithLayerState(layer.options.dataSource, layer)
    );
  }

  /** Add a query-backed layer to the predefined dynamic MapDocument. */
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

  /** Replace the query for one dynamic query layer and optionally reload it. */
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
      if (this.layers.has(layerId)) await this.removeRuntimeLayer(layerId);
      if (options.reload === false || !wasVisible) {
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

  /** Resolve one mutable runtime MapDocument entry. */
  resolveMutableDocument(documentId = this.activeMapDocumentId) {
    const key = String(documentId);
    const document = this.mapDocuments.get(key) || this.mapDocuments.get(Number(key));
    if (!document) throw new Error(`MapDocument "${documentId}" is not available`);
    document.layerDefinitions ||= [];
    return document;
  }

  /**
   * Show or hide a runtime layer.
   * @returns {Promise<*>} Resolves when the operation completes.
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
   * Register an initially hidden MapLayer without loading its source data.
   *
   * @param {Object} mapLayer Normalized public MapLayer definition.
   * @param {Object} reference MapDocument layer reference.
   * @returns {Object} Lightweight registered layer state.
   */
  /** Register one failed MapLayer without aborting the containing MapDocument. */
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
      .map(clonePlain);
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
   * @returns {Promise<*>} Resolves when the operation completes.
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
   * @returns {Promise<*>} Resolves when the operation completes.
   */
  async clearLayers() {
    for (const layerId of [...this.layers.keys()]) {
      await this.removeRuntimeLayer(layerId);
    }
  }

  /**
   * Set the map center and zoom.
   * @returns {Promise<*>} Resolves when the operation completes.
   */
  async setView(center, zoom, options = {}) {
    this.assertActive();
    return this.mapEngine.setView(center, zoom, options);
  }

  /**
   * Fit the map viewport to geographic bounds.
   * @returns {Promise<*>} Resolves when the operation completes.
   */
  async fitBounds(bounds, options = {}) {
    this.assertActive();
    return this.mapEngine.fitBounds(bounds, options);
  }

  /**
   * Notify the map engine that its container dimensions changed.
   * @returns {Promise<*>} Resolves when the operation completes.
   */
  async invalidateSize() {
    this.assertActive();
    return this.mapEngine.invalidateSize();
  }

  /**
   * Return the current engine-neutral map view state.
   * @returns {*} Method result.
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

  /** Return host integration capabilities. */
  getHostCapabilities() {
    return this.host?.getCapabilities?.() || { mapPreferences: false, mapPublishing: false };
  }

  /** Capture the reproducible, non-persistent state of the current map. */
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

  /** Restore a previously captured published/initial map state. */
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
   * @returns {*} Method result.
   */
  getMapDocument() {
    return clonePlain(this.config.mapDocument);
  }

  /**
   * Return supported application or map-engine capabilities.
   * @returns {*} Method result.
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
   * Prepare referenced layers.
   * @returns {Promise<*>} Resolves when the operation completes.
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

  isDynamicQueryLayer(mapLayer) {
    return mapLayer?.source?.type === 'heurist-query' && mapLayer?.options?.dynamicRequests === true;
  }

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
   * Create runtime layer.
   * @returns {Promise<*>} Resolves when the operation completes.
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

  /** Resolve effective native visibility zooms for one MapLayer. */
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

  /** Resolve and apply MapDocument-wide native zoom limits. */
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
   * Replace map environment.
   * @returns {Promise<*>} Resolves when the operation completes.
   */
  async replaceMapEnvironment(mapDocument, environment, preparedLayers) {
    await this.beginMapEnvironment(mapDocument, environment);
    await this.renderPreparedLayers(preparedLayers);
  }

  /**
   * Replace the visible MapDocument shell before loading its operational layers.
   * This clears the previous document immediately and applies the new bookmark
   * or bounds so a document selection always has prompt visual feedback.
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

  /** Render already prepared operational layers into the active environment. */
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
   * Initialize map engine.
   * @returns {Promise<*>} Resolves when the operation completes.
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
   * Apply initial view.
   * @returns {Promise<*>} Resolves when the operation completes.
   */
  async applyInitialView(initialView) {
    if (initialView.type === 'bounds') {
      await this.fitBounds(initialView.bounds, { animate: false });
    }
  }

  /** Return the configured initial/first allowed basemap as an engine-neutral layer. */
  getConfiguredDefaultBaseMap() {
    if (this.defaultBaseMapId == null) return null;
    const item = this.baseMaps.get(String(this.defaultBaseMapId));
    return item && item.type !== 'none' ? clonePlain(item) : null;
  }

  /**
   * Assert data integration configured.
   * @returns {*} Method result.
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
   * Dispatch.
   * @returns {*} Method result.
   */
  dispatch(name, detail) {
    this.container.dispatchEvent(new CustomEvent(name, { detail }));
  }

  /**
   * Assert active.
   * @returns {*} Method result.
   */
  assertActive() {
    if (this.destroyed) {
      throw new Error('The map application has been destroyed');
    }
  }
}

function isPreparedRuntimeLayer(definition) {
  if (!definition || typeof definition !== 'object' || !definition.type) return false;
  if (definition.type === 'geojson') return definition.data != null;
  if (definition.type === 'tile' || definition.type === 'image') return Boolean(definition.url);
  return false;
}

function createPublicDocumentEntry(entry) {
  const { layerDefinitions, ...publicEntry } = entry || {};
  return clonePlain(publicEntry);
}

function normalizeRuntimeDataSource(value) {
  if (!value || typeof value !== 'object' || !value.reference || !value.request) return null;
  if (value.request.q == null || value.request.q === '') return null;
  return clonePlain(value);
}

function uniqueDataSources(values) {
  const result = [];
  const keys = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const source = normalizeRuntimeDataSource(value);
    const key = source?.reference?.key;
    if (!source || !key || keys.has(key)) continue;
    keys.add(key);
    result.push(source);
  }
  return result;
}

function createExplorerDynamicLayers(current, workspace, defaults) {
  const currentKey = current?.reference?.key || null;
  const workspaceCurrent = currentKey
    ? workspace.find((source) => source.reference?.key === currentKey)
    : null;
  const currentSource = current
    ? mergeDataSourceMapProfile(current, workspaceCurrent?.presentation?.map)
    : null;
  const sources = [];
  if (currentSource) sources.push({ source: currentSource, id: 'current-results', current: true, workspaceEntry: Boolean(workspaceCurrent) });
  for (const source of workspace) {
    if (source.reference?.key === currentKey) continue;
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
        dataSource: clonePlain(item.source),
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

function isExplorerDynamicLayer(stored) {
  return stored?.mapLayer?.options?.explorerWorkspace === true
    || String(stored?.reference?.id) === 'current-results';
}

function requestedViewportLoading(map, defaults) {
  const value = map.dynamicRequests ?? map.viewportQueries ?? map.useViewportExtentQueries;
  return typeof value === 'boolean' ? value : defaults?.dynamicRequests === true;
}

function resultCount(source) {
  const value = Number(source?.meta?.count);
  return Number.isFinite(value) && value >= 0 ? value : -1;
}

function normalizeGeoPaths(values) {
  return (Array.isArray(values) ? values : [])
    .map((value) => typeof value === 'object' ? value.field ?? value.code : value)
    .map((value) => String(value || '').trim()).filter(Boolean);
}

function mergeDataSourceMapProfile(source, mapOverride) {
  if (!mapOverride) return clonePlain(source);
  const result = clonePlain(source);
  result.presentation ||= {};
  result.presentation.map = { ...(result.presentation.map || {}), ...clonePlain(mapOverride) };
  return result;
}

function stableHash(value) {
  let hash = 2166136261;
  const text = String(value || '');
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

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

/** Full Heurist curated basemap catalog, independent of any site "allowed" filter. */
function getCuratedBaseMapsById() {
  if (!curatedBaseMapsById) {
    curatedBaseMapsById = new Map(getDefaultBaseMaps().map((item) => [String(item.id), item]));
  }
  return curatedBaseMapsById;
}

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

function createRuntimeLayerId(mapLayer, serial) {
  if (mapLayer?.options?.runtimeId) return String(mapLayer.options.runtimeId);
  if (mapLayer?.id) return String(mapLayer.id);
  return `dynamic-layer-${serial}`;
}

function nextDocumentLayerOrder(document) {
  return Math.max(0, ...(document.layerDefinitions || []).map((item) => Number(item.reference.order) || 0)) + 1;
}

function findStoredLayerIndex(document, layerId) {
  return (document.layerDefinitions || []).findIndex((item) => String(item.reference.id) === String(layerId));
}

function findStoredLayer(document, layerId) {
  const index = findStoredLayerIndex(document, layerId);
  return index < 0 ? null : document.layerDefinitions[index];
}

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

function dataSourceFromLayerDefinition(definition) {
  if (definition?.source?.type !== 'heurist-query' || definition.source.query == null) return null;
  const linked = definition.source.dataSourceReference;
  const sourceId = Number(linked?.id);
  const reference = linked?.type === 'source' && Number.isInteger(sourceId) && sourceId > 0
    ? { type: 'source', id: sourceId, key: `source:${sourceId}` }
    : { type: 'query', id: null, key: `query:map-${stableHash(JSON.stringify(definition.source.query))}` };
  return {
    reference,
    title: definition.source.title || definition.title || 'Map layer',
    request: { q: clonePlain(definition.source.query) },
    presentation: {
      data: null,
      map: {
        geoFields: clonePlain(definition.source.geoFields || []),
        dynamicRequests: definition.options?.dynamicRequests === true,
        minZoom: definition.options?.minZoom ?? null,
        maxZoom: definition.options?.maxZoom ?? null,
        style: clonePlain(definition.style || {}),
        opacity: normalizeRuntimeOpacity(definition.opacity ?? 1),
        visible: definition.visible !== false
      },
      graph: null,
      timeline: null,
      filterForm: null
    }
  };
}

function getFeatureCount(definition) {
  if (definition.type !== 'geojson') {
    return null;
  }
  if (Array.isArray(definition.data?.features)) {
    return definition.data.features.length;
  }
  return definition.data ? 1 : 0;
}

function finiteNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function environmentReferenceLatitude(environment, viewState) {
  const bounds = environment?.initialView?.bounds;
  if (bounds) return (Number(bounds.south) + Number(bounds.north)) / 2;
  const latitude = environment?.initialView?.center?.latitude ?? viewState?.center?.latitude;
  return Number.isFinite(Number(latitude)) ? Number(latitude) : 0;
}

function layerReferenceLatitude(mapLayer, viewState) {
  const bounds = mapLayer?.source?.bounds;
  if (bounds) return (Number(bounds.south) + Number(bounds.north)) / 2;
  const latitude = viewState?.center?.latitude;
  return Number.isFinite(Number(latitude)) ? Number(latitude) : 0;
}


function dynamicViewportKey(view) {
  const bounds = view?.bounds;
  const zoom = Number(view?.zoom);
  if (!bounds || !Number.isFinite(zoom)) return null;
  const values = [bounds.west, bounds.south, bounds.east, bounds.north].map((value) => Number(value));
  if (!values.every(Number.isFinite)) return null;
  return `${zoom}|${values.map((value) => value.toFixed(5)).join(',')}`;
}

function compareLayerReferences(a, b) {
  const orderDifference = Number(a.order || 0) - Number(b.order || 0);
  return orderDifference || Number(a.recordId || a.id) - Number(b.recordId || b.id);
}

function compareRuntimeLayers(a, b) {
  return Number(a.order || 0) - Number(b.order || 0)
    || String(a.id).localeCompare(String(b.id));
}

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

function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw signal.reason instanceof Error
      ? signal.reason
      : new DOMException('The request was aborted', 'AbortError');
  }
}

function isAbortError(error) {
  return error?.name === 'AbortError';
}

function addContext(error, context) {
  if (isAbortError(error)) return error;
  const contextualError = new Error(`${context}: ${error?.message || String(error)}`, { cause: error });
  contextualError.name = error?.name || 'Error';
  for (const property of ['status', 'statusText', 'url', 'method', 'code', 'details']) {
    if (error?.[property] !== undefined) contextualError[property] = error[property];
  }
  return contextualError;
}

function normalizeSelectedRecordId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

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

const VECTOR_SYMBOL_KEYS = new Set([
  'iconType', 'iconUrl', 'iconFont', 'iconSize', 'iconAnchor', 'popupAnchor',
  'color', 'fillColor', 'weight', 'opacity', 'fillOpacity', 'fill', 'stroke',
  'dashArray', 'radius'
]);

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

function sameJson(left, right) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function clonePlain(value) {
  if (value === undefined) return undefined;
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function serializeError(error) {
  return {
    name: error?.name || 'Error',
    message: error?.message || String(error),
    code: error?.code ?? null,
    status: error?.status ?? null
  };
}

function activeThemeIndex(style) {
  const thematic = Array.isArray(style?.thematic)
    ? style.thematic
    : Array.isArray(style?.thematic?.maps)
      ? style.thematic.maps
      : [];
  return thematic.findIndex((theme) => theme?.active === true);
}

function normalizeRuntimeOpacity(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 1;
  const normalized = number > 1 ? number / 100 : number;
  return Math.min(1, Math.max(0, normalized));
}
