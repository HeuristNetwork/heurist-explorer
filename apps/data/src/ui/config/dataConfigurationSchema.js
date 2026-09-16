/**
 * @file dataConfigurationSchema.js
 * @brief Allowlist, normalization, and serialization for settings.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-data
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */
import { createDataConfigurationDefaults } from "./dataConfigurationDefaults.js";
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

/**
 * Normalize a raw persisted-settings value against the canonical defaults.
 *
 * @param {object} [value] Raw settings value (or an envelope wrapping one).
 * @returns {{options: object, config: object}} Fully normalized settings.
 */
export function normalizeDataConfigurationSettings(value = {}) {
  const defaults = createDataConfigurationDefaults();
  const source = unwrapSettings(value);
  return {
    options: normalizeOptions(source.options || {}, defaults.options),
    config: normalizeConfig(source.config || {}, defaults.config),
  };
}

/**
 * Produce the versioned, JSON-safe settings envelope for persistence.
 *
 * @param {object} [value] Raw settings value to normalize and wrap.
 * @returns {object} Serializable settings envelope; see `serializeConfigurationSettings`.
 */
export function serializeDataConfigurationSettings(value = {}) {
  return serializeConfigurationSettings(
    value,
    normalizeDataConfigurationSettings,
  );
}

/**
 * Normalize a configuration-dialog mode to one of `CONFIGURATION_MODES`.
 *
 * @param {string} value Raw mode value.
 * @returns {string} Normalized mode; defaults to `'preferences'`.
 */
export function normalizeDataConfigurationMode(value) {
  const mode = String(value || "preferences").toLowerCase();
  return CONFIGURATION_MODES.includes(mode) ? mode : "preferences";
}

/**
 * Normalize the `options` half of the settings envelope (UI/controls/query sources/filters/interaction).
 *
 * @param {object} source Raw options value.
 * @param {object} defaults Default options to fall back to.
 * @returns {object} Normalized options.
 */
function normalizeOptions(source, defaults) {
  const ui = source.ui || {};
  const controls = source.nativeControls || {};
  const querySources = source.querySources || {};
  const filters = source.filters || {};
  const interaction = source.interaction || {};
  return {
    ui: {
      showCurrentResults: boolean(
        ui.showCurrentResults,
        defaults.ui.showCurrentResults,
      ),
      showQuerySources: boolean(ui.showQuerySources, defaults.ui.showQuerySources),
      showFilters: boolean(ui.showFilters, defaults.ui.showFilters),
      initiallyExpanded: boolean(
        ui.initiallyExpanded,
        defaults.ui.initiallyExpanded,
      ),
      showSourceHeader: boolean(
        ui.showSourceHeader,
        defaults.ui.showSourceHeader,
      ),
      showColumnPicker: boolean(
        ui.showColumnPicker,
        defaults.ui.showColumnPicker,
      ),
      showOptions: boolean(ui.showOptions, defaults.ui.showOptions),
      showPublish: boolean(ui.showPublish, defaults.ui.showPublish),
      language: enumValue(
        ui.language,
        ["auto", "eng", "fre", "ger", "por"],
        defaults.ui.language,
      ),
    },
    nativeControls: {
      pageSize: boolean(controls.pageSize, defaults.nativeControls.pageSize),
      search: boolean(controls.search, defaults.nativeControls.search),
      counter: boolean(controls.counter, defaults.nativeControls.counter),
      export: boolean(controls.export, defaults.nativeControls.export),
      viewMode: boolean(controls.viewMode, defaults.nativeControls.viewMode),
      selectionActions: boolean(
        controls.selectionActions,
        defaults.nativeControls.selectionActions,
      ),
    },
    querySources: {
      allowAll: boolean(querySources.allowAll, defaults.querySources.allowAll),
      allowed: nullableList(querySources.allowed),
      initiallyActive: nullableIdentifier(querySources.initiallyActive),
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
      persistentSelectionEnabled: boolean(
        interaction.persistentSelectionEnabled,
        defaults.interaction.persistentSelectionEnabled,
      ),
      popupEnabled: boolean(
        interaction.popupEnabled,
        defaults.interaction.popupEnabled,
      ),
      adminInfoEnabled: boolean(
        interaction.adminInfoEnabled,
        defaults.interaction.adminInfoEnabled,
      ),
    },
  };
}

/**
 * Normalize the `config` half of the settings envelope (defaults/currentResults), migrating legacy fields.
 *
 * @param {object} source Raw config value.
 * @param {object} defaults Default config to fall back to.
 * @returns {object} Normalized config.
 */
function normalizeConfig(source, defaults) {
  const configured = source.defaults || {};
  const legacyTemplate = nullableString(configured.popupTemplate);
  const migratedTemplate =
    legacyTemplate && legacyTemplate !== "standard" ? legacyTemplate : null;
  const current = source.currentResults || {};
  const filterBy = current.filterBy || {};
  // View mode is the single source of truth for the rendering engine. The
  // separate "engine" setting is retained only so legacy configs that selected
  // the DataTables renderer via `engine: "datatables"` migrate to the "datatable"
  // view mode instead of silently flipping to the record list.
  const storedEngine = enumValue(
    configured.engine,
    ["datatables", "recordlist"],
    null,
  );
  const storedViewMode = enumValue(
    configured.viewMode,
    ["list", "card", "row", "big", "datatable"],
    null,
  );
  // An explicit viewMode always wins. `engine` is consulted only for legacy
  // configurations which predate viewMode as the engine selector. Otherwise
  // a stale engine:"datatables" value would force every newly selected List /
  // Cards / Rows / Extended mode straight back to Table on Apply.
  const viewMode = storedViewMode
    ? storedViewMode
    : storedEngine === "datatables"
      ? "datatable"
      : defaults.defaults.viewMode;
  const engine = viewMode === "datatable" ? "datatables" : "recordlist";
  return {
    defaults: {
      engine,
      viewMode,
      pageSize: enumValue(
        Number(configured.pageSize),
        [50, 100, 500, 1000, 5000],
        defaults.defaults.pageSize,
      ),
      fontSize: boundedNumber(
        configured.fontSize,
        defaults.defaults.fontSize,
        8,
        30,
      ),
      colorScheme: stringValue(
        configured.colorScheme,
        defaults.defaults.colorScheme,
      ),
      emptyResultMessage: stringValue(
        configured.emptyResultMessage,
        defaults.defaults.emptyResultMessage,
      ),
      cardTemplate:
        nullableString(configured.cardTemplate) ||
        migratedTemplate ||
        defaults.defaults.cardTemplate,
      viewTemplate:
        nullableString(configured.viewTemplate) ||
        migratedTemplate ||
        defaults.defaults.viewTemplate,
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
