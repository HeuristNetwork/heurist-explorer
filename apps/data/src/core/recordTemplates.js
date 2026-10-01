/**
 * @file recordTemplates.js
 * @brief Template choices of the Data module's record popup and Extended view.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-data
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { normalizePopupMode } from "#shared/recordview/RecordPopupContent.js";

/**
 * Popup mode of the Data module ("i" action): an empty value is Built-in (the
 * Data module has no basic card - its list already shows title and type).
 *
 * @param {*} value Configured popup template.
 * @returns {string} `'none'`, `'builtin'`, `'standard'` or a Smarty template name.
 */
export function dataPopupMode(value) {
  const text = value == null ? "" : String(value).trim();
  if (!text) return "builtin";
  const mode = normalizePopupMode(text);
  return mode === "basic" ? "builtin" : mode;
}

/**
 * Extended view template: `'builtin'` (the shared record renderer, also for an
 * empty value), `'standard'` (the legacy record view) or a report-template name.
 *
 * @param {*} value Configured Extended view template.
 * @returns {string}
 */
export function extendedViewTemplate(value) {
  const text = String(value || "").trim();
  return text || "builtin";
}
