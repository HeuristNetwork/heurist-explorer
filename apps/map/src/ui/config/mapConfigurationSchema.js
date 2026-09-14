/**
 * mapConfigurationSchema.js - Allowlist, normalization, and serialization for user map settings
 *
 * Only safe, persisted presentation values belong here. Runtime connection
 * values (database, API URL, access token, request headers, callbacks, etc.)
 * are intentionally discarded.
 *
 * @project     Heurist mapping application
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 */

import { createMapConfigurationDefaults } from './mapConfigurationDefaults.js';
import {
  CONFIGURATION_MODES,
  allowedFeatureLimit,
  boolean,
  boundedNumber,
  enumValue,
  normalizeBounds,
  nullableIdentifier,
  nullableJsonObject,
  nullableList,
  nullablePositiveNumber,
  nullableString,
  nullableZoom,
  serializeConfigurationSettings,
  stringValue,
  unwrapSettings
} from './configurationUtils.js';

/**
 * Normalize and allowlist a pair of persisted map configuration objects.
 * Unknown properties are intentionally removed.
 */
export function normalizeMapConfigurationSettings(value = {}) {
  const defaults = createMapConfigurationDefaults();
  const source = unwrapSettings(value);
  const options = source.options || {};
  const config = source.config || {};

  return {
    options: normalizeOptions(options, defaults.options),
    config: normalizeConfig(config, defaults.config)
  };
}

/** Produce the versioned JSON-safe settings envelope. */
export function serializeMapConfigurationSettings(value = {}) {
  return serializeConfigurationSettings(value, normalizeMapConfigurationSettings);
}

/** Validate/normalize a dialog mode. */
export function normalizeMapConfigurationMode(value) {
  const mode = String(value || 'preferences').toLowerCase();
  return CONFIGURATION_MODES.includes(mode) ? mode : 'preferences';
}

function normalizeOptions(source, defaults) {
  const ui = source.ui || {};
  const documents = source.mapDocuments || {};
  const nativeControls = source.nativeControls || {};
  const baseMaps = source.baseMaps || {};
  const interaction = source.interaction || {};

  return {
    ui: {
      enabled: boolean(ui.enabled, defaults.ui.enabled),
      placement: enumValue(ui.placement, ['overlay', 'side'], defaults.ui.placement),
      position: enumValue(ui.position, ['top-left', 'top-right', 'bottom-left', 'bottom-right'], defaults.ui.position),
      initiallyExpanded: boolean(ui.initiallyExpanded, defaults.ui.initiallyExpanded),
      showCurrentDocument: boolean(ui.showCurrentDocument, defaults.ui.showCurrentDocument),
      showMapDocuments: boolean(ui.showMapDocuments, defaults.ui.showMapDocuments),
      showLayers: boolean(ui.showLayers, defaults.ui.showLayers),
      showBaseMaps: boolean(ui.showBaseMaps, defaults.ui.showBaseMaps),
      showLegend: boolean(ui.showLegend, defaults.ui.showLegend),
      showHomeControl: boolean(ui.showHomeControl, defaults.ui.showHomeControl),
      showOptions: boolean(ui.showOptions, defaults.ui.showOptions),
      showPublish: boolean(ui.showPublish, defaults.ui.showPublish),
      showSourceHeader: boolean(ui.showSourceHeader, defaults.ui.showSourceHeader),
      controlCss: nullableString(ui.controlCss)
    },
    nativeControls: {
      // showZoomControl/showSearch were stored under ui in the first configuration draft.
      zoom: boolean(nativeControls.zoom, boolean(ui.showZoomControl, defaults.nativeControls.zoom)),
      scale: boolean(nativeControls.scale, defaults.nativeControls.scale),
      bookmark: boolean(nativeControls.bookmark, defaults.nativeControls.bookmark),
      print: boolean(nativeControls.print, defaults.nativeControls.print),
      selector: false, // reserved for the later Leaflet.draw selection tool
      search: boolean(nativeControls.search, boolean(ui.showSearch, defaults.nativeControls.search))
    },
    mapDocuments: {
      allowed: nullableList(documents.allowed, { numeric: true }),
      initiallyActive: documents.initiallyActive === undefined
        ? defaults.mapDocuments.initiallyActive
        : nullableIdentifier(documents.initiallyActive, { numeric: true, allowDynamic: true })
    },
    baseMaps: {
      allowed: nullableList(baseMaps.allowed),
      initial: nullableIdentifier(baseMaps.initial)
    },
    interaction: {
      readonly: boolean(interaction.readonly, defaults.interaction.readonly),
      selectionEnabled: boolean(interaction.selectionEnabled, defaults.interaction.selectionEnabled),
      popupEnabled: boolean(interaction.popupEnabled, defaults.interaction.popupEnabled),
      zoomOnSelection: boolean(interaction.zoomOnSelection, defaults.interaction.zoomOnSelection)
    }
  };
}

function normalizeConfig(source, defaults) {
  const configuredDefaults = source.defaults || {};
  const document = source.dynamicDocument || {};

  return {
    defaults: {
      zoomToPointInKM: nullablePositiveNumber(configuredDefaults.zoomToPointInKM),
      symbology: nullableJsonObject(configuredDefaults.symbology),
      selectSymbology: nullableJsonObject(configuredDefaults.selectSymbology),
      preventContinuousWorldBasemap: boolean(
        configuredDefaults.preventContinuousWorldBasemap,
        defaults.defaults.preventContinuousWorldBasemap
      ),
      markerClustering: boolean(configuredDefaults.markerClustering, defaults.defaults.markerClustering),
      markerClusterGridPixels: boundedNumber(configuredDefaults.markerClusterGridPixels, defaults.defaults.markerClusterGridPixels, 0, 100),
      markerClusterMaxLevel: boundedNumber(configuredDefaults.markerClusterMaxLevel, defaults.defaults.markerClusterMaxLevel, 1, 18),
      maxAllowedFeatures: allowedFeatureLimit(
        configuredDefaults.maxAllowedFeatures,
        defaults.defaults.maxAllowedFeatures
      ),
      popupTemplate: nullableString(configuredDefaults.popupTemplate)
    },
    dynamicDocument: {
      enabled: boolean(document.enabled, defaults.dynamicDocument.enabled),
      title: stringValue(document.title, defaults.dynamicDocument.title),
      minZoom: nullableZoom(document.minZoom),
      maxZoom: nullableZoom(document.maxZoom),
      minimumZoomKm: nullablePositiveNumber(document.minimumZoomKm),
      maximumZoomKm: nullablePositiveNumber(document.maximumZoomKm),
      bounds: normalizeBounds(document.bounds),
      // Migrate the former global default into the Filtered Result Map setting.
      dynamicRequests: boolean(
        document.dynamicRequests,
        boolean(configuredDefaults.dynamicRequests, defaults.dynamicDocument.dynamicRequests)
      )
    }
  };
}
