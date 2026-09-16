/**
 * @file recordViewConfigurationDefaults.js
 * @brief Canonical persisted heurist-recordview configuration defaults.
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
export const HEURIST_RECORDVIEW_OPTIONS_DEFAULTS = Object.freeze({
  ui: Object.freeze({
    showOptions: true,
    showPublish: true,
    language: "auto",
  }),
  interaction: Object.freeze({
    readonly: false,
  }),
});

export const HEURIST_RECORDVIEW_CONFIG_DEFAULTS = Object.freeze({
  defaults: Object.freeze({
    engine: "builtin",
    template: null,
    selectionMode: "last",
    showHeader: true,
    headerTitle: null,
    emptyMessage: "Select a record",
  }),
});

/**
 * Build a fresh, mutable copy of the canonical default settings.
 *
 * @returns {{options: object, config: object}}
 */
export function createRecordViewConfigurationDefaults() {
  return {
    options: clone(HEURIST_RECORDVIEW_OPTIONS_DEFAULTS),
    config: clone(HEURIST_RECORDVIEW_CONFIG_DEFAULTS),
  };
}

/** Deep-clone a JSON-safe value. */
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
