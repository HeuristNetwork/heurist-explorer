/**
 * @file queryRecordType.js
 * @brief The main record type of a Heurist query (its first `t` predicate).
 *
 * Used by Explorer's Query Source editor (record type of the draft) and by
 * heurist-data (a changed record type closes and resets expansion).
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

/**
 * Infer a query's record type: the first `t` predicate, depth-first.
 *
 * @param {*} query Query text, JSON query, or a wrapper with `q`.
 * @returns {number|null} Record type ID, or `null` when the query has none.
 */
export function inferRecordTypeId(query) {
  const find = (value) => {
    if (!value) return null;
    if (typeof value === 'string') {
      const match = value.match(/(?:^|\s)t\s*:\s*(\d+)/i);
      return match ? Number(match[1]) : null;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        const hit = find(item);
        if (hit) return hit;
      }
      return null;
    }
    if (typeof value === 'object') {
      if (value.t != null && Number(value.t) > 0) return Number(value.t);
      if (value.q != null) return find(value.q);
      for (const child of Object.values(value)) {
        const hit = find(child);
        if (hit) return hit;
      }
    }
    return null;
  };
  return find(query);
}
