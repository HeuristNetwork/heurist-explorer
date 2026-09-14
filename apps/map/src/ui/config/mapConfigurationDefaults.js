/**
 * mapConfigurationDefaults.js - Canonical persisted map configuration defaults
 *
 * @project     Heurist mapping application
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
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

/** Return independent mutable defaults for editing. */
export function createMapConfigurationDefaults() {
  return {
    options: clone(HEURIST_MAP_OPTIONS_DEFAULTS),
    config: clone(HEURIST_MAP_CONFIG_DEFAULTS)
  };
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}
