/**
 * @file mapConfigurationDefaults.js
 * @brief Canonical persisted map configuration defaults.
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

/** Public, user-configurable viewer defaults. */
export const HEURIST_MAP_OPTIONS_DEFAULTS = Object.freeze({
  ui: Object.freeze({
    enabled: true,
    placement: 'overlay',
    position: 'top-right',
    initiallyExpanded: true,
    showCurrentDocument: true,
    showMapDocuments: true,
    showLayers: true,
    showBaseMaps: true,
    showLegend: true,
    showHomeControl: false,
    showOptions: true,
    showPublish: true,
    showSourceHeader: false,
    controlCss: null
  }),
  nativeControls: Object.freeze({
    zoom: true,
    scale: true,
    bookmark: false,
    print: false,
    selector: false,
    search: false
  }),
  mapDocuments: Object.freeze({
    allowed: null,
    initiallyActive: null
  }),
  baseMaps: Object.freeze({
    allowed: null,
    initial: null
  }),
  interaction: Object.freeze({
    readonly: false,
    selectionEnabled: true,
    popupEnabled: true,
    zoomOnSelection: false
  })
});

/** Public defaults shared by MapDocuments/MapLayers when they omit a value. */
export const HEURIST_MAP_CONFIG_DEFAULTS = Object.freeze({
  defaults: Object.freeze({
    zoomToPointInKM: null,
    symbology: null,
    selectSymbology: null,
    preventContinuousWorldBasemap: false,
    markerClustering: false,
    markerClusterGridPixels: 20,
    markerClusterMaxLevel: 12,
    maxAllowedFeatures: 1000,
    popupTemplate: null
  }),
  dynamicDocument: Object.freeze({
    enabled: true,
    title: 'Filtered Result',
    minZoom: null,
    maxZoom: null,
    minimumZoomKm: null,
    maximumZoomKm: null,
    bounds: null,
    dynamicRequests: false
  })
});

/**
 * Return independent mutable defaults for editing.
 *
 * @returns {{options: object, config: object}} Deep-cloned default options and config.
 */
export function createMapConfigurationDefaults() {
  return {
    options: clone(HEURIST_MAP_OPTIONS_DEFAULTS),
    config: clone(HEURIST_MAP_CONFIG_DEFAULTS)
  };
}

/**
 * Deep-clone a value via JSON round-trip.
 *
 * @param {*} value Candidate value.
 * @returns {*} The cloned value, or `value` itself when nullish.
 */
function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}
