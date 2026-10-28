/**
 * @file timelineConfigurationSchema.js
 * @brief Allowlist, normalization, and serialization for heurist-timeline settings (plan 29).
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-timeline
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */
import { createTimelineConfigurationDefaults } from "./timelineConfigurationDefaults.js";
import {
  CONFIGURATION_MODES,
  boolean,
  boundedNumber,
  enumValue,
  nullableIdentifier,
  nullableList,
  serializeConfigurationSettings,
  unwrapSettings,
} from "./configurationUtils.js";

const LABEL_MODES = ["full", "truncate", "hidden"];
const LABEL_POSITIONS = ["bar", "above"];
const ORIENTATIONS = ["both", "top", "bottom"];
const LANGUAGES = ["auto", "eng", "fre", "ger", "por"];

/**
 * Normalize a raw persisted-settings value against the canonical defaults. Settings
 * saved before the envelope (the timeline options at the top level) are read too.
 *
 * @param {object} [value] Raw settings value (or an envelope wrapping one).
 * @returns {{options: object, config: object}} Fully normalized settings.
 */
export function normalizeTimelineConfigurationSettings(value = {}) {
  const defaults = createTimelineConfigurationDefaults();
  const source = unwrapSettings(value);
  const options = unwrapSettings(source.options);
  // early timeline settings: {labelMode, stack, ...} without options.timeline
  const timeline = unwrapSettings(options.timeline ?? (source.options ? {} : source));
  return {
    options: {
      ui: normalizeUi(unwrapSettings(options.ui ?? source.ui), defaults.options.ui),
      timeline: normalizeTimeline(timeline, defaults.options.timeline),
      mapDocuments: {
        allowed: nullableList(options.mapDocuments?.allowed, { numeric: true }),
        initiallyActive: nullableIdentifier(options.mapDocuments?.initiallyActive, { allowDynamic: true })
          ?? defaults.options.mapDocuments.initiallyActive,
      },
      interaction: {
        editEnabled: boolean(options.interaction?.editEnabled, defaults.options.interaction.editEnabled),
      },
    },
    config: {},
  };
}

/**
 * Produce the versioned, JSON-safe settings envelope for persistence.
 *
 * @param {object} [value] Raw settings value to normalize and wrap.
 * @returns {object} Serializable settings envelope; see `serializeConfigurationSettings`.
 */
export function serializeTimelineConfigurationSettings(value = {}) {
  return serializeConfigurationSettings(value, normalizeTimelineConfigurationSettings);
}

/**
 * Normalize a configuration-dialog mode to one of `CONFIGURATION_MODES`.
 *
 * @param {string} value Raw mode value.
 * @returns {string} Normalized mode; defaults to `'preferences'`.
 */
export function normalizeTimelineConfigurationMode(value) {
  const mode = String(value || "preferences").toLowerCase();
  return CONFIGURATION_MODES.includes(mode) ? mode : "preferences";
}

/** Normalize `options.ui` (control panel icons, header, language). */
function normalizeUi(ui, defaults) {
  return {
    initiallyExpanded: boolean(ui.initiallyExpanded, defaults.initiallyExpanded),
    showSourceHeader: boolean(ui.showSourceHeader, defaults.showSourceHeader),
    showOptions: boolean(ui.showOptions, defaults.showOptions),
    showPublish: boolean(ui.showPublish, defaults.showPublish),
    showHelp: boolean(ui.showHelp, defaults.showHelp),
    language: enumValue(ui.language, LANGUAGES, defaults.language),
  };
}

/** Normalize `options.timeline` (labels, axis, stacking, zoom). */
function normalizeTimeline(timeline, defaults) {
  return {
    labelMode: enumValue(timeline.labelMode, LABEL_MODES, defaults.labelMode),
    labelPosition: enumValue(timeline.labelPosition, LABEL_POSITIONS, defaults.labelPosition),
    orientation: enumValue(timeline.orientation, ORIENTATIONS, defaults.orientation),
    stack: boolean(timeline.stack, defaults.stack),
    showToolbar: boolean(timeline.showToolbar, defaults.showToolbar),
    zoomMax: Number(timeline.zoomMax) > 0 ? boundedNumber(timeline.zoomMax, defaults.zoomMax, 1, defaults.zoomMax) : defaults.zoomMax,
  };
}
