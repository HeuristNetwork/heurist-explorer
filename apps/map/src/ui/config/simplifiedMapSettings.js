/**
 * @file simplifiedMapSettings.js
 * @brief heurist-explorer's simplified interface ("Interface for dummies (v7 like)",
 *        runtime `simplifiedUI`): the fixed Map settings. The configuration dialog
 *        hides the controls they replace.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-map
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

/** Title of the dynamic map document in the simplified interface. */
export const SIMPLIFIED_DYNAMIC_TITLE = 'Current results';

/**
 * Apply the simplified interface's settings (Artem, 2026-10-14) over normalized
 * settings: no header, control panel collapsed at start, the dynamic document is
 * "Current results" and is not loaded by map extent.
 *
 * @param {{options: object, config: object}} settings Normalized Map settings.
 * @returns {{options: object, config: object}} The same object, changed.
 */
export function applySimplifiedMapSettings(settings) {
  settings.options.ui = { ...settings.options.ui, showSourceHeader: false, initiallyExpanded: false };
  settings.config.dynamicDocument = {
    ...settings.config.dynamicDocument,
    title: SIMPLIFIED_DYNAMIC_TITLE,
    dynamicRequests: false
  };
  return settings;
}
