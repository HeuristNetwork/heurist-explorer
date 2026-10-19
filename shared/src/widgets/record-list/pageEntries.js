/**
 * @file pageEntries.js
 * @brief Page numbers shown by the record list's pagination (buttons and select).
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
 * Build the page-number list for pagination controls: every page up to 12; above,
 * the first, 3 pages before the current one, the current, 3 after, and the last, with
 * `null` gaps where pages are skipped (2026-10-14).
 *
 * @param {number} current Current page index (0-based).
 * @param {number} count Total page count.
 * @returns {Array<number|null>} Page indices to render, with `null` marking an ellipsis gap.
 */
export function pageEntries(current, count) {
  if (count <= 12) return Array.from({ length: count }, (_, i) => i);
  const around = [-3, -2, -1, 0, 1, 2, 3].map((step) => current + step);
  const values = new Set(
    [0, count - 1, ...around].filter((page) => page >= 0 && page < count),
  );
  const result = [];
  [...values]
    .sort((a, b) => a - b)
    .forEach((page, index, sorted) => {
      if (index && page - sorted[index - 1] > 1) result.push(null);
      result.push(page);
    });
  return result;
}
