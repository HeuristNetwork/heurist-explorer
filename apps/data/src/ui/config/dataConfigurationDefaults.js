/**
 * @file dataConfigurationDefaults.js
 * @brief Canonical persisted heurist-data configuration defaults.
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
export const HEURIST_DATA_OPTIONS_DEFAULTS = Object.freeze({
  ui: Object.freeze({
    initiallyExpanded: true,
    showSourceHeader: false,
    showOptions: true,
    language: "auto",
  }),
  nativeControls: Object.freeze({
    pageSize: true,
    search: true,
    counter: true,
    export: true,
    viewMode: true,
    selectionActions: true,
  }),
  interaction: Object.freeze({
    readonly: false,
    editEnabled: true,
    selectionEnabled: true,
    persistentSelectionEnabled: false,
    popupEnabled: true,
    adminInfoEnabled: false,
  }),
});

export const HEURIST_DATA_CONFIG_DEFAULTS = Object.freeze({
  defaults: Object.freeze({
    engine: "recordlist",
    viewMode: "card",
    pageSize: 100,
    fontSize: 14,
    colorScheme: "default",
    emptyResultMessage: "No records",
    cardTemplate: null,
    viewTemplate: null,
  }),
});

/**
 * Build a fresh, mutable copy of the canonical default settings.
 *
 * @returns {{options: object, config: object}}
 */
export function createDataConfigurationDefaults() {
  return {
    options: clone(HEURIST_DATA_OPTIONS_DEFAULTS),
    config: clone(HEURIST_DATA_CONFIG_DEFAULTS),
  };
}

/** Deep-clone a JSON-safe value. */
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
