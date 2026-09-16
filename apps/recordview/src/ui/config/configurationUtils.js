/**
 * @file configurationUtils.js
 * @brief heurist-recordview's format/mode constants; generic helpers live in #shared/ui.
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
import {
  serializeConfigurationSettings as serializeSettings,
} from "#shared/ui";

export {
  CONFIGURATION_VERSION,
  unwrapSettings,
  boolean,
  enumValue,
  stringValue,
  nullableString,
} from "#shared/ui";

export const CONFIGURATION_FORMAT = "heurist-recordview-settings";
export const CONFIGURATION_MODES = Object.freeze([
  "preferences",
  "website",
  "publish",
]);

/** Produce a versioned JSON-safe settings envelope tagged with heurist-recordview's format string. */
export function serializeConfigurationSettings(
  value = {},
  normalizeSettings = (item) => item,
) {
  return serializeSettings(value, normalizeSettings, CONFIGURATION_FORMAT);
}
