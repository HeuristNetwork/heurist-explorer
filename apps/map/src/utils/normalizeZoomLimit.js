/**
 * @file normalizeZoomLimit.js
 * @brief Normalizes optional native map zoom values without coercing absent values
 *        (null/undefined/empty string) to zoom level zero.
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

/**
 * Normalize an optional native map zoom level.
 *
 * @param {*} value Candidate zoom value.
 * @returns {number|null} Finite numeric zoom, or null when no limit exists.
 */
export function normalizeZoomLimit(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
