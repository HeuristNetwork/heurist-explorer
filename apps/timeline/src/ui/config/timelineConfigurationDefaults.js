/**
 * @file timelineConfigurationDefaults.js
 * @brief Canonical persisted heurist-timeline configuration defaults (plan 29).
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

/** Maximum zoom out: 500 000 years in milliseconds. */
export const TIMELINE_ZOOM_MAX = 31536000000 * 500000;

export const HEURIST_TIMELINE_OPTIONS_DEFAULTS = Object.freeze({
  ui: Object.freeze({
    initiallyExpanded: false,
    showSourceHeader: false,
    showOptions: true,
    showPublish: true,
    showHelp: true,
    language: "auto",
  }),
  timeline: Object.freeze({
    labelMode: "full",
    labelPosition: "bar",
    orientation: "both",
    stack: true,
    showToolbar: true,
    zoomMax: TIMELINE_ZOOM_MAX,
  }),
  mapDocuments: Object.freeze({
    allowed: null,
    initiallyActive: "dynamic",
  }),
  interaction: Object.freeze({
    // Edit of map documents and layers (as in the other modules, plan 29)
    editEnabled: true,
  }),
});

// the timeline has no content defaults yet; kept for the common {options, config} envelope
export const HEURIST_TIMELINE_CONFIG_DEFAULTS = Object.freeze({});

/**
 * Build a fresh, mutable copy of the canonical default settings.
 *
 * @returns {{options: object, config: object}}
 */
export function createTimelineConfigurationDefaults() {
  return {
    options: clone(HEURIST_TIMELINE_OPTIONS_DEFAULTS),
    config: clone(HEURIST_TIMELINE_CONFIG_DEFAULTS),
  };
}

/** Deep-clone a JSON-safe value. */
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
