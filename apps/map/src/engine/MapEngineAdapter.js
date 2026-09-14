/**
 * MapEngineAdapter.js - Map engine adapter contract
 *
 * @fileOverview Defines the engine-neutral operations that concrete rendering engines such as Leaflet must implement.
 * @project     Heurist mapping application
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2026 Heurist Network
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @author      Artem Osmakov <osmakov@gmail.com>
 */

/**
 * Contract implemented by concrete map engines.
 */
export class MapEngineAdapter {
  /**
   * Initialize the component and its required resources.
   * @returns {Promise<*>} Resolves when the operation completes.
   */
  async initialize() {
    throw new Error('MapEngineAdapter.initialize() is not implemented');
  }

  /**
   * Add an engine-neutral runtime layer and register its application state.
   * @returns {Promise<*>} Resolves when the operation completes.
   */
  async addLayer() {
    throw new Error('MapEngineAdapter.addLayer() is not implemented');
  }

  /**
   * Remove a runtime layer from the map and application registry.
   * @returns {Promise<boolean>} Resolves with whether a layer was removed.
   */
  async removeLayer() {
    throw new Error('MapEngineAdapter.removeLayer() is not implemented');
  }

  /**
   * Show or hide a runtime layer.
   * @returns {Promise<*>} Resolves when the operation completes.
   */
  async setLayerVisibility() {
    throw new Error('MapEngineAdapter.setLayerVisibility() is not implemented');
  }


  /** Return base maps available from the concrete engine/provider catalogue. */
  getAvailableBaseMaps() { return []; }

  /** Configure engine-neutral map interaction callbacks. */
  setInteractionHandlers() {}

  /** Show/hide native controls implemented by the concrete map engine. */
  async setNativeControls() {
    throw new Error('MapEngineAdapter.setNativeControls() is not implemented');
  }

  /** Lazily bind/open HTML popup content for one rendered feature. */
  async openFeaturePopup() {
    throw new Error('MapEngineAdapter.openFeaturePopup() is not implemented');
  }

  /** Apply selected feature IDs for one layer. */
  async setFeatureSelection() {
    throw new Error('MapEngineAdapter.setFeatureSelection() is not implemented');
  }

  /** Return bounds for selected features in one layer. */
  async getSelectionBounds() {
    return null;
  }

  /** Resolve record ID for a rendered feature without exposing native objects. */
  getFeatureRecordId() {
    return null;
  }

  /** Resolve rendered feature IDs for one record. */
  getFeatureIdsByRecord() {
    return [];
  }

  /** Replace the current base map. */
  async setBaseMap() {
    throw new Error('MapEngineAdapter.setBaseMap() is not implemented');
  }

  /** Replace the runtime style for one rendered layer without reloading source data. */
  async setLayerStyle() {
    throw new Error('MapEngineAdapter.setLayerStyle() is not implemented');
  }

  /** Set a runtime global opacity multiplier for one rendered layer. */
  async setLayerOpacity() {
    throw new Error('MapEngineAdapter.setLayerOpacity() is not implemented');
  }

  /** Return engine-neutral bounds for a rendered layer when available. */
  async getLayerBounds() {
    return null;
  }

  /** Return combined bounds of visible rendered operational layers. */
  async getVisibleLayerBounds() {
    return null;
  }

  /**
   * Set the map center and zoom.
   * @returns {Promise<*>} Resolves when the operation completes.
   */
  async setView() {
    throw new Error('MapEngineAdapter.setView() is not implemented');
  }

  /**
   * Fit the map viewport to geographic bounds.
   * @returns {Promise<*>} Resolves when the operation completes.
   */
  async fitBounds() {
    throw new Error('MapEngineAdapter.fitBounds() is not implemented');
  }

  /** Apply native map zoom limits; null removes a limit. */
  async setZoomLimits() {
    throw new Error('MapEngineAdapter.setZoomLimits() is not implemented');
  }

  /** Convert a viewport width expressed in kilometres to a native zoom level. */
  distanceKmToZoom() {
    return null;
  }

  /**
   * Notify the map engine that its container dimensions changed.
   * @returns {Promise<*>} Resolves when the operation completes.
   */
  async invalidateSize() {
    throw new Error('MapEngineAdapter.invalidateSize() is not implemented');
  }

  /**
   * Return the current engine-neutral map view state.
   * @returns {*} Method result.
   */
  getViewState() {
    throw new Error('MapEngineAdapter.getViewState() is not implemented');
  }

  /**
   * Return supported application or map-engine capabilities.
   * @returns {*} Method result.
   */
  getCapabilities() {
    return {};
  }

  /**
   * Release resources, handlers, requests, layers, and host integrations.
   * @returns {Promise<*>} Resolves when the operation completes.
   */
  async destroy() {}
}
