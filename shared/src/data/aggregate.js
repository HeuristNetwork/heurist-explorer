/**
 * @file aggregate.js
 * @brief Counts, values and bounds over a query: `/{domain}/aggregate` (plan 20, Phase 3).
 *
 * Search (`/records`, `/files`) returns records or ids; everything that counts
 * goes through this helper:
 * - `count` → `{query, total}`;
 * - `rectypes` → `{query, total, rectypes: [{rec_RecTypeID, count}]}`;
 * - `values` → `{query, field, total, values: [{value, count, label?}]}` (`field`, `text`,
 *   `sort` = count|value, `via`, `limit`, `offset`);
 * - `minmax` → `{query, field, type, min, max, count}` (`field`);
 * - `ranges` → `{query, field, type, total, buckets: [{from, to, label, count}]}`
 *   (`field`, `groupby`, `ranges`, `match`).
 *
 * The response is returned as the server gives it.
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

/** Operations of `/{domain}/aggregate`. */
export const AGGREGATE_OPS = Object.freeze(['count', 'rectypes', 'values', 'minmax', 'ranges']);

/**
 * Run one aggregate operation.
 *
 * @param {object} api HeuristApiClient (needs `get`, or `post` for `method: 'POST'`).
 * @param {'count'|'rectypes'|'values'|'minmax'|'ranges'} op Operation.
 * @param {object} [params] Query (`q`/`query`/`ids`, `filter`) and the parameters of the operation.
 * @param {{domain?: string, method?: 'GET'|'POST', signal?: AbortSignal}} [options]
 *        `domain`: `records` (default) or `files` (count and rectypes only); POST for long queries.
 * @returns {Promise<object>} The response of the operation.
 * @throws {TypeError} For an unknown operation or a missing API client.
 */
export async function aggregate(api, op, params = {}, { domain = 'records', method = 'GET', signal } = {}) {
  if (!AGGREGATE_OPS.includes(op)) throw new TypeError(`Unknown aggregate op: ${op}`);
  const path = `/${domain}/aggregate`;
  const values = { ...params, op };
  if (String(method).toUpperCase() === 'POST') {
    if (!api?.post) throw new TypeError('aggregate requires an API client');
    return api.post(path, { body: values, signal });
  }
  if (!api?.get) throw new TypeError('aggregate requires an API client');
  return api.get(path, { query: values, signal });
}
