/**
 * @file recordLimits.js
 * @brief Limits of the built-in record view for very large records (plan 23 §3.1): how
 *        many fields, values per field, thumbnails and reverse links are shown before a
 *        "Show more" link. Set in the Explorer configuration (Record view) and passed
 *        to every module in `runtime.recordLimits`.
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

/** The values offered for every limit (Artem, 2026-10-22). */
export const RECORD_LIMIT_OPTIONS = Object.freeze([10, 20, 50, 100, 500]);

/**
 * Default limits: `fields` filled fields, `values` values per field, `thumbs` media
 * thumbnails, `links` records per "Linked from" / relationship row.
 */
export const DEFAULT_RECORD_LIMITS = Object.freeze({ fields: 50, values: 10, thumbs: 10, links: 20 });

/**
 * Limits with every missing or unknown value replaced by its default.
 *
 * @param {*} value Saved or runtime limits (`{fields, values, thumbs, links}`, partial allowed).
 * @returns {{fields: number, values: number, thumbs: number, links: number}} A new object.
 */
export function normalizeRecordLimits(value) {
  const source = value && typeof value === "object" ? value : {};
  const limits = {};
  for (const [key, fallback] of Object.entries(DEFAULT_RECORD_LIMITS)) {
    const number = Number(source[key]);
    limits[key] = RECORD_LIMIT_OPTIONS.includes(number) ? number : fallback;
  }
  return limits;
}

/**
 * Whether two limit sets differ (after normalizing both).
 *
 * @param {*} a Limits.
 * @param {*} b Limits.
 * @returns {boolean}
 */
export function recordLimitsDiffer(a, b) {
  const left = normalizeRecordLimits(a);
  const right = normalizeRecordLimits(b);
  return Object.keys(DEFAULT_RECORD_LIMITS).some((key) => left[key] !== right[key]);
}
