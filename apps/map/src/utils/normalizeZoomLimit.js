/**
 * normalizeZoomLimit.js - Optional native map zoom normalization
 *
 * @fileOverview Normalizes optional native zoom values without coercing
 * absent values (null/undefined/empty string) to zoom level zero.
 * @project     Heurist mapping application
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2026 Heurist Network
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @author      Artem Osmakov <osmakov@gmail.com>
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
