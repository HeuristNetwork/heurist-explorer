/**
 * @file graphConfigurationSchema.js
 * @brief Allowlist, normalization, and serialization for settings.
 * @project     Heurist academic knowledge management system
 * @package     heurist-graph
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */
import { createGraphConfigurationDefaults } from "./graphConfigurationDefaults.js";
import {
  CONFIGURATION_MODES,
  boolean,
  boundedNumber,
  enumValue,
  nullableIdentifier,
  nullableList,
  nullableString,
  serializeConfigurationSettings,
  stringValue,
  unwrapSettings,
} from "./configurationUtils.js";

export function normalizeGraphConfigurationSettings(value = {}) {
  const defaults = createGraphConfigurationDefaults();
  const source = unwrapSettings(value);
  return {
    options: normalizeOptions(source.options || {}, defaults.options),
    config: normalizeConfig(source.config || {}, defaults.config),
  };
}
export function serializeGraphConfigurationSettings(value = {}) {
  return serializeConfigurationSettings(
    value,
    normalizeGraphConfigurationSettings,
  );
}
export function normalizeGraphConfigurationMode(value) {
  const mode = String(value || "preferences").toLowerCase();
  return CONFIGURATION_MODES.includes(mode) ? mode : "preferences";
}

function normalizeOptions(source, defaults) {
  const ui = source.ui || {};
  const controls = source.nativeControls || {};
  const datasets = source.datasets || {};
  const filters = source.filters || {};
  const interaction = source.interaction || {};
  return {
    ui: {
      showCurrentResults: boolean(
        ui.showCurrentResults,
        defaults.ui.showCurrentResults,
      ),
      showDatasets: boolean(ui.showDatasets, defaults.ui.showDatasets),
      showFilters: boolean(ui.showFilters, defaults.ui.showFilters),
      initiallyExpanded: boolean(
        ui.initiallyExpanded,
        defaults.ui.initiallyExpanded,
      ),
      showSourceHeader: boolean(
        ui.showSourceHeader,
        defaults.ui.showSourceHeader,
      ),
      showOptions: boolean(ui.showOptions, defaults.ui.showOptions),
      showPublish: boolean(ui.showPublish, defaults.ui.showPublish),
      showExpand: boolean(ui.showExpand, defaults.ui.showExpand),
      language: enumValue(
        ui.language,
        ["auto", "eng", "fre", "ger", "por"],
        defaults.ui.language,
      ),
    },
    nativeControls: {
      zoom: boolean(controls.zoom, defaults.nativeControls.zoom),
      pan: boolean(controls.pan, defaults.nativeControls.pan),
      rearrange: boolean(controls.rearrange, defaults.nativeControls.rearrange),
    },
    datasets: {
      allowAll: boolean(datasets.allowAll, defaults.datasets.allowAll),
      allowed: nullableList(datasets.allowed),
      initiallyActive: nullableIdentifier(datasets.initiallyActive),
    },
    filters: {
      allowAll: boolean(filters.allowAll, defaults.filters.allowAll),
      allowed: nullableList(filters.allowed),
    },
    interaction: {
      readonly: boolean(interaction.readonly, defaults.interaction.readonly),
      editEnabled: boolean(
        interaction.editEnabled,
        defaults.interaction.editEnabled,
      ),
      selectionEnabled: boolean(
        interaction.selectionEnabled,
        defaults.interaction.selectionEnabled,
      ),
      popupEnabled: boolean(
        interaction.popupEnabled,
        defaults.interaction.popupEnabled,
      ),
    },
  };
}

function normalizeConfig(source, defaults) {
  const configured = source.defaults || {};
  // A legacy `popupTemplate` of "standard" (or empty) means the built-in
  // vis-native popup; any other value is a Heurist report-template name.
  const legacyTemplate = nullableString(configured.popupTemplate);
  const migratedTemplate =
    legacyTemplate && legacyTemplate !== "standard" ? legacyTemplate : null;
  const current = source.currentResults || {};
  const filterBy = current.filterBy || {};
  return {
    defaults: {
      emptyResultMessage: stringValue(
        configured.emptyResultMessage,
        defaults.defaults.emptyResultMessage,
      ),
      maxNodes: enumValue(Number(configured.maxNodes), [1000, 5000, 10000], defaults.defaults.maxNodes),
      maxEdges: enumValue(Number(configured.maxEdges), [1000, 5000, 10000], defaults.defaults.maxEdges),
      gravity: enumValue(
        configured.gravity,
        ["loose", "normal", "tight"],
        defaults.defaults.gravity,
      ),
      layoutMode: enumValue(configured.layoutMode, ["automatic", "hierarchical-ud", "hierarchical-lr", "forceAtlas2", "record-types", "grid"], defaults.defaults.layoutMode),
      movement: enumValue(configured.movement, ["continuous", "once"], configured.gravity === "off" ? "once" : defaults.defaults.movement),
      scaling: boolean(configured.scaling, defaults.defaults.scaling),
      showNodeLabels: boolean(configured.showNodeLabels, defaults.defaults.showNodeLabels),
      showEdgeLabels: boolean(configured.showEdgeLabels, defaults.defaults.showEdgeLabels),
      labelLength: boundedNumber(
        configured.labelLength,
        defaults.defaults.labelLength,
        20,
        100,
      ),
      popupDelay: boundedNumber(
        configured.popupDelay,
        defaults.defaults.popupDelay,
        1,
        5,
      ),
      // heurist-graph's node popup reads this directly: a Heurist report
      // template name, or null for the built-in vis-native popup.
      popupTemplate: migratedTemplate,
    },
    currentResults: {
      enabled: boolean(current.enabled, defaults.currentResults.enabled),
      title: stringValue(current.title, defaults.currentResults.title),
      initialQuery: nullableString(current.initialQuery),
      filterBy: {
        mode: enumValue(
          filterBy.mode,
          ["none", "timefilter", "selection", "lastSelected"],
          "none",
        ),
        widgetId: nullableString(filterBy.widgetId),
      },
    },
  };
}
