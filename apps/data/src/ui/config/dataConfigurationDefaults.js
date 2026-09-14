/**
 * @file dataConfigurationDefaults.js
 * @brief Canonical persisted heurist-data configuration defaults.
 * @project     Heurist academic knowledge management system
 * @package     heurist-data
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */
export const HEURIST_DATA_OPTIONS_DEFAULTS = Object.freeze({
  ui: Object.freeze({
    showCurrentResults: true,
    showDatasets: true,
    showFilters: true,
    initiallyExpanded: true,
    showSourceHeader: false,
    showColumnPicker: true,
    showOptions: true,
    showPublish: true,
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
  datasets: Object.freeze({
    allowed: null,
    allowAll: true,
    initiallyActive: null,
  }),
  filters: Object.freeze({ allowed: null, allowAll: true }),
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
  currentResults: Object.freeze({
    enabled: true,
    title: "Filtered Result",
    initialQuery: null,
    filterBy: Object.freeze({ mode: "none", widgetId: null }),
  }),
});

export function createDataConfigurationDefaults() {
  return {
    options: clone(HEURIST_DATA_OPTIONS_DEFAULTS),
    config: clone(HEURIST_DATA_CONFIG_DEFAULTS),
  };
}
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
