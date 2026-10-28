/**
 * @file HeuristMapPublicApi.js
 * @brief Stable public mapping API.
 *
 * Exposes a narrow engine-neutral API for direct use and same-origin iframe
 * wrappers without leaking application or Leaflet internals.
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

import { HeuristModulePublicApi } from '#shared/host/HeuristModulePublicApi.js';
import { mapConfiguration } from '../configuration.js';
import { serializeMapConfigurationSettings } from '../ui/config/mapConfigurationSchema.js';
import { getDefaultBaseMaps } from '../basemaps/defaultBasemaps.js';

/**
 * Stable public facade for direct and same-origin iframe integrations. The configuration API
 * (plan 29 §12) comes from HeuristModulePublicApi.
 */
export class HeuristMapPublicApi extends HeuristModulePublicApi {
  /**
   * @param {object} application Underlying MapApplication instance.
   * @param {object|null} [drawController] Drawing session controller, when drawing is enabled.
   */
  constructor(application, drawController = null) {
    super(application, { configuration: mapConfiguration });
    this.drawController = drawController;
  }

  /**
   * Open the symbology editor without persistence (used by map configuration: the
   * default and selection symbology are complete values).
   *
   * @param {object} value Symbol/style value to edit.
   * @param {object} [options] Editor options (`parentSymbol`, `thematic`, `editorMode`).
   * @returns {Promise<*>} Resolves with the edited value, or null when cancelled.
   * @throws {Error} When symbology editing is not available.
   */
  editSymbology(value, options = {}) {
    return this.application.editSymbology(value, { complete: options.thematic !== true, ...options });
  }

  /**
   * Return optional host persistence capabilities.
   *
   * @returns {object} Host capability flags.
   */
  getHostCapabilities() {
    return this.application.getHostCapabilities();
  }

  /**
   * Load the current user's persisted map settings through the host.
   *
   * @returns {Promise<object|null>} Resolves with saved settings, or `null` when none exist.
   */
  loadPreferences() {
    return this.application.host.loadPreferences();
  }

  /**
   * Save allowlisted map settings through the host.
   *
   * @param {object} settings Raw settings to normalize and persist.
   * @returns {Promise<*>} Resolves when the host has saved the settings.
   */
  savePreferences(settings) {
    return this.application.host.savePreferences(serializeMapConfigurationSettings(settings));
  }

  /**
   * Apply persisted settings to the live map without full reinitialization.
   *
   * @param {object} settings Settings to apply.
   * @returns {Promise<*>} Resolves when the settings have been applied.
   */
  applyConfiguration(settings) {
    return this.application.applyConfiguration(settings);
  }

  /**
   * The current reproducible map state (active document, query, view, etc.).
   *
   * @returns {object} State.
   */
  getState() {
    return this.application.captureMapState();
  }

  /**
   * Restore a state of getState().
   *
   * @param {object} state State.
   * @returns {Promise<*>} Resolves when the state has been restored.
   */
  setState(state) {
    return this.application.restoreMapState(state || {});
  }

  /** @returns {object} getState() (the earlier name). */
  captureState() {
    return this.getState();
  }

  /** @returns {Promise<*>} setState() (the earlier name). */
  restoreState(state) {
    return this.setState(state);
  }

  /**
   * Start or replace the isolated editable drawing session.
   *
   * @param {object} [options] Drawing session options.
   * @returns {Promise<*>} Resolves when the session has started.
   * @throws {Error} When no draw controller is available.
   */
  beginDrawing(options = {}) {
    if (!this.drawController) throw new Error('Drawing is not available');
    return this.drawController.begin(options);
  }

  /**
   * Replace drawing geometry from WKT or GeoJSON.
   *
   * @param {string|object} value WKT string or GeoJSON value.
   * @param {object} [options] Set options (e.g. `clear`, `zoom`).
   * @returns {Promise<*>|undefined} Resolves when the geometry has been applied.
   */
  setDrawing(value, options = {}) { return this.drawController?.set(value, options); }

  /**
   * Return `{type,wkt,geojson}` for the current drawing, or `null` when empty.
   *
   * @returns {object|null} The current drawing, or `null`.
   */
  getDrawing() { return this.drawController?.get() ?? null; }

  /**
   * Remove all editable geometry.
   *
   * @returns {*} Result of the underlying draw controller call.
   */
  clearDrawing() { return this.drawController?.clear(); }

  /**
   * Change drawing-session options while retaining the current geometry.
   *
   * @param {object} [options] Partial drawing session options.
   * @returns {Promise<*>|undefined} Resolves when the options have been applied.
   */
  setDrawingOptions(options = {}) { return this.drawController?.updateOptions(options); }

  /**
   * Edit and apply drawing style with the symbology editor (drawing style mode).
   *
   * @returns {Promise<object|null>} Resolves with the edited style, or `null` when cancelled.
   * @throws {Error} When no draw controller is available, or symbology editing is not available.
   */
  async editDrawingStyle() {
    if (!this.drawController) throw new Error('Drawing is not available');
    const current = this.drawController.getOptions().style || {};
    const result = await this.application.editSymbology(current, { editorMode: 2 });
    if (result) await this.drawController.updateOptions({ style: result });
    return result;
  }

  /**
   * Fit the viewport to editable geometry.
   *
   * @returns {*} Result of the underlying draw controller call.
   */
  zoomToDrawing() { return this.drawController?.zoom(); }

  /**
   * Validate and return the current drawing.
   *
   * @returns {Promise<*>} Resolves with the finished drawing result.
   */
  async finishDrawing() {
    const result = await this.drawController?.finish();
    this.application.dispatch('heurist-map-drawing-finished', { result });
    return result;
  }

  /**
   * Cancel without returning geometry.
   *
   * @returns {Promise<null>} Resolves with `null`.
   */
  async cancelDrawing() {
    const result = await this.drawController?.cancel() ?? null;
    this.application.dispatch('heurist-map-drawing-cancelled', {});
    return result;
  }

  /**
   * Open preferences, loading/saving only the `heurist-map` preference key.
   *
   * @param {object} [options] Dialog options, including an optional `onSave` callback.
   * @returns {Promise<object>} Resolves with the opened dialog instance.
   */
  async openPreferencesDialog(options = {}) {
    const saved = await this.loadPreferences();
    return this.openConfigurationDialog({
      title: 'Map options',
      // heurist-explorer's simplified interface: fewer settings (it sets them itself)
      simplified: this.application.config.simplified === true,
      // the lists of the Map documents and Base maps sections, the record type of the map documents
      terms: await this.configurationTerms(),
      fields: await this.configurationFields(),
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

  /**
   * Whether the map can be published: only from heurist-explorer, whose configuration form
   * writes the page (plan 29).
   *
   * @returns {boolean}
   */
  canPublish() {
    return typeof this.application.host?.bridge?.openConfiguration === 'function';
  }

  /**
   * The lists of the configuration form: the map documents of the database and the
   * Heurist base maps (`termsSource` of the form).
   *
   * @returns {Promise<{mapDocuments: Array<{id: number, label: string}>, baseMaps: Array<{id: string, label: string}>}>}
   */
  async configurationTerms() {
    let documents = [];
    try {
      const result = await this.application.providers?.mapDocumentList?.search?.();
      documents = result?.items || [];
      // the record type of the map documents (configurationFields)
      this.mapDocumentTypeId = Number(result?.recordTypeId) || 0;
    } catch {
      documents = []; // the list cannot be read: the section shows no documents
    }
    return {
      mapDocuments: documents.map((item) => ({ id: Number(item.id), label: item.title || `Map document ${item.id}` })),
      baseMaps: getDefaultBaseMaps().map((item) => ({ id: String(item.id), label: item.title || String(item.id) }))
    };
  }

  /**
   * Properties of form fields that only the map knows: the record type of the map documents
   * (the record picker of *Allowed map documents*).
   *
   * @returns {Promise<Object<string, object>>} Read after configurationTerms (it finds the record type).
   */
  async configurationFields() {
    if (this.mapDocumentTypeId === undefined) await this.configurationTerms();
    const id = this.mapDocumentTypeId;
    return id > 0 ? { 'options.mapDocuments.allowed': { targetTypes: [id] } } : {};
  }

  /**
   * Open the publication form in heurist-explorer (plan 29). Explorer writes the page from these
   * settings, the map state and the map data its options need (*Show only active document*,
   * *Preserve current state*: mapPublication.js).
   *
   * @param {object} [options] Dialog options.
   * @returns {{result: Promise<object|null>, close: Function}} The dialog handle.
   */
  openPublishDialog(options = {}) {
    const state = this.captureState();
    return this.openConfigurationDialog({
      title: 'Publish map',
      ...options,
      mode: 'publish',
      value: options.value || this.application.config.persistedSettings || null,
      state,
      publication: {
        activeDocumentId: state.activeDocumentId ?? null,
        dynamicDocumentId: this.application.dynamicDocumentId || 'dynamic',
        minimalState: { activeDocumentId: state.activeDocumentId ?? null, query: state.query ?? null }
      }
    });
  }

  /**
   * Return the current public MapDocument representation.
   *
   * @returns {object} The current MapDocument.
   */
  getMapDocument() {
    return this.application.getMapDocument();
  }

  /**
   * Load, prepare, and render a MapDocument and its ordered MapLayer references.
   *
   * @param {*} recordId MapDocument record id.
   * @param {object} [options] Load options.
   * @returns {Promise<*>} Resolves when the document has loaded.
   */
  loadMapDocument(recordId, options = {}) {
    return this.application.loadMapDocument(recordId, options);
  }

  /**
   * Load a lightweight list of available MapDocuments.
   *
   * @param {*} [query] Optional MapDocument query filter.
   * @param {object} [options] Load options.
   * @returns {Promise<*>} Resolves when the document list has loaded.
   */
  loadMapDocuments(query = null, options = {}) {
    return this.application.loadMapDocuments(query, options);
  }

  /**
   * Return lightweight available MapDocument entries.
   *
   * @returns {Array<object>} Available MapDocument entries.
   */
  getMapDocuments() { return this.application.getMapDocuments(); }

  /**
   * Activate one mutually exclusive persisted MapDocument.
   *
   * @param {*} documentId MapDocument id to activate.
   * @param {object} [options] Activation options.
   * @returns {Promise<*>} Resolves when the document is active.
   */
  activateMapDocument(documentId, options = {}) {
    return this.application.activateMapDocument(documentId, options);
  }

  /**
   * Return the active lightweight MapDocument entry.
   *
   * @returns {object|null} The active MapDocument entry, or `null`.
   */
  getActiveMapDocument() { return this.application.getActiveMapDocument(); }

  /**
   * Return the predefined dynamic MapDocument entry.
   *
   * @returns {object} The dynamic MapDocument entry.
   */
  getDynamicDocument() { return this.application.getDynamicDocument(); }

  /**
   * Reload one persisted MapDocument.
   *
   * @param {*} documentId MapDocument id to reload.
   * @param {object} [options] Reload options.
   * @returns {Promise<*>} Resolves when the document has reloaded.
   */
  reloadMapDocument(documentId, options = {}) { return this.application.reloadMapDocument(documentId, options); }

  /**
   * Unload the active persisted MapDocument.
   *
   * @param {*} documentId MapDocument id to unload.
   * @returns {*} Result of the underlying application call.
   */
  unloadMapDocument(documentId) { return this.application.unloadMapDocument(documentId); }

  /**
   * Zoom to a MapDocument bookmark or bounds.
   *
   * @param {*} documentId MapDocument id.
   * @returns {*} Result of the underlying application call.
   */
  zoomToMapDocument(documentId) { return this.application.zoomToMapDocument(documentId); }

  /**
   * Restore the active document's home extent.
   *
   * @returns {*} Result of the underlying application call.
   */
  zoomHome() { return this.application.zoomHome(); }

  /**
   * Return configured base maps.
   *
   * @returns {Array<object>} Configured base maps.
   */
  getBaseMaps() { return this.application.getBaseMaps(); }

  /**
   * Return the active base map.
   *
   * @returns {object|null} The active base map, or `null`.
   */
  getActiveBaseMap() { return this.application.getActiveBaseMap(); }

  /**
   * Replace the active base map.
   *
   * @param {*} baseMapId Base map id to activate.
   * @returns {Promise<*>} Resolves when the base map has changed.
   */
  setBaseMap(baseMapId) { return this.application.setBaseMap(baseMapId); }

  /**
   * Zoom to a rendered or bounded layer.
   *
   * @param {*} layerId Layer id.
   * @returns {Promise<*>} Resolves when the viewport has been fitted.
   */
  zoomToLayer(layerId) { return this.application.zoomToLayer(layerId); }

  /**
   * Set a runtime global opacity multiplier; accepts 0-1 or 0-100.
   *
   * @param {*} layerId Layer id.
   * @param {number} opacity Opacity value.
   * @returns {Promise<*>} Resolves when the opacity has been applied.
   */
  setLayerOpacity(layerId, opacity) { return this.application.setLayerOpacity(layerId, opacity); }

  /**
   * Activate one thematic map for a layer, or `null` for default symbology.
   *
   * @param {*} layerId Layer id.
   * @param {number|null} [themeIndex] Thematic map index, or `null` for default symbology.
   * @returns {Promise<*>} Resolves when the theme has been applied.
   */
  setLayerTheme(layerId, themeIndex = null) { return this.application.setLayerTheme(layerId, themeIndex); }

  /**
   * Replace one layer style in memory without reloading its data.
   *
   * @param {*} layerId Layer id.
   * @param {object} style New style.
   * @returns {Promise<*>} Resolves when the style has been applied.
   */
  setLayerStyle(layerId, style) { return this.application.setLayerStyle(layerId, style); }

  /**
   * Open the host symbology or thematic editor for a persisted MapLayer.
   *
   * @param {*} layerId Layer id.
   * @param {object} [options] Editor options (e.g. `thematic`).
   * @returns {Promise<*>} Resolves when the editor has closed.
   */
  requestEditLayerSymbology(layerId, options = {}) {
    return this.application.requestEditLayerSymbology(layerId, options);
  }

  /**
   * Return the current lightweight single-layer selection.
   *
   * @returns {object|null} The current selection, or `null`.
   */
  getSelection() { return this.application.getSelection(); }

  /**
   * Apply synchronized record IDs to the first visible layer containing them.
   *
   * @param {Array} recordIds Record ids to select.
   * @param {object} [options] Selection options.
   * @returns {Promise<*>} Resolves when the selection has been applied.
   */
  setSelection(recordIds, options = {}) { return this.application.setSelection(recordIds, options); }

  /**
   * Select one feature in a selectable layer.
   *
   * @param {*} layerId Layer id.
   * @param {*} featureId Feature id.
   * @param {object} [options] Selection options.
   * @returns {Promise<*>} Resolves when the feature has been selected.
   */
  selectFeature(layerId, featureId, options = {}) {
    return this.application.selectFeature(layerId, featureId, options);
  }

  /**
   * Select all rendered geometries belonging to one record.
   *
   * @param {*} layerId Layer id.
   * @param {*} recordId Record id.
   * @param {object} [options] Selection options.
   * @returns {Promise<*>} Resolves when the record has been selected.
   */
  selectRecord(layerId, recordId, options = {}) {
    return this.application.selectRecord(layerId, recordId, options);
  }

  /**
   * Select all rendered geometries belonging to multiple records in one layer.
   *
   * @param {*} layerId Layer id.
   * @param {Array} recordIds Record ids.
   * @param {object} [options] Selection options.
   * @returns {Promise<*>} Resolves when the records have been selected.
   */
  selectRecords(layerId, recordIds, options = {}) {
    return this.application.selectRecords(layerId, recordIds, options);
  }

  /**
   * Clear all selected features.
   *
   * @returns {Promise<*>} Resolves when the selection has been cleared.
   */
  clearSelection() { return this.application.clearSelection(); }

  /**
   * Zoom to the current selection.
   *
   * @returns {Promise<*>} Resolves when the viewport has been fitted.
   */
  zoomToSelection() { return this.application.zoomToSelection(); }

  /**
   * Request host editing of a persisted MapDocument record.
   *
   * @param {*} documentId MapDocument id.
   * @returns {*} Result of the underlying application call.
   */
  requestEditMapDocument(documentId) { return this.application.requestEditMapDocument(documentId); }

  /**
   * Request host creation of a new MapDocument record.
   *
   * @returns {*} Result of the underlying application call.
   */
  requestAddMapDocument() { return this.application.requestAddMapDocument(); }

  /**
   * Request host editing of a persisted MapLayer record.
   *
   * @param {*} layerId Layer id.
   * @returns {*} Result of the underlying application call.
   */
  requestEditLayer(layerId) { return this.application.requestEditLayer(layerId); }

  /**
   * Subscribe to public map lifecycle events.
   *
   * @param {string} name Event name.
   * @param {Function} handler Event handler.
   * @param {object|boolean} [options] `addEventListener` options.
   * @returns {void}
   */
  addEventListener(name, handler, options) { this.application.container.addEventListener(name, handler, options); }

  /**
   * Unsubscribe from public map lifecycle events.
   *
   * @param {string} name Event name.
   * @param {Function} handler Event handler.
   * @param {object|boolean} [options] `removeEventListener` options.
   * @returns {void}
   */
  removeEventListener(name, handler, options) { this.application.container.removeEventListener(name, handler, options); }

  /**
   * Cancel the currently active MapDocument or data-loading request.
   *
   * @param {*} [reason] Cancellation reason.
   * @returns {boolean} Whether a pending request was cancelled.
   */
  cancelPendingRequests(reason) {
    return this.application.cancelPendingRequests(reason);
  }

  /**
   * Add an engine-neutral runtime layer and register its application state.
   *
   * @param {object} definition Layer definition.
   * @param {object} [options] Add options.
   * @returns {Promise<*>} Resolves when the layer has been added.
   */
  addLayer(definition, options = {}) {
    return this.application.addLayer(definition, options);
  }

  /**
   * Remove a runtime layer from the map and application registry.
   *
   * @param {*} layerId Layer id.
   * @param {object} [options] Remove options.
   * @returns {Promise<boolean>} Resolves with whether a layer was removed.
   */
  removeLayer(layerId, options = {}) {
    return this.application.removeLayer(layerId, options);
  }

  /**
   * Keep a layer definition but remove its current data/native layer.
   *
   * @param {*} layerId Layer id.
   * @param {object} [options] Clear options.
   * @returns {Promise<*>} Resolves when the layer has been cleared.
   */
  clearLayer(layerId, options = {}) {
    return this.application.clearLayer(layerId, options);
  }

  /**
   * Update the fixed Current-result source without activating it.
   *
   * @param {*} query Query definition.
   * @param {object} [options] Set options.
   * @returns {Promise<*>} Resolves when the query has been applied.
   */
  setQuery(query, options = {}) {
    return this.application.setQuery(query, options);
  }

  /**
   * Add a query-backed layer to the predefined dynamic MapDocument.
   *
   * @param {*} query Query definition.
   * @param {object} [options] Add options.
   * @returns {Promise<*>} Resolves when the layer has been added.
   */
  addQueryLayer(query, options = {}) {
    return this.application.addQueryLayer(query, options);
  }

  /**
   * Replace and optionally reload one dynamic query layer.
   *
   * @param {*} layerId Layer id.
   * @param {*} query Query definition.
   * @param {object} [options] Set options.
   * @returns {Promise<*>} Resolves when the layer has been updated.
   */
  setQueryForLayer(layerId, query, options = {}) {
    return this.application.setQueryForLayer(layerId, query, options);
  }

  /**
   * Replace the current/Workspace DataSource snapshot without activating another document.
   *
   * @param {object} [value] DataSource snapshot.
   * @returns {*} Result of the underlying application call.
   */
  setDynamicDataSources(value = {}) { return this.application.setDynamicDataSources(value); }

  /**
   * Toggle a layer's membership in the host's workspace.
   *
   * @param {*} layerId Layer id.
   * @returns {*} Result of the underlying application call.
   */
  toggleLayerWorkspace(layerId) { return this.application.toggleLayerWorkspace(layerId); }

  /**
   * Remove a layer from the host's workspace.
   *
   * @param {*} layerId Layer id.
   * @returns {*} Result of the underlying application call.
   */
  removeLayerFromWorkspace(layerId) { return this.application.removeLayerFromWorkspace(layerId); }

  /**
   * Show a layer's underlying data source through the host.
   *
   * @param {*} layerId Layer id.
   * @returns {*} Result of the underlying application call.
   */
  showLayerDataSource(layerId) { return this.application.showLayerDataSource(layerId); }

  /**
   * Show or hide a runtime layer.
   *
   * @param {*} layerId Layer id.
   * @param {boolean} visible Whether the layer should be visible.
   * @returns {Promise<*>} Resolves when visibility has been applied.
   */
  setLayerVisibility(layerId, visible) {
    return this.application.setLayerVisibility(layerId, visible);
  }

  /**
   * Return all registered runtime layers in display order.
   *
   * @returns {Array<object>} Cloned runtime layer descriptions.
   */
  getLayers() {
    return this.application.getLayers();
  }

  /**
   * Return one registered runtime layer by ID.
   *
   * @param {*} layerId Layer id.
   * @returns {object|null} Cloned runtime layer description, or `null`.
   */
  getLayer(layerId) {
    return this.application.getLayer(layerId);
  }

  /**
   * Return one stored MapDocument layer, including inactive/failed runtime layers.
   *
   * @param {*} layerId Layer id.
   * @param {*} documentId MapDocument id.
   * @returns {object|null} The stored layer, or `null`.
   */
  getDocumentLayer(layerId, documentId) {
    return this.application.getDocumentLayer(layerId, documentId);
  }

  /**
   * Reload a persisted MapLayer record and replace its rendered runtime layer.
   *
   * @param {*} layerId Layer id.
   * @param {object} [options] Reload options.
   * @returns {Promise<*>} Resolves when the layer has reloaded.
   */
  reloadLayer(layerId, options = {}) {
    return this.application.reloadLayer(layerId, options);
  }

  /**
   * Remove all runtime layers from the application.
   *
   * @returns {Promise<*>} Resolves when all layers have been removed.
   */
  clearLayers() {
    return this.application.clearLayers();
  }

  /**
   * Set the map center and zoom.
   *
   * @param {object} center Center coordinate.
   * @param {number} zoom Zoom level.
   * @param {object} [options] View options.
   * @returns {Promise<*>} Resolves when the view has been applied.
   */
  setView(center, zoom, options = {}) {
    return this.application.setView(center, zoom, options);
  }

  /**
   * Fit the map viewport to geographic bounds.
   *
   * @param {object} bounds Geographic bounds.
   * @param {object} [options] Fit options.
   * @returns {Promise<*>} Resolves when the viewport has been fitted.
   */
  fitBounds(bounds, options = {}) {
    return this.application.fitBounds(bounds, options);
  }

  /**
   * Notify the map engine that its container dimensions changed.
   *
   * @returns {Promise<*>} Resolves when the engine has re-measured its container.
   */
  invalidateSize() {
    return this.application.invalidateSize();
  }

  /**
   * Return the current engine-neutral map view state.
   *
   * @returns {object} Current view state.
   */
  getViewState() {
    return this.application.getViewState();
  }

  /**
   * Return supported application or map-engine capabilities.
   *
   * @returns {object} Capability flags.
   */
  getCapabilities() {
    return this.application.getCapabilities();
  }

  /**
   * Release resources, handlers, requests, layers, and host integrations.
   *
   * @returns {Promise<*>} Resolves when teardown is complete.
   */
  destroy() {
    this.configurationDialog?.close?.();
    this.configurationDialog = null;
    this.application.drawPanel?.destroy?.();
    this.application.drawPanel = null;
    return Promise.resolve(this.drawController?.destroy()).then(() => this.application.destroy());
  }
}
