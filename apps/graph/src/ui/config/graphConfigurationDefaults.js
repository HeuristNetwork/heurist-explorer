/**
 * @file graphConfigurationDefaults.js
 * @brief Canonical persisted heurist-graph configuration defaults.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-graph
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */
export const HEURIST_GRAPH_OPTIONS_DEFAULTS = Object.freeze({
  ui: Object.freeze({
    initiallyExpanded: true,
    showSourceHeader: true,
    showOptions: true,
    showExpand: true,
    language: "auto",
  }),
  nativeControls: Object.freeze({
    zoom: true,
    pan: true,
    rearrange: true,
  }),
  interaction: Object.freeze({
    readonly: false,
    editEnabled: true,
    selectionEnabled: true,
    popupEnabled: true,
  }),
});

export const HEURIST_GRAPH_CONFIG_DEFAULTS = Object.freeze({
  // heurist-graph (vis-network) appearance and limit defaults.
  defaults: Object.freeze({
    emptyResultMessage: "No records",
    maxNodes: 5000,
    maxEdges: 10000,
    gravity: "normal",
    layoutMode: "automatic",
    movement: "once",
    scaling: true,
    showNodeLabels: true,
    showEdgeLabels: false,
    labelLength: 40,
    popupDelay: 1,
    popupTemplate: null,
  }),
});

/**
 * Build a fresh, mutable copy of the canonical default settings.
 *
 * @returns {{options: object, config: object}}
 */
export function createGraphConfigurationDefaults() {
  return {
    options: clone(HEURIST_GRAPH_OPTIONS_DEFAULTS),
    config: clone(HEURIST_GRAPH_CONFIG_DEFAULTS),
  };
}

/** Deep-clone a JSON-safe value. */
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
