/**
 * @file simplifiedDataSettings.js
 * @brief heurist-explorer's simplified interface ("Interface for dummies (v7 like)",
 *        runtime `simplifiedUI`): the fixed Data settings. The configuration dialog
 *        hides the sections they replace.
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

/**
 * Apply the simplified interface's settings (Artem, 2026-10-14) over normalized
 * settings: header, Options and Expansion shown; no page size or search in results;
 * counter, export, view mode and selection actions on; Built-in extended view and
 * popup; every interaction on. Admin info keeps its value (See/hide owners switches
 * it) and is on by default.
 *
 * @param {{options: object, config: object}} settings Normalized Data settings.
 * @param {{adminInfoSaved?: boolean}} [options] `adminInfoSaved`: whether the saved
 *        settings carry an admin-info value (otherwise it is switched on).
 * @returns {{options: object, config: object}} A new settings object.
 */
export function applySimplifiedDataSettings(settings, { adminInfoSaved = false } = {}) {
  const value = JSON.parse(JSON.stringify(settings || {}));
  value.options ||= {};
  value.config ||= {};
  value.options.ui = { ...(value.options.ui || {}), showSourceHeader: true, showOptions: true, showExpansion: true };
  value.options.nativeControls = {
    ...(value.options.nativeControls || {}),
    pageSize: false, search: false, counter: true, export: true, viewMode: true, sort: true, showOwner: true,
    selectionActions: true
  };
  const interaction = value.options.interaction || {};
  value.options.interaction = {
    ...interaction,
    editEnabled: true,
    selectionEnabled: true,
    persistentSelectionEnabled: true,
    popupEnabled: true,
    adminInfoEnabled: adminInfoSaved ? interaction.adminInfoEnabled === true : true
  };
  value.config.defaults = { ...(value.config.defaults || {}), viewTemplate: null, popupTemplate: null };
  return value;
}

/**
 * Whether raw (not normalized) settings carry an admin-info value.
 *
 * @param {object|null} settings Raw saved settings.
 * @returns {boolean}
 */
export function hasAdminInfoSetting(settings) {
  return typeof settings?.options?.interaction?.adminInfoEnabled === "boolean";
}
