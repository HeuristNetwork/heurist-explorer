/**
 * @file LeafletMapAdapter.js
 * @brief Implements the engine-neutral map contract with Leaflet while keeping
 *        Leaflet objects private to the adapter.
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

import L from 'leaflet';
import markerIconUrl from 'leaflet/dist/images/marker-icon.png';
import markerIconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadowUrl from 'leaflet/dist/images/marker-shadow.png';
import { normalizeBounds as normalizeGeographicBounds } from '../utils/normalizeBounds.js';
import { MapEngineAdapter } from './MapEngineAdapter.js';
import { createImageFilterCss, transparentColorToRgb } from '../utils/normalizeImageFilter.js';
import { normalizeZoomLimit } from '../utils/normalizeZoomLimit.js';
import { resolveFeatureSymbol } from '../thematic/thematicSymbolResolver.js';
import { hexToCssFilter } from '../utils/hexToCssFilter.js';
import { createLeafletBaseMapLayer, getLeafletBaseMapCatalog } from './leaflet/LeafletBasemapCatalog.js';
import { ensureLeafletPixelFilter } from './leaflet/LeafletPixelFilter.js';

// Leaflet's default URL guessing cannot work reliably after Vite has split and
// renamed assets. Importing the images makes them part of the application build
// and also covers markers created by plugins such as leaflet-control-geocoder.
L.Icon.Default.mergeOptions({
  iconUrl: markerIconUrl,
  iconRetinaUrl: markerIconRetinaUrl,
  shadowUrl: markerShadowUrl
});
// Do not prepend Leaflet's CSS-derived imagePath to the URLs above. In the
// Heurist bundle that guessed path becomes ".../heurist-mapmarker-icon...".
L.Icon.Default.imagePath = '';

/**
 * Leaflet implementation hidden behind the engine-neutral adapter contract.
 */
export class LeafletMapAdapter extends MapEngineAdapter {
  /**
   * Create and initialize the class instance.
   */
  constructor() {
    super();
    this.map = null;
    this.layers = new Map();
    this.interactionHandlers = {};
    this.baseMapProviderOptions = {};
    this.nativeControls = new Map();
    this.operationalLayersPane = null;
    this.drawSession = null;
  }

  /**
   * Initialize the Leaflet map instance, its operational-layers pane, native
   * interaction listeners, native controls, and optional base map.
   *
   * @param {HTMLElement} container DOM element hosting the map.
   * @param {Object} options Initialization options (center, zoom, zoom limits,
   *        CRS-independent controls, base-map provider options, initial base layer).
   * @returns {Promise<void>} Resolves once the map and its native controls are ready.
   */
  async initialize(container, options) {
    this.baseMapProviderOptions = { ...(options.baseMapProviderOptions || {}) };
    await ensureLeafletPixelFilter(L);
    this.map = L.map(container, {
      // Native controls are created through setNativeControls() so they can be
      // changed live from MapConfigurationDialog without rebuilding Leaflet.
      zoomControl: false,
      attributionControl: options.controls?.attribution !== false,
      minZoom: options.minZoom,
      maxZoom: options.maxZoom
    });

    // Put every operational layer in its own child pane. Leaflet SVG paths do
    // not support useful per-path z-index values: their visual order is DOM
    // order inside one SVG renderer. Separate panes give each MapLayer a stable
    // stacking level which is independent of the time the layer becomes visible.
    this.operationalLayersPane = this.map.createPane('heurist-map-operational-layers');
    this.operationalLayersPane.style.zIndex = '400';

    this.map.setView(
      [options.center.latitude, options.center.longitude],
      options.zoom
    );

    this.map.on('zoomend', () => {
      this.refreshZoomRangeVisibility();
    });

    this.map.on('moveend', () => {
      this.interactionHandlers.onViewChange?.(this.getViewState());
    });

    this.map.on('click', (event) => {
      // Leaflet may bubble a feature click to the map even after the DOM event
      // has been stopped. Do not treat such a click as a background-map click,
      // otherwise the selection made by onFeatureClick is cleared immediately.
      if (event.originalEvent?._stopped) {
        return;
      }

      this.interactionHandlers.onMapClick?.({
        latlng: toPublicLatLng(event.latlng)
      });
    });

    await this.setNativeControls(options.controls || {});

    if (options.baseLayer) {
      this.addBaseMapLayer(options.baseLayer);
    }
  }

  /**
   * Show/hide Leaflet-native controls and optional Leaflet plugins.
   *
   * @param {Object} [options={}] Desired control flags (`zoom`, `scale`, `bookmark`, `print`, `search`).
   * @returns {Promise<void>} Resolves once every requested control has been toggled.
   */
  async setNativeControls(options = {}) {
    this.assertInitialized();
    const desired = {
      zoom: options.zoom !== false,
      scale: options.scale !== false,
      bookmark: options.bookmark === true,
      print: options.print === true,
      selector: false,
      search: options.search === true
    };

    await this.toggleNativeControl('zoom', desired.zoom, () => L.control.zoom({ position: 'topleft' }));
    await this.toggleNativeControl('scale', desired.scale, () => L.control.scale({ position: 'bottomleft' }));
    await this.toggleNativeControl('bookmark', desired.bookmark, async () => {
      const module = await import('leaflet-bookmarks');
      await import('leaflet-bookmarks/dist/leaflet.bookmarks.css');
      const Bookmarks = L.Control.Bookmarks || module.default;
      if (typeof Bookmarks !== 'function') throw new Error('Leaflet.Bookmarks plugin did not register correctly');
      // Leaflet.Bookmarks falls back to L.Icon.Default for its temporary/edit
      // marker. In a bundled build that makes Leaflet request marker-icon assets
      // we do not ship. The bookmark location itself does not need a marker in
      // heurist-map, so provide an intentionally transparent div icon instead.
      const transparentBookmarkIcon = L.divIcon({
        className: 'heurist-map-bookmark-marker-transparent',
        html: '',
        iconSize: [1, 1],
        iconAnchor: [0, 0]
      });
      return new Bookmarks({
        position: 'topleft',
        icon: transparentBookmarkIcon
      });
    });
    await this.toggleNativeControl('print', desired.print, async () => {
      await import('leaflet.browser.print/dist/leaflet.browser.print.min.js');
      if (typeof L.control.browserPrint !== 'function') {
        throw new Error('leaflet.browser.print plugin did not register correctly');
      }
      return L.control.browserPrint({ position: 'topleft', title: 'Print map' });
    });
    await this.toggleNativeControl('search', desired.search, async () => {
      const module = await import('leaflet-control-geocoder');
      await import('leaflet-control-geocoder/dist/Control.Geocoder.css');
      const Geocoder = L.Control.Geocoder || module.Control?.Geocoder || module.default;
      if (typeof L.Control?.geocoder === 'function') {
        return L.Control.geocoder({ position: 'topleft' });
      }
      if (typeof Geocoder === 'function') {
        return new Geocoder({ position: 'topleft' });
      }
      throw new Error('leaflet-control-geocoder plugin did not register correctly');
    });
  }

  /**
   * Add or remove one lazily-created native control, reusing an existing instance.
   *
   * @param {string} name Control registry key.
   * @param {boolean} enabled Whether the control should be present.
   * @param {Function} factory Async factory returning the Leaflet control instance when enabled.
   * @returns {Promise<?Object>} Resolves with the active control instance, or `null` when disabled.
   */
  async toggleNativeControl(name, enabled, factory) {
    const existing = this.nativeControls.get(name);
    if (!enabled) {
      if (existing) {
        existing.remove?.();
        this.nativeControls.delete(name);
      }
      return null;
    }
    if (existing) return existing;
    const control = await factory();
    control?.addTo?.(this.map);
    if (control) {
      // Optional Leaflet plugins use different container padding and dimensions.
      // Mark single-button controls so application CSS can give them the same
      // collapsed footprint as Leaflet's native zoom buttons without affecting
      // expanded plugin UIs (for example, the geocoder input/bookmark list).
      if (name === 'bookmark' || name === 'print' || name === 'search') {
        const container = control.getContainer?.();
        container?.classList?.add(
          'heurist-map-native-single-control',
          `heurist-map-native-${name}-control`
        );
      }
      this.nativeControls.set(name, control);
    }
    return control || null;
  }

  /**
   * Start an isolated Leaflet.draw session without exposing Leaflet objects.
   *
   * @param {Object} [options={}] Drawing session options.
   * @param {string} [options.mode='full'] Drawing mode; a non-`'full'` mode restricts
   *        drawing to rectangles/markers only.
   * @param {Object} [options.style] Base shape style, merged over a default blue outline.
   * @param {boolean} [options.allowMultiple] Allow more than one drawn shape at a time.
   * @param {string} [options.imageUrl] Image URL kept aligned to the drawn bounds (image/filter modes).
   * @param {?Function} [onChange=null] Called with `{ reason, drawing }` on every drawing change.
   * @returns {Promise<boolean>} Resolves with `true` once the session has started.
   * @throws {Error} When the Leaflet.draw plugin fails to register.
   */
  async beginDrawing(options = {}, onChange = null) {
    this.assertInitialized();
    await this.endDrawing();
    await import('leaflet-draw');
    await import('leaflet-draw/dist/leaflet.draw.css');
    if (typeof L.Control?.Draw !== 'function') {
      throw new Error('Leaflet.draw plugin did not register correctly');
    }

    const group = L.featureGroup().addTo(this.map);
    const style = { color: '#3388ff', weight: 4, ...options.style };
    const mode = options.mode || 'full';
    const control = new L.Control.Draw({
      position: 'topleft',
      edit: { featureGroup: group, poly: { allowIntersection: false } },
      draw: {
        polygon: mode === 'full'
          ? { allowIntersection: false, showArea: false, showLength: false, shapeOptions: style } : false,
        rectangle: { showArea: false, shapeOptions: style },
        polyline: mode === 'full' ? { shapeOptions: { ...style, fill: false } } : false,
        circle: mode === 'full' ? { shapeOptions: style } : false,
        circlemarker: false,
        marker: mode === 'full'
      }
    });
    control.addTo(this.map);

    const changed = (reason) => {
      this.refreshDrawingImageOverlay();
      onChange?.({ reason, drawing: this.getDrawingGeoJson() });
    };
    const liveEdited = () => {
      // Leaflet.draw emits L.Draw.Event.EDITED only after the edit toolbar is
      // saved. Path layers emit `edit` while their handles are being moved, so
      // image extents must follow that event to remain aligned during editing.
      this.refreshDrawingImageOverlay();
    };
    const bindLiveEdit = (layer) => layer?.on?.('edit', liveEdited);
    const handlers = {
      created: (event) => {
        if (options.allowMultiple !== true) group.clearLayers();
        group.addLayer(event.layer);
        changed('created');
      },
      edited: () => changed('edited'),
      deleted: () => changed('deleted'),
      editmove: liveEdited,
      editresize: liveEdited,
      editvertex: liveEdited,
      layeradd: (event) => bindLiveEdit(event.layer)
    };
    group.on('layeradd', handlers.layeradd);
    this.map.on(L.Draw.Event.CREATED, handlers.created);
    this.map.on(L.Draw.Event.EDITED, handlers.edited);
    this.map.on(L.Draw.Event.DELETED, handlers.deleted);
    this.map.on(L.Draw.Event.EDITMOVE, handlers.editmove);
    this.map.on(L.Draw.Event.EDITRESIZE, handlers.editresize);
    this.map.on(L.Draw.Event.EDITVERTEX, handlers.editvertex);
    this.drawSession = {
      group, control, handlers, onChange,
      imageUrl: options.imageUrl || null,
      mode,
      style,
      imageOverlay: null
    };
    return true;
  }

  /**
   * End the active Leaflet.draw session and remove its group/control from the map.
   *
   * @returns {Promise<boolean>} Resolves with whether a session was ended.
   */
  async endDrawing() {
    const session = this.drawSession;
    if (!session) return false;
    this.map.off(L.Draw.Event.CREATED, session.handlers.created);
    this.map.off(L.Draw.Event.EDITED, session.handlers.edited);
    this.map.off(L.Draw.Event.DELETED, session.handlers.deleted);
    this.map.off(L.Draw.Event.EDITMOVE, session.handlers.editmove);
    this.map.off(L.Draw.Event.EDITRESIZE, session.handlers.editresize);
    this.map.off(L.Draw.Event.EDITVERTEX, session.handlers.editvertex);
    session.group.off('layeradd', session.handlers.layeradd);
    session.control.remove?.();
    session.imageOverlay?.removeFrom?.(this.map);
    session.group.removeFrom?.(this.map);
    this.drawSession = null;
    return true;
  }

  /**
   * Load GeoJSON geometry into the active drawing session.
   *
   * @param {Object} geojson GeoJSON Feature/FeatureCollection or Polygon geometry to load.
   * @param {Object} [options={}] Load options.
   * @param {boolean} [options.clear=true] Clear existing drawn shapes before loading.
   * @returns {Promise<?Object>} Resolves with the resulting drawing GeoJSON.
   * @throws {Error} When no drawing session is active.
   */
  async setDrawingGeoJson(geojson, { clear = true } = {}) {
    const session = this.requireDrawSession();
    if (clear) session.group.clearLayers();
    const rectangleBounds = ['rectangle', 'image', 'filter'].includes(session.mode)
      ? getAxisAlignedRectangleBounds(geojson) : null;
    if (rectangleBounds) {
      session.group.addLayer(L.rectangle(rectangleBounds, session.style));
    } else {
      L.geoJSON(geojson, {
        style: session.style,
        onEachFeature: (_feature, layer) => session.group.addLayer(layer)
      });
    }
    this.refreshDrawingImageOverlay();
    session.onChange?.({ reason: 'loaded', drawing: this.getDrawingGeoJson() });
    return this.getDrawingGeoJson();
  }

  /**
   * Enter Leaflet.draw edit mode for geometry loaded at session startup.
   *
   * @returns {Promise<boolean>} Resolves with whether edit mode was entered.
   * @throws {Error} When no drawing session is active.
   */
  async startDrawingEdit() {
    const session = this.requireDrawSession();
    if (!session.group.getLayers().length) return false;
    const handler = session.control?._toolbars?.edit?._modes?.edit?.handler;
    if (!handler?.enable) return false;
    handler.enable();
    return true;
  }

  /**
   * Return the active drawing session's geometry as GeoJSON.
   *
   * @returns {?Object} GeoJSON Feature/FeatureCollection, or `null` when nothing is drawn.
   * @throws {Error} When no drawing session is active.
   */
  getDrawingGeoJson() {
    const session = this.requireDrawSession();
    const features = [];
    session.group.eachLayer((layer) => {
      const feature = layer instanceof L.Circle
        ? circleToPolygonFeature(layer, this.map)
        : layer.toGeoJSON(8);
      if (feature) features.push(feature);
    });
    if (!features.length) return null;
    return features.length === 1 ? features[0] : { type: 'FeatureCollection', features };
  }

  /**
   * Clear all drawn shapes and the aligned image overlay from the active session.
   *
   * @returns {Promise<void>} Resolves once the drawing has been cleared.
   * @throws {Error} When no drawing session is active.
   */
  async clearDrawing() {
    const session = this.requireDrawSession();
    session.group.clearLayers();
    session.imageOverlay?.removeFrom?.(this.map);
    session.imageOverlay = null;
    session.onChange?.({ reason: 'cleared', drawing: null });
  }

  /**
   * Zoom the map to fit the active drawing session's shapes.
   *
   * @returns {Promise<boolean>} Resolves with whether the view changed.
   * @throws {Error} When no drawing session is active.
   */
  async zoomToDrawing() {
    const bounds = this.requireDrawSession().group.getBounds();
    if (!bounds?.isValid?.()) return false;
    this.map.fitBounds(bounds, { padding: [20, 20] });
    return true;
  }

  /**
   * Zoom to fit the drawing, then capture a PNG screenshot of the map container.
   *
   * @returns {Promise<string>} Resolves with a PNG data URL.
   * @throws {Error} When the screenshot renderer is unavailable.
   */
  async captureDrawingImage() {
    await this.zoomToDrawing();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const module = await import('dom-to-image');
    const domToImage = module.default || module;
    if (typeof domToImage.toPng !== 'function') throw new Error('Map screenshot renderer is unavailable');
    return domToImage.toPng(this.map.getContainer(), {
      filter: (node) => !(node?.classList?.contains('heurist-map-draw-panel')
        || node?.classList?.contains('leaflet-draw'))
    });
  }

  /**
   * Keep the drawing session's aligned image overlay in sync with the drawn bounds.
   *
   * @returns {void}
   */
  refreshDrawingImageOverlay() {
    const session = this.drawSession;
    if (!session?.imageUrl) return;
    const bounds = session.group.getBounds();
    if (!bounds?.isValid?.()) {
      session.imageOverlay?.removeFrom?.(this.map);
      session.imageOverlay = null;
      return;
    }
    if (!session.imageOverlay) {
      session.imageOverlay = L.imageOverlay(session.imageUrl, bounds, {
        opacity: 0.5,
        pane: 'tilePane'
      }).addTo(this.map);
    } else {
      session.imageOverlay.setBounds(bounds);
    }
  }

  /**
   * Return the active drawing session, or throw when none is active.
   *
   * @returns {Object} The active drawing session.
   * @throws {Error} When no drawing session is active.
   */
  requireDrawSession() {
    if (!this.drawSession) throw new Error('No Leaflet drawing session is active');
    return this.drawSession;
  }

  /**
   * Add an engine-neutral runtime layer and register its application state.
   *
   * @param {Object} definition Runtime layer definition (`type`: `geojson`, `tile`, or `image`).
   * @returns {Promise<*>} Resolves with the map engine's per-type registration result.
   * @throws {TypeError} When the definition is invalid, or has an unsupported `type`.
   * @throws {Error} When a layer with the same ID is already registered.
   */
  async addLayer(definition) {
    this.assertInitialized();
    validateLayerDefinition(definition);

    if (this.layers.has(definition.id)) {
      throw new Error(`Layer "${definition.id}" already exists. Can't add a layer to leaflet map.`);
    }

    switch (definition.type) {
      case 'geojson':
        return this.addGeoJsonLayer(definition);
      case 'tile':
        return this.addTileLayer(definition);
      case 'image':
        return this.addImageLayer(definition);
      default:
        throw new Error(`Unsupported Leaflet layer type: ${definition.type}`);
    }
  }

  /**
   * Remove a runtime layer from the map and application registry.
   *
   * @param {string|number} layerId Runtime layer identifier.
   * @returns {Promise<boolean>} Resolves with whether a layer was removed.
   */
  async removeLayer(layerId) {
    const entry = this.layers.get(layerId);
    if (!entry) {
      return false;
    }

    entry.layer.removeFrom(this.map);
    this.layers.delete(layerId);
    this.refreshOperationalLayerOrder();
    return true;
  }

  /**
   * Show or hide a runtime layer.
   *
   * @param {string|number} layerId Runtime layer identifier.
   * @param {boolean} visible Requested visibility.
   * @returns {Promise<*>} Resolves when the operation completes.
   * @throws {Error} When the layer is not registered.
   */
  async setLayerVisibility(layerId, visible) {
    const entry = this.getLayerEntry(layerId);
    entry.visible = Boolean(visible);
    this.applyLayerEffectiveVisibility(entry);
  }

  /**
   * Configure callbacks without exposing Leaflet event objects.
   *
   * @param {Object} [handlers={}] Interaction handlers (`onFeatureClick`, `onMapClick`, `onViewChange`).
   * @returns {void}
   */
  setInteractionHandlers(handlers = {}) {
    this.interactionHandlers = { ...handlers };
  }

  /**
   * Apply selection styling to one GeoJSON layer.
   *
   * Only features whose selected state changed are touched. This is important
   * for large result layers: a normal click must not walk every rendered
   * feature just to restore the previously selected item.
   *
   * @param {string|number} layerId Runtime layer identifier.
   * @param {Array<string>} [featureIds=[]] Feature IDs that should be selected.
   * @returns {Promise<boolean>} Resolves with `false` when the layer has no feature layers,
   *          otherwise `true`.
   * @throws {Error} When the layer is not registered.
   */
  async setFeatureSelection(layerId, featureIds = []) {
    const entry = this.getLayerEntry(layerId);
    if (!entry.featureLayers) return false;

    const previous = entry.selectedFeatureIds || new Set();
    const selected = new Set(featureIds.map(String));
    let pathOrderChanged = false;

    // Restore only features that were selected before and are no longer selected.
    for (const featureId of previous) {
      if (selected.has(featureId)) continue;
      const nativeLayer = entry.featureLayers.get(featureId);
      if (nativeLayer) {
        applyNativeSelection(nativeLayer, false, entry.selectionBaseStyles, entry.opacity, entry.selectionSymbol);
        pathOrderChanged = pathOrderChanged || canBringNativeFeatureToFront(nativeLayer);
      }
    }

    // Apply selection styling only to newly selected features. Features that
    // remain selected already have the correct native style.
    for (const featureId of selected) {
      if (previous.has(featureId)) continue;
      const nativeLayer = entry.featureLayers.get(featureId);
      if (nativeLayer) {
        applyNativeSelection(nativeLayer, true, entry.selectionBaseStyles, entry.opacity, entry.selectionSymbol);
      }
    }

    entry.selectedFeatureIds = selected;

    // bringToFront() changes SVG DOM order. Once a selected path is restored,
    // rebuild the original feature order inside this layer's private pane, then
    // put any still-selected features back on top. This keeps selection useful
    // without permanently changing normal feature order.
    if (pathOrderChanged) {
      restoreNativeLayerOrder(entry.layer);
      for (const featureId of selected) {
        const nativeLayer = entry.featureLayers.get(featureId);
        if (nativeLayer) bringNativeFeatureToFront(nativeLayer);
      }
    }
    return true;
  }

  /**
   * Open a popup for one rendered feature, binding HTML lazily when supplied.
   *
   * @param {string|number} layerId Runtime layer identifier.
   * @param {string|number} featureId Rendered feature identifier.
   * @param {?string} [html=null] Popup HTML to bind before opening; reuses an already-bound
   *        popup when omitted.
   * @returns {Promise<boolean>} Resolves with whether the popup was opened.
   * @throws {Error} When the layer is not registered.
   */
  async openFeaturePopup(layerId, featureId, html = null) {
    const entry = this.getLayerEntry(layerId);
    const id = String(featureId);
    const nativeLayer = entry.featurePopupLayers?.get(id)
      || getFirstPopupCapableLayer(entry.featureLayers?.get(id));
    if (!nativeLayer || typeof nativeLayer.openPopup !== 'function') return false;

    if (html !== null && html !== undefined) {
      if (typeof nativeLayer.bindPopup !== 'function') return false;
      nativeLayer.bindPopup(String(html));
    } else if (typeof nativeLayer.getPopup === 'function' && !nativeLayer.getPopup()) {
      return false;
    }

    nativeLayer.openPopup();
    return true;
  }

  /**
   * Resolve the record ID attached to one rendered feature.
   *
   * @param {string|number} layerId Runtime layer identifier.
   * @param {string|number} featureId Rendered feature identifier.
   * @returns {?number} The feature's record ID, or `null` when unknown.
   * @throws {Error} When the layer is not registered.
   */
  getFeatureRecordId(layerId, featureId) {
    const entry = this.getLayerEntry(layerId);
    return entry.featureRecordIds?.get(String(featureId)) ?? null;
  }

  /**
   * Resolve all rendered feature IDs attached to one record.
   *
   * @param {string|number} layerId Runtime layer identifier.
   * @param {number} recordId Record ID to look up.
   * @returns {Array<string>} Feature IDs rendered for the record.
   * @throws {Error} When the layer is not registered.
   */
  getFeatureIdsByRecord(layerId, recordId) {
    const entry = this.getLayerEntry(layerId);
    return [...(entry.recordFeatureIds?.get(Number(recordId)) || [])];
  }

  /**
   * Return bounds of selected native features.
   *
   * @param {string|number} layerId Runtime layer identifier.
   * @param {Array<string>} [featureIds=[]] Feature IDs to combine bounds for.
   * @returns {Promise<?Object>} Resolves with `{ west, south, east, north }`, or `null`.
   * @throws {Error} When the layer is not registered.
   */
  async getSelectionBounds(layerId, featureIds = []) {
    const entry = this.getLayerEntry(layerId);
    if (!entry.featureLayers) return null;
    let combined = null;
    for (const featureId of featureIds.map(String)) {
      const nativeLayer = entry.featureLayers.get(featureId);
      if (!nativeLayer) continue;
      const bounds = getNativeFeatureBounds(nativeLayer);
      if (!bounds?.isValid?.()) continue;
      combined = combined ? combined.extend(bounds) : L.latLngBounds(bounds);
    }
    return combined?.isValid?.()
      ? { west: combined.getWest(), south: combined.getSouth(), east: combined.getEast(), north: combined.getNorth() }
      : null;
  }

  /**
   * Return the full Leaflet provider catalogue as engine-neutral descriptors.
   *
   * @returns {Array<Object>} Available base-map descriptors.
   */
  getAvailableBaseMaps() {
    return getLeafletBaseMapCatalog();
  }

  /**
   * Replace the current base map without touching operational layers.
   *
   * @param {?Object} definition Engine-neutral base-map definition, or `null` to clear it.
   * @returns {Promise<boolean>} Resolves with `true` once the base map has been applied.
   */
  async setBaseMap(definition) {
    await this.removeLayer('__base__');
    if (!definition) return true;
    this.addBaseMapLayer(definition);
    return true;
  }

  /**
   * Create/register one base map while keeping Leaflet provider objects private.
   *
   * @param {Object} definition Engine-neutral base-map definition.
   * @returns {?Object} Public native-layer registration result, or `null` when unsupported.
   */
  addBaseMapLayer(definition) {
    const normalized = { ...definition, id: '__base__', visible: true };
    const layer = createLeafletBaseMapLayer(normalized, this.baseMapProviderOptions);
    if (!layer) return null;
    const result = this.registerLayer(normalized, layer);
    if (typeof layer.bringToBack === 'function') layer.bringToBack();
    return result;
  }

  /**
   * Replace layer style by redrawing the already-loaded runtime definition.
   *
   * @param {string|number} layerId Runtime layer identifier.
   * @param {Object} style Replacement style definition.
   * @returns {Promise<boolean>} Resolves with `true` once the layer has been redrawn.
   * @throws {Error} When the layer is not registered.
   */
  async setLayerStyle(layerId, style) {
    const entry = this.getLayerEntry(layerId);
    const definition = {
      ...entry.definition,
      style: clonePlainValue(style),
      visible: entry.visible
    };
    const opacity = entry.opacity;
    const selectedFeatureIds = [...(entry.selectedFeatureIds || [])];

    await this.removeLayer(layerId);
    await this.addLayer(definition);
    if (opacity !== 1) await this.setLayerOpacity(layerId, opacity);
    if (selectedFeatureIds.length) await this.setFeatureSelection(layerId, selectedFeatureIds);
    return true;
  }

  /**
   * Apply a global opacity multiplier without changing persisted symbology.
   *
   * @param {string|number} layerId Runtime layer identifier.
   * @param {number} opacity Opacity in the 0-1 range.
   * @returns {Promise<void>} Resolves once the opacity has been applied.
   * @throws {Error} When the layer is not registered.
   */
  async setLayerOpacity(layerId, opacity) {
    const entry = this.getLayerEntry(layerId);
    const value = Math.min(1, Math.max(0, Number(opacity)));
    entry.opacity = value;
    const nativeLayer = entry.layer;
    if (typeof nativeLayer.setOpacity === 'function') {
      nativeLayer.setOpacity(value);
      return;
    }
    if (typeof nativeLayer.eachLayer === 'function') {
      nativeLayer.eachLayer((child) => applyChildOpacity(child, value, entry.baseOpacity));
      if (entry.featureLayers && entry.selectedFeatureIds?.size) {
        for (const [featureId, child] of entry.featureLayers) {
          if (entry.selectedFeatureIds.has(featureId)) {
            applyNativeSelection(child, true, entry.selectionBaseStyles, value, entry.selectionSymbol);
          }
        }
      }
    }
  }

  /**
   * Return geographic bounds for a rendered layer.
   *
   * @param {string|number} layerId Runtime layer identifier.
   * @returns {Promise<?Object>} Resolves with `{ west, south, east, north }`, or `null`.
   * @throws {Error} When the layer is not registered.
   */
  async getLayerBounds(layerId) {
    const entry = this.getLayerEntry(layerId);
    const bounds = typeof entry.layer.getBounds === 'function' ? entry.layer.getBounds() : null;
    if (!bounds?.isValid?.()) return entry.definition?.bounds || null;
    return { west: bounds.getWest(), south: bounds.getSouth(), east: bounds.getEast(), north: bounds.getNorth() };
  }

  /**
   * Return combined bounds for visible operational layers.
   *
   * @returns {Promise<?Object>} Resolves with `{ west, south, east, north }`, or `null`.
   */
  async getVisibleLayerBounds() {
    let combined = null;
    for (const [id, entry] of this.layers) {
      if (id === '__base__' || !entry.visible || !this.map.hasLayer(entry.layer)) continue;
      const nativeBounds = typeof entry.layer.getBounds === 'function' ? entry.layer.getBounds() : null;
      if (nativeBounds?.isValid?.()) {
        combined = combined ? combined.extend(nativeBounds) : L.latLngBounds(nativeBounds);
      } else if (entry.definition?.bounds) {
        const bounds = toLeafletBounds(entry.definition.bounds);
        if (bounds) combined = combined ? combined.extend(bounds) : L.latLngBounds(bounds);
      }
    }
    return combined?.isValid?.()
      ? { west: combined.getWest(), south: combined.getSouth(), east: combined.getEast(), north: combined.getNorth() }
      : null;
  }

  /**
   * Set the map center and zoom.
   *
   * @param {*} center Target center coordinate (`{latitude, longitude}`, `{lat, lng}`, or `[lat, lng]`).
   * @param {number} zoom Target native zoom level.
   * @param {Object} [options={}] Leaflet `setView()` options.
   * @returns {Promise<*>} Resolves when the operation completes.
   * @throws {TypeError} When `center` is not a valid coordinate.
   */
  async setView(center, zoom, options = {}) {
    const point = normalizeCenter(center);
    this.map.setView([point.latitude, point.longitude], zoom, options);
  }

  /**
   * Fit the map viewport to geographic bounds.
   *
   * @param {*} bounds Target bounds, in any shape accepted by {@link normalizeBounds}.
   * @param {Object} [options={}] Leaflet `fitBounds()` options.
   * @returns {Promise<*>} Resolves when the operation completes.
   * @throws {TypeError} When `bounds` is not valid.
   */
  async fitBounds(bounds, options = {}) {
    const normalized = normalizeBounds(bounds);
    this.map.fitBounds(
      [
        [normalized.south, normalized.west],
        [normalized.north, normalized.east]
      ],
      options
    );
  }

  /**
   * Apply document-wide native zoom limits.
   *
   * @param {Object} [options={}] Zoom limits.
   * @param {?number} [options.minZoom=null] Minimum native zoom, or `null` for no limit.
   * @param {?number} [options.maxZoom=null] Maximum native zoom, or `null` for no limit.
   * @returns {Promise<void>} Resolves once the limits (and current zoom, if needed) are applied.
   * @throws {Error} When the map engine has not been initialized.
   */
  async setZoomLimits({ minZoom = null, maxZoom = null } = {}) {
    this.assertInitialized();

    // Leaflet uses undefined to mean "no explicit document limit". Do not
    // coerce null through Number(): Number(null) is 0 and would incorrectly
    // lock an unrestricted MapDocument to zoom level 0.
    const normalizedMinZoom = normalizeZoomLimit(minZoom);
    const normalizedMaxZoom = normalizeZoomLimit(maxZoom);

    this.map.setMinZoom(normalizedMinZoom ?? undefined);
    this.map.setMaxZoom(normalizedMaxZoom ?? undefined);

    const current = this.map.getZoom();
    const effectiveMinZoom = this.map.getMinZoom();
    const effectiveMaxZoom = this.map.getMaxZoom();
    const next = Math.max(effectiveMinZoom, Math.min(effectiveMaxZoom, current));
    if (next !== current) this.map.setZoom(next, { animate: false });
    this.refreshZoomRangeVisibility();
  }

  /**
   * Convert a target viewport width in kilometres to a Leaflet zoom level.
   * The calculation uses Web-Mercator ground resolution at the supplied
   * latitude and the current map container width.
   *
   * @param {number} distanceKm Target viewport width in kilometres.
   * @param {Object} [options={}] Conversion options.
   * @param {?number} [options.latitude=null] Latitude used for the ground-resolution
   *        calculation; defaults to the current map center latitude.
   * @returns {?number} Rounded native zoom level, or `null` when it cannot be computed.
   * @throws {Error} When the map engine has not been initialized.
   */
  distanceKmToZoom(distanceKm, { latitude = null } = {}) {
    this.assertInitialized();
    const km = Number(distanceKm);
    if (!(km > 0)) return null;

    const lat = Number.isFinite(Number(latitude))
      ? Number(latitude)
      : this.map.getCenter().lat;
    const width = Math.max(1, this.map.getSize().x || 1024);
    const metresPerPixel = (km * 1000) / width;
    const latitudeFactor = Math.max(0.000001, Math.cos(lat * Math.PI / 180));
    const zoom = Math.log2((156543.03392804097 * latitudeFactor) / metresPerPixel);
    return Number.isFinite(zoom) ? Math.max(0, Math.round(zoom)) : null;
  }

  /**
   * Re-evaluate all operational layers after a zoom change.
   *
   * @returns {void}
   */
  refreshZoomRangeVisibility() {
    if (!this.map) return;
    for (const [id, entry] of this.layers) {
      if (id === '__base__') continue;
      this.applyLayerEffectiveVisibility(entry);
    }
  }

  /**
   * Show or hide one layer's native representation based on its configured
   * visibility flag and its zoom-range restriction at the current zoom level.
   *
   * @param {Object} entry Native layer registry entry.
   * @returns {void}
   */
  applyLayerEffectiveVisibility(entry) {
    if (!this.map || !entry) return;
    const zoom = this.map.getZoom();
    const minZoom = normalizeZoomLimit(entry.definition?.visibilityMinZoom);
    const maxZoom = normalizeZoomLimit(entry.definition?.visibilityMaxZoom);
    const inRange = (minZoom == null || zoom >= minZoom)
      && (maxZoom == null || zoom <= maxZoom);
    const shouldShow = entry.visible && inRange;

    if (shouldShow && !this.map.hasLayer(entry.layer)) entry.layer.addTo(this.map);
    else if (!shouldShow && this.map.hasLayer(entry.layer)) entry.layer.removeFrom(this.map);
    entry.zoomVisible = inRange;
  }

  /**
   * Notify the map engine that its container dimensions changed.
   *
   * @returns {Promise<*>} Resolves when the operation completes.
   */
  async invalidateSize() {
    this.map.invalidateSize();
  }

  /**
   * Return the current engine-neutral map view state.
   *
   * @returns {{center: {latitude: number, longitude: number}, zoom: number, bounds: Object}} Current view state.
   * @throws {Error} When the map engine has not been initialized.
   */
  getViewState() {
    this.assertInitialized();
    const center = this.map.getCenter();
    const bounds = this.map.getBounds();

    return {
      center: {
        latitude: center.lat,
        longitude: center.lng
      },
      zoom: this.map.getZoom(),
      bounds: {
        west: bounds.getWest(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        north: bounds.getNorth()
      }
    };
  }

  /**
   * Return supported application or map-engine capabilities.
   *
   * @returns {Object} Leaflet engine capability flags.
   */
  getCapabilities() {
    return {
      engine: 'leaflet',
      geojson: true,
      tileLayers: true,
      imageOverlays: true,
      customCrs: false,
      drawing: true,
      markerClustering: typeof L.markerClusterGroup === 'function',
      featureSelection: true,
      multiSelection: true
    };
  }

  /**
   * Release resources, handlers, requests, layers, and host integrations.
   * @returns {Promise<*>} Resolves when the operation completes.
   */
  async destroy() {
    if (!this.map) {
      return;
    }

    await this.endDrawing();

    const map = this.map;
    this.map = null;
    this.operationalLayersPane = null;
    this.layers.clear();

    for (const control of this.nativeControls.values()) {
      control.remove?.();
    }
    this.nativeControls.clear();

    // Remove handlers and DOM references while the container is still
    // attached. This also makes repeated Vite HMR initialization safe.
    map.off();
    map.remove();
  }

  /**
   * Create and register a Leaflet GeoJSON layer, wiring per-feature selection
   * tracking, click handling, and optional marker clustering.
   *
   * @param {Object} definition Engine-neutral runtime GeoJSON layer definition.
   * @returns {Object} Public native-layer registration result.
   */
  addGeoJsonLayer(definition) {
    const paneName = this.ensureOperationalLayerPane(definition);
    const resolveSymbol = (feature) => resolveFeatureSymbol(feature, definition.style);
    const markerClustering = definition.options?.markerClustering === true;
    const markerClusterGridPixels = finiteNonNegativeNumber(definition.options?.markerClusterGridPixels, 20);
    const markerClusterMaxLevel = boundedInteger(definition.options?.markerClusterMaxLevel, 12, 1, 18);
    const pointToLayer = createPointLayerFactory(resolveSymbol, {
      markerClustering,
      iconContext: definition.iconContext,
      paneName
    });
    const selectable = definition.selectable !== false;
    const featureLayers = new Map();
    const featureRecordIds = new Map();
    const recordFeatureIds = new Map();
    const featurePopupLayers = new Map();
    const selectionBaseStyles = new WeakMap();

    const geoJsonLayer = L.geoJSON(definition.data, {
      style: (feature) => createPathStyle(resolveSymbol(feature), paneName),
      pointToLayer,
      onEachFeature: (feature, nativeLayer) => {
        const metadata = getFeatureSelectionMetadata(feature);
        featureLayers.set(metadata.featureId, nativeLayer);
        featureRecordIds.set(metadata.featureId, metadata.recordId);
        if (metadata.recordId != null) {
          if (!recordFeatureIds.has(metadata.recordId)) recordFeatureIds.set(metadata.recordId, new Set());
          recordFeatureIds.get(metadata.recordId).add(metadata.featureId);
        }
        rememberSelectionBaseStyle(nativeLayer, selectionBaseStyles);

        // GeometryCollection features are represented by a FeatureGroup. Bind
        // interaction handlers to the actual leaf marker/path layers so the
        // child click itself stops propagation to the map and we can reopen the
        // popup on the exact geometry that was clicked. Selection remains
        // associated with the logical top-level feature via metadata.featureId.
        bindFeatureClickHandlers(nativeLayer, (event, clickedLayer) => {
          featurePopupLayers.set(metadata.featureId, clickedLayer);

          this.interactionHandlers.onFeatureClick?.({
            layerId: definition.id,
            featureId: metadata.featureId,
            recordId: metadata.recordId,
            selectable,
            additive: Boolean(event.originalEvent?.ctrlKey || event.originalEvent?.metaKey || event.originalEvent?.shiftKey),
            latlng: toPublicLatLng(event.latlng),
            popupProperties: metadata.popupProperties
          });
        });
      }
    });

    const layer = markerClustering
      ? createMarkerClusterLayer(geoJsonLayer, markerClusterGridPixels, markerClusterMaxLevel, paneName)
      : geoJsonLayer;

    const result = this.registerLayer(definition, layer);
    const entry = this.layers.get(definition.id);
    entry.featureLayers = featureLayers;
    entry.featureRecordIds = featureRecordIds;
    entry.recordFeatureIds = recordFeatureIds;
    entry.featurePopupLayers = featurePopupLayers;
    entry.selectionBaseStyles = selectionBaseStyles;
    entry.selectionSymbol = definition.style?.selectSymbol || null;
    entry.selectedFeatureIds = new Set();
    return result;
  }

  /**
   * Create and register a Leaflet tile layer.
   *
   * @param {Object} definition Engine-neutral runtime tile layer definition.
   * @returns {Object} Public native-layer registration result.
   * @throws {TypeError} When the definition has no URL.
   */
  addTileLayer(definition) {
    if (!definition.url) {
      throw new TypeError(
        `Tile layer "${definition.id}" requires a URL; named base maps must be resolved by the host adapter`
      );
    }

    // Do not pass undefined properties. In particular, explicitly assigning
    // `subdomains: undefined` overrides Leaflet's default "abc" value and
    // causes TileLayer._getSubdomain() to read `.length` from undefined.
    const paneName = this.ensureOperationalLayerPane(definition);
    const options = compactOptions({
      ...definition.options,
      pane: paneName,
      attribution: definition.attribution,
      minZoom: definition.minZoom,
      maxZoom: definition.maxZoom,
      subdomains: definition.subdomains,
      tms: definition.tms,
      noWrap: definition.noWrap
      /*
      bounds: toLeafletBounds(definition.bounds),
      opacity: definition.opacity
      */
    });

    const transparentRgb = transparentColorToRgb(definition.imageFilter?.transparentColor);
    const layer = transparentRgb
      ? L.tileLayerPixelFilter(definition.url, {
          ...options,
          pixelCodes: [transparentRgb],
          matchRGBA: [0, 0, 0, 0],
          missRGBA: null
        })
      : L.tileLayer(definition.url, options);

    const filterCss = createImageFilterCss(definition.imageFilter);
    if (filterCss) {
      layer.on('tileload', (event) => {
        if (event.tile?.style) {
          event.tile.style.filter = filterCss;
        }
      });
    }

    return this.registerLayer(definition, layer);
  }

  /**
   * Create and register a Leaflet image overlay.
   *
   * @param {Object} definition Engine-neutral runtime image layer.
   * @returns {Object} Public native-layer registration result.
   */
  addImageLayer(definition) {
    if (!definition.url) {
      throw new TypeError(`Image layer "${definition.id}" requires a URL`);
    }

    const normalized = normalizeBounds(definition.bounds);
    const leafletBounds = [
      [normalized.south, normalized.west],
      [normalized.north, normalized.east]
    ];

    const paneName = this.ensureOperationalLayerPane(definition);
    const options = compactOptions({
      ...definition.options,
      pane: paneName,
      opacity: definition.opacity,
      interactive: false,
      className: `heurist-map-image-layer heurist-map-image-layer-${sanitizeClassToken(definition.id)}`
    });

    const layer = L.imageOverlay(definition.url, leafletBounds, options);
    const filterCss = createImageFilterCss(definition.imageFilter);

    const applyFilter = () => {
      const image = layer.getElement();
      if (image) {
        image.style.filter = filterCss;
      }
    };

    layer.on('load', applyFilter);
    const result = this.registerLayer(definition, layer);
    applyFilter();
    return result;
  }

  /**
   * Register a native Leaflet layer and optionally add it to the map.
   *
   * @param {Object} definition Engine-neutral runtime layer definition.
   * @param {Object} layer Native Leaflet layer instance.
   * @returns {{id: (string|number), type: string}} Public native-layer registration result.
   */
  registerLayer(definition, layer) {
    const visible = definition.visible !== false;
    const paneName = definition.id === '__base__' ? null : this.ensureOperationalLayerPane(definition);
    const entry = { definition, layer, paneName, visible, zoomVisible: true, opacity: 1, baseOpacity: new WeakMap(), featureLayers: null, featureRecordIds: null, recordFeatureIds: null, selectionBaseStyles: new WeakMap(), selectedFeatureIds: new Set() };

    this.layers.set(definition.id, entry);
    this.refreshOperationalLayerOrder();
    this.applyLayerEffectiveVisibility(entry);

    return {
      id: definition.id,
      type: definition.type
    };
  }

  /**
   * Ensure one stable Leaflet pane exists for an operational MapLayer.
   * All panes are children of one parent stacking context so their local
   * z-index never competes with Leaflet popups/tooltips/control panes.
   *
   * @param {Object} definition Engine-neutral runtime layer definition.
   * @returns {string} The layer's pane name.
   */
  ensureOperationalLayerPane(definition) {
    const paneName = `heurist-map-layer-${sanitizeClassToken(definition.id)}`;
    if (!this.map.getPane(paneName)) {
      const container = this.operationalLayersPane || this.map.getPane('overlayPane');
      const pane = this.map.createPane(paneName, container);
      pane.classList.add('heurist-map-operational-layer-pane');
    }
    return paneName;
  }

  /**
   * Keep native layer panes in the same order as the engine-neutral layer list.
   *
   * @returns {void}
   */
  refreshOperationalLayerOrder() {
    if (!this.map) return;
    const entries = [...this.layers.entries()]
      .filter(([id, entry]) => id !== '__base__' && entry.paneName)
      .sort(([, a], [, b]) => {
        const order = Number(a.definition?.order || 0) - Number(b.definition?.order || 0);
        return order || String(a.definition?.id).localeCompare(String(b.definition?.id));
      });

    entries.forEach(([, entry], index) => {
      const pane = this.map.getPane(entry.paneName);
      if (pane) pane.style.zIndex = String(index + 1);
    });
  }

  /**
   * Return a native Leaflet layer registry entry.
   *
   * @param {string|number} layerId Runtime layer identifier.
   * @returns {Object} The native layer registry entry.
   * @throws {Error} When no layer is registered under `layerId`.
   */
  getLayerEntry(layerId) {
    const entry = this.layers.get(layerId);
    if (!entry) {
      throw new Error(`Unknown layer "${layerId}"`);
    }
    return entry;
  }

  /**
   * Throw when the map engine has not been initialized.
   *
   * @returns {void}
   * @throws {Error} When the Leaflet map has not been initialized.
   */
  assertInitialized() {
    if (!this.map) {
      throw new Error('Leaflet map is not initialized');
    }
  }
}

/**
 * Recognize a GeoJSON Polygon that is an axis-aligned rectangle and return its bounds.
 * Used to preserve rectangle/image/filter drawing shapes edited by the legacy editor.
 *
 * @param {*} value GeoJSON Feature or Polygon geometry.
 * @returns {?Object} Leaflet `LatLngBounds`, or `null` when not an axis-aligned rectangle.
 */
function getAxisAlignedRectangleBounds(value) {
  const geometry = value?.type === 'Feature' ? value.geometry : value;
  if (geometry?.type !== 'Polygon' || geometry.coordinates?.length !== 1) return null;
  const ring = geometry.coordinates[0] || [];
  if (ring.length !== 5) return null;
  const points = ring.slice(0, -1);
  if (ring[0]?.[0] !== ring[4]?.[0] || ring[0]?.[1] !== ring[4]?.[1]) return null;
  const xs = [...new Set(points.map((point) => Number(point?.[0])))];
  const ys = [...new Set(points.map((point) => Number(point?.[1])))];
  if (xs.length !== 2 || ys.length !== 2 || xs.some(Number.isNaN) || ys.some(Number.isNaN)) return null;
  if (points.some(([x, y], index) => {
    const next = points[(index + 1) % points.length];
    return x !== next[0] && y !== next[1];
  })) return null;
  return L.latLngBounds([ys[0], xs[0]], [ys[1], xs[1]]);
}


/**
 * Validate that a runtime layer definition has the minimum required shape.
 *
 * @param {*} definition Candidate runtime layer definition.
 * @returns {void}
 * @throws {TypeError} When the definition is not an object, or lacks `id`/`type`.
 */
function validateLayerDefinition(definition) {
  if (!definition || typeof definition !== 'object') {
    throw new TypeError('Layer definition must be an object');
  }
  if (!definition.id) {
    throw new TypeError('Layer definition requires an id');
  }
  if (!definition.type) {
    throw new TypeError('Layer definition requires a type');
  }
}

/**
 * Normalize a raw center coordinate to `{ latitude, longitude }`.
 *
 * @param {*} center Raw center (`{latitude, longitude}`, `{lat, lng}`, or `[lat, lng]`).
 * @returns {{latitude: number, longitude: number}} Normalized center.
 * @throws {TypeError} When the center is not a valid coordinate.
 */
function normalizeCenter(center) {
  const latitude = Number(center?.latitude ?? center?.lat ?? center?.[0]);
  const longitude = Number(center?.longitude ?? center?.lng ?? center?.lon ?? center?.[1]);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new TypeError('Invalid map center');
  }

  return { latitude, longitude };
}

/**
 * Normalize raw geographic bounds, throwing when they cannot be resolved.
 *
 * @param {*} bounds Raw bounds value.
 * @returns {{west: number, south: number, east: number, north: number}} Normalized bounds.
 * @throws {TypeError} When the bounds cannot be normalized.
 */
function normalizeBounds(bounds) {
  const normalized = normalizeGeographicBounds(bounds);
  if (!normalized) {
    throw new TypeError('Invalid map bounds');
  }
  return normalized;
}

/**
 * Convert engine-neutral geographic bounds to a Leaflet `[[south, west], [north, east]]` pair.
 *
 * @param {*} bounds Raw bounds value.
 * @returns {Array<Array<number>>|undefined} Leaflet-shaped bounds pair, or `undefined` when unresolvable.
 */
function toLeafletBounds(bounds) {
  const normalized = normalizeGeographicBounds(bounds);
  return normalized
    ? [
        [normalized.south, normalized.west],
        [normalized.north, normalized.east]
      ]
    : undefined;
}


/**
 * Remove `undefined`-valued keys from a Leaflet options object, since Leaflet
 * treats an explicit `undefined` differently from an absent key for some options.
 *
 * @param {Object} options Candidate options object.
 * @returns {Object} Shallow copy with `undefined` values removed.
 */
function compactOptions(options) {
  return Object.fromEntries(
    Object.entries(options).filter(([, value]) => value !== undefined)
  );
}

/**
 * Build a Leaflet `pointToLayer` factory that resolves the correct marker type
 * (image, icon-font, cluster-friendly, or default circle marker) per feature.
 *
 * @param {Function} resolveSymbol Resolves the effective symbol for a GeoJSON feature.
 * @param {Object} [options={}] Factory options.
 * @param {boolean} [options.markerClustering=false] Use Marker-based icons compatible with clustering.
 * @param {?Object} [options.iconContext=null] Record-type icon context (`baseUrl`, `database`).
 * @param {?string} [options.paneName=null] Leaflet pane to render markers into.
 * @returns {Function} A Leaflet `pointToLayer(feature, latlng)` callback.
 */
function createPointLayerFactory(resolveSymbol, { markerClustering = false, iconContext = null, paneName = null } = {}) {
  const imageIconCache = new Map();

  return (feature, latlng) => {
    const symbol = resolveSymbol(feature) || {};
    const imageUrl = resolveImageMarkerUrl(symbol, feature, iconContext);
    if (imageUrl) {
      const cacheKey = imageMarkerCacheKey(symbol, imageUrl);
      let icon = imageIconCache.get(cacheKey);
      if (!icon) {
        icon = createImageMarkerIcon(symbol, imageUrl);
        imageIconCache.set(cacheKey, icon);
      }
      return L.marker(latlng, compactOptions({ icon, pane: paneName }));
    }

    if (symbol.iconType === 'iconfont') {
      return L.marker(latlng, compactOptions({ icon: createIconFontIcon(symbol), pane: paneName }));
    }

    // Leaflet.markercluster is designed for Marker instances. The normal
    // renderer uses CircleMarker for default point symbols, so clustering uses
    // a marker-backed divIcon that preserves the same circle appearance.
    if (markerClustering) {
      return L.marker(latlng, compactOptions({ icon: createClusterPointIcon(symbol), pane: paneName }));
    }

    return L.circleMarker(latlng, compactOptions({
      pane: paneName,
      radius: symbol.radius,
      color: symbol.color,
      weight: symbol.weight,
      opacity: symbol.opacity,
      fillColor: symbol.fillColor,
      fillOpacity: symbol.fillOpacity,
      fill: symbol.fill,
      stroke: symbol.stroke
    }));
  };
}

/**
 * Build Leaflet vector path style options from an effective symbol.
 *
 * @param {Object} [symbol={}] Effective symbol for the path feature.
 * @param {?string} [paneName=null] Leaflet pane to render the path into.
 * @returns {Object} Compact Leaflet path style options.
 */
function createPathStyle(symbol = {}, paneName = null) {
  return compactOptions({
    pane: paneName,
    color: symbol.color,
    weight: symbol.weight,
    opacity: symbol.opacity,
    fillColor: symbol.fillColor,
    fillOpacity: symbol.fillOpacity,
    fill: symbol.fill,
    stroke: symbol.stroke,
    dashArray: symbol.dashArray
  });
}

/**
 * Wrap a GeoJSON layer's markers in a Leaflet.markercluster group.
 *
 * @param {Object} geoJsonLayer Source Leaflet GeoJSON layer whose markers are clustered.
 * @param {number} [gridPixels=20] Maximum cluster radius in pixels.
 * @param {number} [maxLevel=12] Maximum zoom level at which clustering still applies.
 * @param {?string} [paneName=null] Leaflet pane for the cluster group.
 * @returns {Object} The Leaflet.markercluster group containing the layer's markers.
 * @throws {Error} When Leaflet.markercluster is not available.
 */
function createMarkerClusterLayer(geoJsonLayer, gridPixels = 20, maxLevel = 12, paneName = null) {
  if (typeof L.markerClusterGroup !== 'function') {
    throw new Error('Marker clustering is enabled but Leaflet.markercluster is not available');
  }

  const clusterLayer = L.markerClusterGroup({
    chunkedLoading: true,
    clusterPane: paneName || 'markerPane',
    maxClusterRadius: finiteNonNegativeNumber(gridPixels, 20),
    disableClusteringAtZoom: boundedInteger(maxLevel, 12, 1, 18) + 1
  });
  clusterLayer.addLayers(geoJsonLayer.getLayers());
  return clusterLayer;
}


/**
 * Build a cache key for an image marker icon derived from its visual properties.
 *
 * @param {Object} symbol Effective symbol for the marker.
 * @param {string} iconUrl Resolved marker image URL.
 * @returns {string} JSON cache key.
 */
function imageMarkerCacheKey(symbol, iconUrl) {
  return JSON.stringify([
    iconUrl,
    symbol?.iconSize ?? null,
    symbol?.iconAnchor ?? null,
    symbol?.popupAnchor ?? null,
    symbol?.color ?? null
  ]);
}

/**
 * Create a Leaflet icon for an image-backed marker, tinting it via CSS filter
 * when a color is set (falling back to a `divIcon` wrapper so the filter applies).
 *
 * @param {Object} symbol Effective symbol for the marker.
 * @param {string} iconUrl Resolved marker image URL.
 * @returns {Object} A Leaflet `Icon` or `DivIcon` instance.
 */
function createImageMarkerIcon(symbol, iconUrl) {
  const size = Array.isArray(symbol.iconSize) ? symbol.iconSize : [finitePositiveNumber(symbol.iconSize, 18), finitePositiveNumber(symbol.iconSize, 18)];
  const iconAnchor = leafletPointOption(symbol.iconAnchor);
  const popupAnchor = leafletPointOption(symbol.popupAnchor);
  const filter = symbol.color ? hexToCssFilter(symbol.color) : '';
  if (!filter) {
    return L.icon(compactOptions({ iconUrl, iconSize: size, iconAnchor, popupAnchor }));
  }
  const width = finitePositiveNumber(size?.[0], 18);
  const height = finitePositiveNumber(size?.[1], width);
  const html = `<img src="${escapeAttribute(iconUrl)}" alt="" style="display:block;width:${width}px;height:${height}px;object-fit:contain;filter:${escapeAttribute(filter)}">`;
  return L.divIcon(compactOptions({
    className: 'heurist-map-image-marker',
    html,
    iconSize: [width, height],
    iconAnchor,
    popupAnchor
  }));
}

/**
 * Normalize a raw point option (array pair or `{x, y}` object) to a Leaflet `[x, y]` pair.
 *
 * @param {*} value Raw point value.
 * @returns {Array<number>|undefined} Normalized `[x, y]` pair, or `undefined` when invalid/absent.
 */
function leafletPointOption(value) {
  if (value == null) return undefined;
  if (Array.isArray(value) && value.length >= 2) {
    const x = Number(value[0]);
    const y = Number(value[1]);
    return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : undefined;
  }
  if (typeof value === 'object') {
    const x = Number(value.x);
    const y = Number(value.y);
    return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : undefined;
  }
  return undefined;
}

/**
 * Resolve the image URL for an image-backed marker symbol, including the
 * record-type icon URL variant that depends on the feature's record type.
 *
 * @param {Object} symbol Effective symbol for the marker.
 * @param {Object} feature GeoJSON feature the marker is rendered for.
 * @param {?Object} iconContext Record-type icon context (`baseUrl`, `database`).
 * @returns {?string} Resolved image URL, or `null` when not image-backed/resolvable.
 */
function resolveImageMarkerUrl(symbol, feature, iconContext) {
  const type = String(symbol?.iconType || '').toLowerCase();
  if ((type === 'url' || type === 'image' || type === 'icon' || type === 'marker') && symbol?.iconUrl) return String(symbol.iconUrl);
  if (type !== 'rectype' || !iconContext?.baseUrl || !iconContext?.database) return null;
  const recordTypeId = Number(feature?.properties?.heurist?.recordTypeId ?? feature?.properties?.rec_RecTypeID);
  if (!Number.isInteger(recordTypeId) || recordTypeId < 1) return null;
  const url = new URL(iconContext.baseUrl);
  url.searchParams.set('db', iconContext.database);
  url.searchParams.set('icon', String(recordTypeId));
  return url.toString();
}

/**
 * Escape a value for safe inclusion in an HTML attribute.
 *
 * @param {*} value Value to escape.
 * @returns {string} HTML-attribute-safe string.
 */
function escapeAttribute(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

/**
 * Coerce a value to a finite, non-negative number.
 *
 * @param {*} value Candidate value.
 * @param {number} fallback Fallback used when `value` is not finite/non-negative.
 * @returns {number} The finite non-negative number, or `fallback`.
 */
function finiteNonNegativeNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

/**
 * Coerce a value to an integer clamped to a `[min, max]` range.
 *
 * @param {*} value Candidate value.
 * @param {number} fallback Fallback used when `value` is not finite.
 * @param {number} min Minimum allowed value.
 * @param {number} max Maximum allowed value.
 * @returns {number} The clamped rounded integer, or `fallback`.
 */
function boundedInteger(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
}

/**
 * Build a `divIcon` that renders default (non-clustered) point symbology as a
 * Marker-compatible icon, for use inside a Leaflet.markercluster group.
 *
 * @param {Object} [symbol={}] Effective symbol for the marker.
 * @returns {Object} A Leaflet `DivIcon` instance.
 */
function createClusterPointIcon(symbol = {}) {
  const radius = finitePositiveNumber(symbol.radius, 6);
  const diameter = Math.max(2, radius * 2);
  const fillColor = symbol.fillColor || symbol.color || '#3388ff';
  const strokeColor = symbol.color || '#3388ff';
  const weight = Math.max(0, finiteNumber(symbol.weight, 2));
  const opacity = finiteOpacity(symbol.opacity, 1);
  const fillOpacity = finiteOpacity(symbol.fillOpacity, 0.2);
  const fill = symbol.fill !== false;
  const stroke = symbol.stroke !== false;
  const style = [
    'display:block',
    'box-sizing:border-box',
    `width:${diameter}px`,
    `height:${diameter}px`,
    'border-radius:50%',
    `background:${fill ? fillColor : 'transparent'}`,
    `opacity:${opacity}`,
    stroke ? `border:${weight}px solid ${strokeColor}` : 'border:0',
    fill ? `--heurist-map-marker-fill-opacity:${fillOpacity}` : ''
  ].filter(Boolean).join(';');

  const background = fill ? hexOrCssWithOpacity(fillColor, fillOpacity) : 'transparent';
  return L.divIcon({
    className: 'heurist-map-cluster-point-icon',
    html: `<span style="${style};background:${background}"></span>`,
    iconSize: [diameter, diameter],
    iconAnchor: [diameter / 2, diameter / 2]
  });
}

/**
 * Coerce a value to a finite, strictly positive number.
 *
 * @param {*} value Candidate value.
 * @param {number} fallback Fallback used when `value` is not finite/positive.
 * @returns {number} The finite positive number, or `fallback`.
 */
function finitePositiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

/**
 * Coerce a value to a finite number.
 *
 * @param {*} value Candidate value.
 * @param {number} fallback Fallback used when `value` is not finite.
 * @returns {number} The finite number, or `fallback`.
 */
function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

/**
 * Convert a `#rrggbb` hex color and opacity to an `rgba()` CSS color string.
 *
 * @param {*} color Candidate color; only 6-digit hex colors are converted.
 * @param {number} opacity Alpha value applied to the resulting color.
 * @returns {string} An `rgba(...)` string, or `color` unchanged when not a hex color.
 */
function hexOrCssWithOpacity(color, opacity) {
  const hex = typeof color === 'string' ? color.trim() : '';
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return color;
  const value = match[1];
  return `rgba(${parseInt(value.slice(0, 2), 16)},${parseInt(value.slice(2, 4), 16)},${parseInt(value.slice(4, 6), 16)},${opacity})`;
}

/**
 * Build a `divIcon` rendering an icon-font glyph (Font Awesome or the legacy
 * `ui-icon-*` set) as a marker, sanitizing the resolved CSS class list.
 *
 * @param {Object} symbol Effective symbol for the marker (`iconFont`, `iconSize`, `iconAnchor`, `color`).
 * @returns {Object} A Leaflet `DivIcon` instance.
 */
function createIconFontIcon(symbol) {
  const iconFont = symbol.iconFont || 'ui-icon-location';
  let className;

  const classes = String(iconFont)
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const isFontAwesome = classes.some((name) =>
    name === 'fa'
    || name === 'fas'
    || name === 'far'
    || name === 'fab'
    || name.startsWith('fa-')
  );

  if (isFontAwesome) {
    const hasStyleClass = classes.some((name) =>
      name === 'fa-solid'
      || name === 'fa-regular'
      || name === 'fa-brands'
      || name === 'fas'
      || name === 'far'
      || name === 'fab'
    );
    if (!hasStyleClass) {
      classes.unshift('fa-solid');
    }
    className = classes.join(' ');
  } else {
    const iconClass = classes.find((name) => name.startsWith('ui-icon-')) || iconFont;
    className = `ui-icon ${iconClass.startsWith('ui-icon-') ? iconClass : `ui-icon-${iconClass}`}`;
  }

  const safeClassName = className
    .split(/\s+/)
    .filter((name) => /^[A-Za-z0-9_-]+$/.test(name))
    .join(' ');

  let width = 24;
  let height = 24;
  if (Array.isArray(symbol.iconSize)) {
    width = Number(symbol.iconSize[0]) || 24;
    height = Number(symbol.iconSize[1]) || width;
  } else if (Number(symbol.iconSize) > 0) {
    width = height = Number(symbol.iconSize);
  }

  const fontSize = Math.min(width, height);
  const color = (symbol.color || '#000000'); //escapeHtml

  // Image-backed markers (url/rectype) already ignore vector fill properties.
  // Icon-font markers must follow the same marker semantics: fill/fillColor are
  // path/polygon properties and must not create a background behind the glyph.
  return L.divIcon({
    className: 'heurist-map-iconfont-marker',
    html: `<span class="${safeClassName}" style="display:flex;align-items:center;justify-content:center;border:none;font-size:${fontSize}px;width:${width}px;height:${height}px;color:${color};background:none;"></span>`,
    iconSize: [width, height],
    iconAnchor: symbol.iconAnchor || [width / 2, height / 2]
  });
}

/**
 * Sanitize a value into a safe CSS class-name/pane-name token.
 *
 * @param {*} value Candidate value.
 * @returns {string} Token with only letters, digits, `_`, and `-`.
 */
function sanitizeClassToken(value) {
  return String(value).replace(/[^A-Za-z0-9_-]/g, '-');
}

/**
 * Resolve the feature/record identifiers and popup properties embedded in a
 * GeoJSON feature by MapLayer loaders.
 *
 * @param {Object} feature GeoJSON feature.
 * @returns {{featureId: string, recordId: ?number, popupProperties: Object}} Selection metadata.
 */
function getFeatureSelectionMetadata(feature) {
  const properties = feature?.properties && typeof feature.properties === 'object' ? feature.properties : {};
  const metadata = properties.heurist || {};
  const featureId = String(metadata.featureId ?? feature?.id ?? '');
  const recordId = Number.isInteger(Number(metadata.recordId)) ? Number(metadata.recordId) : null;
  return {
    featureId,
    recordId,
    popupProperties: properties
  };
}

/**
 * Convert a Leaflet LatLng to the engine-neutral `{ latitude, longitude }` shape.
 *
 * @param {?Object} latlng Leaflet LatLng instance.
 * @returns {?{latitude: number, longitude: number}} Engine-neutral coordinate, or `null`.
 */
function toPublicLatLng(latlng) {
  return latlng ? { latitude: latlng.lat, longitude: latlng.lng } : null;
}

/**
 * Recursively bind a stopped-propagation click handler to a native layer (or
 * every child of a compound layer), so feature clicks never bubble to the map.
 *
 * @param {?Object} layer Native Leaflet layer (or group).
 * @param {Function} handler Called with `(event, clickedLayer)` on click.
 * @returns {void}
 */
function bindFeatureClickHandlers(layer, handler) {
  if (!layer) return;

  if (typeof layer.eachLayer === 'function') {
    layer.eachLayer((child) => bindFeatureClickHandlers(child, handler));
    return;
  }

  layer.options = layer.options || {};
  layer.options.bubblingMouseEvents = false;
  if (typeof layer.on !== 'function') return;

  layer.on('click', (event) => {
    if (event.originalEvent) L.DomEvent.stopPropagation(event.originalEvent);
    handler(event, layer);
  });
}

/**
 * Find the first descendant layer (or the layer itself) capable of opening a popup.
 *
 * @param {?Object} layer Native Leaflet layer (or group).
 * @returns {?Object} A layer supporting `openPopup()`, or `null` when none is found.
 */
function getFirstPopupCapableLayer(layer) {
  if (!layer) return null;
  if (typeof layer.eachLayer === 'function') {
    let found = null;
    layer.eachLayer((child) => {
      if (!found) found = getFirstPopupCapableLayer(child);
    });
    return found;
  }
  return typeof layer.openPopup === 'function' ? layer : null;
}

/**
 * Remember a native layer's (or each child's, for compound layers) unselected
 * base style so it can be restored after deselection.
 *
 * @param {Object} layer Native Leaflet layer (or group).
 * @param {WeakMap<Object, Object>} storage Map from native layer to its remembered base style.
 * @returns {void}
 */
function rememberSelectionBaseStyle(layer, storage) {
  // GeometryCollection and other compound GeoJSON features are represented by
  // Leaflet FeatureGroup/LayerGroup instances. Selection is rendered by the
  // child paths, so remember each child's own style rather than only the group.
  if (typeof layer.eachLayer === 'function') {
    layer.eachLayer((child) => rememberSelectionBaseStyle(child, storage));
    return;
  }

  const options = layer.options || {};
  storage.set(layer, {
    color: options.color,
    weight: options.weight,
    opacity: options.opacity,
    fillColor: options.fillColor,
    fillOpacity: options.fillOpacity,
    radius: typeof layer.getRadius === 'function' ? layer.getRadius() : null
  });
}

/**
 * Apply or restore selection styling on a native layer (or each child, for
 * compound features), honoring the layer's opacity multiplier and optional
 * configured selection symbol.
 *
 * @param {Object} layer Native Leaflet layer (or group).
 * @param {boolean} selected Whether the feature should render as selected.
 * @param {WeakMap<Object, Object>} storage Map from native layer to its remembered base style.
 * @param {number} [opacityMultiplier=1] Layer opacity multiplier to combine with the base/selected style.
 * @param {?Object} [selectionSymbol=null] Optional style override for the selected state.
 * @returns {void}
 */
function applyNativeSelection(layer, selected, storage, opacityMultiplier = 1, selectionSymbol = null) {
  // Apply selection recursively to compound features. Calling setStyle() only on
  // the FeatureGroup can propagate the selected style, but the group's options
  // do not contain the individual child base styles needed to restore them.
  if (typeof layer.eachLayer === 'function') {
    layer.eachLayer((child) => {
      applyNativeSelection(child, selected, storage, opacityMultiplier, selectionSymbol);
    });
    return;
  }

  const base = storage.get(layer) || {};
  const symbol = selectionSymbol && typeof selectionSymbol === 'object' ? selectionSymbol : {};
  if (typeof layer.setStyle === 'function') {
    const restoredStyle = compactOptions({
      color: base.color,
      weight: base.weight,
      opacity: finiteOpacity(base.opacity, 1) * opacityMultiplier,
      fillColor: base.fillColor,
      fillOpacity: finiteOpacity(base.fillOpacity, 0.2) * opacityMultiplier
    });
    const selectedWeight = symbol.weight ?? Math.max(Number(base.weight) || 2, 4);
    const selectedFillOpacity = symbol.fillOpacity
      ?? Math.max(Number(base.fillOpacity) || 0, 0.35);
    layer.setStyle(selected ? compactOptions({
      color: symbol.color ?? '#ff0000',
      weight: selectedWeight,
      opacity: finiteOpacity(symbol.opacity, 1) * opacityMultiplier,
      fillColor: symbol.fillColor ?? '#ffff00',
      fillOpacity: finiteOpacity(selectedFillOpacity, 0.35) * opacityMultiplier,
      dashArray: symbol.dashArray,
      fill: symbol.fill,
      stroke: symbol.stroke
    }) : restoredStyle);
    if (base.radius != null && typeof layer.setRadius === 'function') {
      const radius = Number(symbol.radius);
      layer.setRadius(selected
        ? (Number.isFinite(radius) && radius >= 0 ? radius : base.radius * 1.5)
        : base.radius);
    }
  }
  const element = typeof layer.getElement === 'function' ? layer.getElement() : null;
  element?.classList.toggle('heurist-map-feature-selected', selected);
  if (selected && typeof layer.bringToFront === 'function') layer.bringToFront();
}

/**
 * Restore the native insertion order of path features in one GeoJSON layer.
 * Leaflet Path.bringToFront() physically moves an SVG element to the end of its
 * renderer, so deselection must rebuild the normal DOM order explicitly.
 *
 * @param {?Object} layer Native Leaflet layer (or group).
 * @returns {void}
 */
function restoreNativeLayerOrder(layer) {
  if (!layer || typeof layer.eachLayer !== 'function') return;
  layer.eachLayer((child) => {
    if (typeof child.eachLayer === 'function') {
      restoreNativeLayerOrder(child);
    } else if (typeof child.bringToFront === 'function') {
      child.bringToFront();
    }
  });
}

/**
 * Bring one logical feature (including compound geometries) to the front.
 *
 * @param {?Object} layer Native Leaflet layer (or group).
 * @returns {void}
 */
function bringNativeFeatureToFront(layer) {
  if (!layer) return;
  if (typeof layer.eachLayer === 'function') {
    layer.eachLayer((child) => bringNativeFeatureToFront(child));
    return;
  }
  if (typeof layer.bringToFront === 'function') layer.bringToFront();
}

/**
 * Return whether a logical feature contains at least one Leaflet Path.
 *
 * @param {?Object} layer Native Leaflet layer (or group).
 * @returns {boolean} `true` when the layer (or a descendant) supports `bringToFront()`.
 */
function canBringNativeFeatureToFront(layer) {
  if (!layer) return false;
  if (typeof layer.bringToFront === 'function') return true;
  if (typeof layer.eachLayer !== 'function') return false;
  let found = false;
  layer.eachLayer((child) => {
    if (!found && canBringNativeFeatureToFront(child)) found = true;
  });
  return found;
}

/**
 * Resolve geographic bounds for a single native feature layer (path or point).
 *
 * @param {Object} layer Native Leaflet layer.
 * @returns {?Object} Leaflet `LatLngBounds`, or `null` when unresolvable.
 */
function getNativeFeatureBounds(layer) {
  if (typeof layer.getBounds === 'function') return layer.getBounds();
  if (typeof layer.getLatLng === 'function') {
    const point = layer.getLatLng();
    return point ? L.latLngBounds(point, point) : null;
  }
  return null;
}

/**
 * Apply a layer's opacity multiplier on top of its remembered base opacity.
 *
 * @param {Object} layer Native Leaflet child layer.
 * @param {number} multiplier Opacity multiplier in the 0-1 range.
 * @param {WeakMap<Object, Object>} baseOpacity Map from native layer to its remembered base opacity.
 * @returns {void}
 */
function applyChildOpacity(layer, multiplier, baseOpacity) {
  let base = baseOpacity.get(layer);
  if (!base) {
    const options = layer.options || {};
    base = {
      opacity: finiteOpacity(options.opacity, 1),
      fillOpacity: finiteOpacity(options.fillOpacity, 0.2)
    };
    baseOpacity.set(layer, base);
  }

  if (typeof layer.setStyle === 'function') {
    layer.setStyle({
      opacity: base.opacity * multiplier,
      fillOpacity: base.fillOpacity * multiplier
    });
    return;
  }

  if (typeof layer.setOpacity === 'function') {
    layer.setOpacity(base.opacity * multiplier);
    return;
  }

  const element = typeof layer.getElement === 'function' ? layer.getElement() : null;
  if (element) element.style.opacity = String(base.opacity * multiplier);
}

/**
 * Coerce a value to a finite opacity number.
 *
 * @param {*} value Candidate value.
 * @param {number} fallback Fallback used when `value` is not finite.
 * @returns {number} The finite number, or `fallback`.
 */
function finiteOpacity(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

/**
 * Convert Leaflet's non-GeoJSON Circle into the polygon used by the legacy editor.
 *
 * @param {Object} circle Native Leaflet `Circle` instance.
 * @param {Object} map Native Leaflet map instance (accepted for parity with the caller; unused).
 * @param {number} [segments=40] Number of polygon vertices approximating the circle.
 * @returns {Object} A GeoJSON Polygon Feature approximating the circle.
 */
function circleToPolygonFeature(circle, map, segments = 40) {
  const center = circle.getLatLng();
  const radius = circle.getRadius();
  const latitudeRadians = center.lat * Math.PI / 180;
  const earthRadius = 6378137;
  const angular = radius / earthRadius;
  const coordinates = [];
  for (let index = 0; index < segments; index += 1) {
    const bearing = index * 2 * Math.PI / segments;
    const latitude = Math.asin(
      Math.sin(latitudeRadians) * Math.cos(angular)
      + Math.cos(latitudeRadians) * Math.sin(angular) * Math.cos(bearing)
    );
    const longitude = center.lng * Math.PI / 180 + Math.atan2(
      Math.sin(bearing) * Math.sin(angular) * Math.cos(latitudeRadians),
      Math.cos(angular) - Math.sin(latitudeRadians) * Math.sin(latitude)
    );
    coordinates.push([longitude * 180 / Math.PI, latitude * 180 / Math.PI]);
  }
  coordinates.push([...coordinates[0]]);
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [coordinates] }
  };
}

/**
 * Deep-clone a plain JSON-serializable value.
 *
 * @param {*} value Value to clone.
 * @returns {*} Cloned value, or `value` unchanged when `null`/`undefined`.
 */
function clonePlainValue(value) {
  if (value == null) return value;
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}
