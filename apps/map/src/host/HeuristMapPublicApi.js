/**
 * HeuristMapPublicApi.js - Stable public mapping API
 *
 * @fileOverview Exposes a narrow engine-neutral API for direct use and same-origin iframe wrappers without leaking application or Leaflet internals.
 * @project     Heurist mapping application
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2026 Heurist Network
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @author      Artem Osmakov <osmakov@gmail.com>
 */

import { serializeMapConfigurationSettings } from '../ui/config/mapConfigurationSchema.js';
import { PublishedDialog } from '#shared/ui';

/**
 * Stable public facade for direct and same-origin iframe integrations.
 */
export class HeuristMapPublicApi {
  /**
   * Create and initialize the class instance.
   */
  constructor(application, drawController = null) {
    this.application = application;
    this.drawController = drawController;
    this.readyPromise = null;
    this.configurationDialogFactory = null;
    this.configurationDialog = null;
    this.publishedDialog = null;
  }

  /** Register the reusable host-facing map configuration dialog factory. */
  setConfigurationDialogFactory(factory) {
    this.configurationDialogFactory = typeof factory === 'function' ? factory : null;
  }

  /** Open the generalized map configuration dialog. */
  openConfigurationDialog(options = {}) {
    if (!this.configurationDialogFactory) {
      throw new Error('Map configuration dialog is not available');
    }
    this.configurationDialog?.close?.();
    this.configurationDialog = this.configurationDialogFactory(options);
    return this.configurationDialog;
  }


  /** Open the host symbology editor without persistence (used by map configuration). */
  editSymbology(value, options = {}) {
    if (!this.application.host.supportsSymbologyEditing()) {
      throw new Error('Symbology editor is not available from this host');
    }
    return this.application.host.editSymbology(value, { ...options, persist: false });
  }

  /** Return optional host persistence capabilities. */
  getHostCapabilities() {
    return this.application.getHostCapabilities();
  }

  /** Load the current user's persisted map settings through the host. */
  loadPreferences() {
    return this.application.host.loadPreferences();
  }

  /** Save allowlisted map settings through the host. */
  savePreferences(settings) {
    return this.application.host.savePreferences(serializeMapConfigurationSettings(settings));
  }

  /** Apply persisted settings to the live map without full reinitialization. */
  applyConfiguration(settings) {
    return this.application.applyConfiguration(settings);
  }

  /** Capture the current reproducible map state. */
  captureState() {
    return this.application.captureMapState();
  }

  /** Restore a captured map state. */
  restoreState(state) {
    return this.application.restoreMapState(state);
  }

  /** Start or replace the isolated editable drawing session. */
  beginDrawing(options = {}) {
    if (!this.drawController) throw new Error('Drawing is not available');
    return this.drawController.begin(options);
  }

  /** Replace drawing geometry from WKT or GeoJSON. */
  setDrawing(value, options = {}) { return this.drawController?.set(value, options); }

  /** Return `{type,wkt,geojson}` for the current drawing, or null when empty. */
  getDrawing() { return this.drawController?.get() ?? null; }

  /** Remove all editable geometry. */
  clearDrawing() { return this.drawController?.clear(); }

  /** Change drawing-session options while retaining the current geometry. */
  setDrawingOptions(options = {}) { return this.drawController?.updateOptions(options); }

  /** Edit and apply drawing style through the host's existing symbology editor. */
  async editDrawingStyle() {
    if (!this.drawController) throw new Error('Drawing is not available');
    if (!this.application.host.supportsSymbologyEditing()) {
      throw new Error('Symbology editor is not available from this host');
    }
    const current = this.drawController.getOptions().style || {};
    const result = await this.application.host.editSymbology(current, {
      persist: false,
      editorMode: 2
    });
    if (result) await this.drawController.updateOptions({ style: result });
    return result;
  }

  /** Fit the viewport to editable geometry. */
  zoomToDrawing() { return this.drawController?.zoom(); }

  /** Validate and return the current drawing. */
  async finishDrawing() {
    const result = await this.drawController?.finish();
    this.application.dispatch('heurist-map-drawing-finished', { result });
    return result;
  }

  /** Cancel without returning geometry. */
  async cancelDrawing() {
    const result = await this.drawController?.cancel() ?? null;
    this.application.dispatch('heurist-map-drawing-cancelled', {});
    return result;
  }

  /** Publish settings plus the selected amount of current map state through the host. */
  publish(settings, publishOptions = {}) {
    const serialized = serializeMapConfigurationSettings(settings);
    const captured = this.captureState();
    const dynamicId = String(this.application.dynamicDocumentId || 'dynamic');
    const activeId = captured.activeDocumentId;

    if (publishOptions.showOnlyActiveDocument === true) {
      if (String(activeId) === dynamicId) {
        serialized.options.mapDocuments.allowed = [];
        serialized.options.mapDocuments.initiallyActive = null;
        serialized.options.ui.showMapDocuments = false;
      } else if (activeId != null && Number.isInteger(Number(activeId)) && Number(activeId) > 0) {
        const documentId = Number(activeId);
        serialized.options.mapDocuments.allowed = [documentId];
        // Use the same document as the startup document. This avoids loading a
        // different configured default and activating the published state again.
        serialized.options.mapDocuments.initiallyActive = documentId;
        serialized.options.ui.showCurrentDocument = false;
      }
    }

    const state = publishOptions.preserveCurrentState === false
      ? { activeDocumentId: captured.activeDocumentId ?? null, query: captured.query ?? null }
      : captured;

    return this.application.host.publish({
      format: 'heurist-publication',
      version: 1,
      options: serialized.options,
      config: serialized.config,
      state
    });
  }

  /** Open preferences, loading/saving only the `heurist-map` preference key. */
  async openPreferencesDialog(options = {}) {
    const saved = await this.loadPreferences();
    return this.openConfigurationDialog({
      ...options,
      mode: 'preferences',
      value: saved || this.application.config.persistedSettings || null,
      onSave: async (value, context) => {
        const result = await this.savePreferences(value);
        const applied = await this.applyConfiguration(context.serialized);
        this.application.dispatch('heurist-map-preferences-saved', { settings: context.serialized, result, applied });
        return options.onSave ? options.onSave(value, context, result, applied) : result;
      }
    });
  }

  /** Open publish configuration and save a reproducible map snapshot. */
  openPublishDialog(options = {}) {
    const currentState = this.captureState();
    return this.openConfigurationDialog({
      ...options,
      mode: 'publish',
      value: options.value || this.application.config.persistedSettings || null,
      publishContext: {
        activeDocumentId: currentState.activeDocumentId,
        dynamicDocumentId: this.application.dynamicDocumentId || 'dynamic'
      },
      onSave: async (value, context) => {
        const result = await this.publish(value, context.publishOptions || {});
        this.application.dispatch('heurist-map-published', { publication: result, settings: context.serialized });
        if (options.onSave) await options.onSave(value, context, result);
        // MapConfigurationDialog closes after this callback resolves. Defer the
        // published-link dialog so it opens after the configuration overlay is gone.
        setTimeout(() => {
          this.publishedDialog?.close?.();
          this.publishedDialog = new PublishedDialog({ publication: result }).open();
        }, 0);
        return result;
      }
    });
  }

  /**
   * Set the promise that resolves when application initialization completes.
   * @returns {*} Method result.
   */
  setReadyPromise(promise) {
    this.readyPromise = promise;
  }

  /**
   * Return the application initialization promise.
   * @returns {Promise<HeuristMapPublicApi>} Initialization promise.
   */
  ready() {
    return this.readyPromise || Promise.resolve(this);
  }

  /**
   * Return the current public MapDocument representation.
   * @returns {*} Method result.
   */
  getMapDocument() {
    return this.application.getMapDocument();
  }

  /**
   * Load, prepare, and render a MapDocument and its ordered MapLayer references.
   * @returns {*} Method result.
   */
  loadMapDocument(recordId, options = {}) {
    return this.application.loadMapDocument(recordId, options);
  }


  /** Load a lightweight list of available MapDocuments. */
  loadMapDocuments(query = null, options = {}) {
    return this.application.loadMapDocuments(query, options);
  }

  /** Return lightweight available MapDocument entries. */
  getMapDocuments() { return this.application.getMapDocuments(); }

  /** Activate one mutually exclusive persisted MapDocument. */
  activateMapDocument(documentId, options = {}) {
    return this.application.activateMapDocument(documentId, options);
  }

  /** Return the active lightweight MapDocument entry. */
  getActiveMapDocument() { return this.application.getActiveMapDocument(); }

  /** Return the predefined dynamic MapDocument entry. */
  getDynamicDocument() { return this.application.getDynamicDocument(); }

  /** Reload one persisted MapDocument. */
  reloadMapDocument(documentId, options = {}) { return this.application.reloadMapDocument(documentId, options); }

  /** Unload the active persisted MapDocument. */
  unloadMapDocument(documentId) { return this.application.unloadMapDocument(documentId); }

  /** Zoom to a MapDocument bookmark or bounds. */
  zoomToMapDocument(documentId) { return this.application.zoomToMapDocument(documentId); }

  /** Restore the active document's home extent. */
  zoomHome() { return this.application.zoomHome(); }

  /** Return configured base maps. */
  getBaseMaps() { return this.application.getBaseMaps(); }

  /** Return the active base map. */
  getActiveBaseMap() { return this.application.getActiveBaseMap(); }

  /** Replace the active base map. */
  setBaseMap(baseMapId) { return this.application.setBaseMap(baseMapId); }

  /** Zoom to a rendered or bounded layer. */
  zoomToLayer(layerId) { return this.application.zoomToLayer(layerId); }

  /** Set a runtime global opacity multiplier; accepts 0-1 or 0-100. */
  setLayerOpacity(layerId, opacity) { return this.application.setLayerOpacity(layerId, opacity); }

  /** Activate one thematic map for a layer, or null for default symbology. */
  setLayerTheme(layerId, themeIndex = null) { return this.application.setLayerTheme(layerId, themeIndex); }

  /** Replace one layer style in memory without reloading its data. */
  setLayerStyle(layerId, style) { return this.application.setLayerStyle(layerId, style); }

  /** Open the host symbology or thematic editor for a persisted MapLayer. */
  requestEditLayerSymbology(layerId, options = {}) {
    return this.application.requestEditLayerSymbology(layerId, options);
  }

  /** Return the current lightweight single-layer selection. */
  getSelection() { return this.application.getSelection(); }

  /** Apply synchronized record IDs to the first visible layer containing them. */
  setSelection(recordIds, options = {}) { return this.application.setSelection(recordIds, options); }

  /** Select one feature in a selectable layer. */
  selectFeature(layerId, featureId, options = {}) {
    return this.application.selectFeature(layerId, featureId, options);
  }

  /** Select all rendered geometries belonging to one record. */
  selectRecord(layerId, recordId, options = {}) {
    return this.application.selectRecord(layerId, recordId, options);
  }

  /** Select all rendered geometries belonging to multiple records in one layer. */
  selectRecords(layerId, recordIds, options = {}) {
    return this.application.selectRecords(layerId, recordIds, options);
  }

  /** Clear all selected features. */
  clearSelection() { return this.application.clearSelection(); }

  /** Zoom to the current selection. */
  zoomToSelection() { return this.application.zoomToSelection(); }

  /** Request host editing of a persisted MapDocument record. */
  requestEditMapDocument(documentId) { return this.application.requestEditMapDocument(documentId); }

  /** Request host creation of a new MapDocument record. */
  requestAddMapDocument() { return this.application.requestAddMapDocument(); }

  /** Request host editing of a persisted MapLayer record. */
  requestEditLayer(layerId) { return this.application.requestEditLayer(layerId); }

  /** Subscribe to public map lifecycle events. */
  addEventListener(name, handler, options) { this.application.container.addEventListener(name, handler, options); }

  /** Unsubscribe from public map lifecycle events. */
  removeEventListener(name, handler, options) { this.application.container.removeEventListener(name, handler, options); }

  /**
   * Cancel the currently active MapDocument or data-loading request.
   * @returns {boolean} Operation result.
   */
  cancelPendingRequests(reason) {
    return this.application.cancelPendingRequests(reason);
  }

  /**
   * Add an engine-neutral runtime layer and register its application state.
   * @returns {*} Method result.
   */
  addLayer(definition, options = {}) {
    return this.application.addLayer(definition, options);
  }

  /**
   * Remove a runtime layer from the map and application registry.
   * @returns {Promise<boolean>} Resolves with whether a layer was removed.
   */
  removeLayer(layerId, options = {}) {
    return this.application.removeLayer(layerId, options);
  }

  /** Keep a layer definition but remove its current data/native layer. */
  clearLayer(layerId, options = {}) {
    return this.application.clearLayer(layerId, options);
  }

  /** Update the fixed Current-result source without activating it. */
  setQuery(query, options = {}) {
    return this.application.setQuery(query, options);
  }

  /** Add a query-backed layer to the predefined dynamic MapDocument. */
  addQueryLayer(query, options = {}) {
    return this.application.addQueryLayer(query, options);
  }

  /** Replace and optionally reload one dynamic query layer. */
  setQueryForLayer(layerId, query, options = {}) {
    return this.application.setQueryForLayer(layerId, query, options);
  }

  /** Replace the current/Workspace DataSource snapshot without activating another document. */
  setDynamicDataSources(value = {}) { return this.application.setDynamicDataSources(value); }

  toggleLayerWorkspace(layerId) { return this.application.toggleLayerWorkspace(layerId); }
  removeLayerFromWorkspace(layerId) { return this.application.removeLayerFromWorkspace(layerId); }
  showLayerDataSource(layerId) { return this.application.showLayerDataSource(layerId); }

  /**
   * Show or hide a runtime layer.
   * @returns {*} Method result.
   */
  setLayerVisibility(layerId, visible) {
    return this.application.setLayerVisibility(layerId, visible);
  }

  /**
   * Return all registered runtime layers in display order.
   * @returns {Array<Object>} Cloned runtime layer descriptions.
   */
  getLayers() {
    return this.application.getLayers();
  }

  /**
   * Return one registered runtime layer by ID.
   * @returns {?Object} Cloned runtime layer description, or null.
   */
  getLayer(layerId) {
    return this.application.getLayer(layerId);
  }

  /** Return one stored MapDocument layer, including inactive/failed runtime layers. */
  getDocumentLayer(layerId, documentId) {
    return this.application.getDocumentLayer(layerId, documentId);
  }

  /**
   * Reload a persisted MapLayer record and replace its rendered runtime layer.
   * @returns {*} Method result.
   */
  reloadLayer(layerId, options = {}) {
    return this.application.reloadLayer(layerId, options);
  }

  /**
   * Remove all runtime layers from the application.
   * @returns {*} Method result.
   */
  clearLayers() {
    return this.application.clearLayers();
  }

  /**
   * Set the map center and zoom.
   * @returns {*} Method result.
   */
  setView(center, zoom, options = {}) {
    return this.application.setView(center, zoom, options);
  }

  /**
   * Fit the map viewport to geographic bounds.
   * @returns {*} Method result.
   */
  fitBounds(bounds, options = {}) {
    return this.application.fitBounds(bounds, options);
  }

  /**
   * Notify the map engine that its container dimensions changed.
   * @returns {*} Method result.
   */
  invalidateSize() {
    return this.application.invalidateSize();
  }

  /**
   * Return the current engine-neutral map view state.
   * @returns {*} Method result.
   */
  getViewState() {
    return this.application.getViewState();
  }

  /**
   * Return supported application or map-engine capabilities.
   * @returns {*} Method result.
   */
  getCapabilities() {
    return this.application.getCapabilities();
  }

  /**
   * Release resources, handlers, requests, layers, and host integrations.
   * @returns {*} Method result.
   */
  destroy() {
    this.configurationDialog?.close?.();
    this.configurationDialog = null;
    this.publishedDialog?.close?.();
    this.publishedDialog = null;
    this.application.drawPanel?.destroy?.();
    this.application.drawPanel = null;
    return Promise.resolve(this.drawController?.destroy()).then(() => this.application.destroy());
  }
}
