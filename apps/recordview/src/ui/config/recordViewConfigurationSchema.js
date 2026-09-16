/**
 * @file recordViewConfigurationSchema.js
 * @brief Allowlist, normalization, and serialization for settings.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-recordview
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */
import { createRecordViewConfigurationDefaults } from "./recordViewConfigurationDefaults.js";
import {
  CONFIGURATION_MODES,
  boolean,
  enumValue,
  nullableString,
  serializeConfigurationSettings,
  stringValue,
  unwrapSettings,
} from "./configurationUtils.js";

const ENGINES = ["builtin", "legacy", "smarty"];
const SELECTION_MODES = ["first", "last", "single-only"];
const LANGUAGES = ["auto", "eng", "fre", "ger", "por"];

/**
 * Normalize a raw persisted-settings value against the canonical defaults.
 *
 * @param {object} [value] Raw settings value (or an envelope wrapping one).
 * @returns {{options: object, config: object}} Fully normalized settings.
 */
export function normalizeRecordViewConfigurationSettings(value = {}) {
  const defaults = createRecordViewConfigurationDefaults();
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
export function serializeRecordViewConfigurationSettings(value = {}) {
  return serializeConfigurationSettings(
    value,
    normalizeRecordViewConfigurationSettings,
  );
}

/**
 * Normalize a configuration-dialog mode to one of `CONFIGURATION_MODES`.
 *
 * @param {string} value Raw mode value.
 * @returns {string} Normalized mode; defaults to `'preferences'`.
 */
export function normalizeRecordViewConfigurationMode(value) {
  const mode = String(value || "preferences").toLowerCase();
  return CONFIGURATION_MODES.includes(mode) ? mode : "preferences";
}

/** Normalize the `options` half of the settings envelope (UI/interaction). */
function normalizeOptions(source, defaults) {
  const ui = source.ui || {};
  const interaction = source.interaction || {};
  return {
    ui: {
      showOptions: boolean(ui.showOptions, defaults.ui.showOptions),
      showPublish: boolean(ui.showPublish, defaults.ui.showPublish),
      language: enumValue(ui.language, LANGUAGES, defaults.ui.language),
    },
    interaction: {
      readonly: boolean(interaction.readonly, defaults.interaction.readonly),
    },
  };
}

/** Normalize the `config` half of the settings envelope (render engine, selection policy, header/empty text). */
function normalizeConfig(source, defaults) {
  const configured = source.defaults || {};
  return {
    defaults: {
      engine: enumValue(configured.engine, ENGINES, defaults.defaults.engine),
      template: nullableString(configured.template),
      selectionMode: enumValue(
        configured.selectionMode,
        SELECTION_MODES,
        defaults.defaults.selectionMode,
      ),
      showHeader: boolean(configured.showHeader, defaults.defaults.showHeader),
      headerTitle: nullableString(configured.headerTitle),
      emptyMessage: stringValue(
        configured.emptyMessage,
        defaults.defaults.emptyMessage,
      ),
    },
  };
}
