/**
 * @file selection.js
 * @brief Record selections of synchronized modules (plan 27l §2.1): one id rule and one comparison.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

/**
 * Normalize a value into a de-duplicated array of positive integer record IDs.
 *
 * @param {*} values Value to normalize; non-arrays produce an empty result.
 * @returns {Array<number>} Normalized record IDs.
 */
export function normalizeIds(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(Number)
    .filter((id) => Number.isInteger(id) && id > 0))];
}

/**
 * Whether two selection arrays contain the same set of ids, ignoring order.
 *
 * @param {Array<number>} a
 * @param {Array<number>} b
 * @returns {boolean}
 */
export function sameSelection(a, b) {
  if (a.length !== b.length) {
    return false;
  }

  const values = new Set(a);
  return b.every((id) => values.has(id));
}
