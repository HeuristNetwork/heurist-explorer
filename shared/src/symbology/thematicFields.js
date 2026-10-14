/**
 * @file thematicFields.js
 * @brief Fields of thematic maps: their path codes (`10:1109`,
 *        `10:lt240:48:237`), the query of the records that hold their values,
 *        and the values themselves (plan 17 §2, §5).
 *
 * The values of a field of the layer's records are read over the layer query. The
 * values of a field of linked records are read over the linked records: each link
 * hop of the code becomes a predicate in the reverse direction around the query
 * (records 48 pointed to by the layer records through field 240:
 * `[{t:48}, {"lf:240": layerQuery}]`). This replaces the legacy `$IDS` substitution
 * of mapThemesEditor (get_facets).
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

/** Link token of a path code → predicate that reaches the far records from the near ones. */
const REVERSE_LINK = { lt: 'lf', lf: 'lt', rt: 'rf', rf: 'rt', r: 'related' };

/** Field types a thematic field may have (legacy mapThemesEditor tree). */
export const THEMATIC_FIELD_TYPES = Object.freeze(['enum', 'relationtype', 'year', 'date', 'integer', 'float']);

/**
 * Read a field path code.
 *
 * @param {string} code Path code: `rty:dty`, `rty:lt240:48:dty`, ... or `dty`.
 * @returns {{rectypeId: number|null, hops: Array<{link: string, dty: number, rectypeId: number|null}>, dty: number|null}}
 */
export function parseFieldCode(code) {
  const tokens = String(code ?? '').split(':').map((token) => token.trim()).filter(Boolean);
  const result = { rectypeId: null, hops: [], dty: null };
  if (!tokens.length) return result;
  result.dty = /^\d+$/.test(tokens.at(-1)) ? Number(tokens.at(-1)) : null;
  const body = tokens.slice(0, -1);
  let index = 0;
  if (/^\d+$/.test(body[0] || '')) {
    result.rectypeId = Number(body[0]);
    index = 1;
  }
  while (index < body.length) {
    const link = /^(lt|lf|rt|rf|r)(\d+)$/i.exec(body[index]);
    if (!link) break;
    const target = /^\d+$/.test(body[index + 1] || '') ? Number(body[index + 1]) : null;
    result.hops.push({ link: link[1].toLowerCase(), dty: Number(link[2]), rectypeId: target });
    index += target ? 2 : 1;
  }
  return result;
}

/**
 * The field id (last part) of a path code.
 *
 * @param {string} code Path code.
 * @returns {number|null} Detail type id.
 */
export function fieldCodeDty(code) {
  return parseFieldCode(code).dty;
}

/**
 * The type of a thematic field.
 *
 * @param {string} code Path code.
 * @param {object} dbdefs HDbDefs.
 * @returns {string} Field type (`enum`, `integer`, ...), `''` when unknown.
 */
export function fieldCodeType(code, dbdefs) {
  const dty = fieldCodeDty(code);
  return dty ? String(dbdefs?.fieldGlobal?.(dty)?.type || '') : '';
}

/**
 * The query of the records holding the values of a field: the layer query, or for a
 * field of linked records the linked records reached from it.
 *
 * @param {string} code Path code.
 * @param {Array|object|string} layerQuery Query of the layer (JSON, or text without links).
 * @returns {{query: Array|object|string|null, error?: string}} The query; `error` when it cannot be built
 *          (links over a text query).
 */
export function fieldValuesQuery(code, layerQuery) {
  const parsed = parseFieldCode(code);
  let query = normalizeQuery(layerQuery);
  if (!parsed.hops.length) return { query };
  if (typeof query === 'string') {
    return {
      query: null,
      error: 'To base a thematic map on values of linked records, the query of the map layer must be in JSON format'
    };
  }
  for (const hop of parsed.hops) {
    const key = `${REVERSE_LINK[hop.link] || 'lf'}:${hop.dty}`;
    query = [...(hop.rectypeId ? [{ t: String(hop.rectypeId) }] : []), { [key]: query ?? [] }];
  }
  return { query };
}

/**
 * Record types of the layer's records, with counts.
 *
 * @param {object} api HeuristApiClient (needs `get`).
 * @param {Array|object|string} layerQuery Layer query.
 * @param {{signal?: AbortSignal}} [options]
 * @returns {Promise<Array<{id: number, label: string, count: number}>>} Record types, most records first.
 */
export async function layerRecordTypes(api, layerQuery, { signal } = {}) {
  const payload = await api.get('/records/', {
    query: { q: normalizeQuery(layerQuery) ?? [], detail: 'values', field: 'rectype', limit: 200, sort: 'count' },
    signal
  });
  return (Array.isArray(payload?.values) ? payload.values : [])
    .map((row) => ({ id: Number(row.value), label: String(row.label ?? row.value), count: Number(row.count) || 0 }))
    .filter((item) => item.id > 0)
    .sort((a, b) => b.count - a.count);
}

/**
 * The values a thematic field has, with counts (categories).
 *
 * @param {object} api HeuristApiClient.
 * @param {string} code Path code.
 * @param {Array|object|string} layerQuery Layer query.
 * @param {{signal?: AbortSignal}} [options]
 * @returns {Promise<Array<{value: string, label: string, count: number}>>} Values.
 */
export async function fieldValues(api, code, layerQuery, { signal } = {}) {
  const { query, error } = fieldValuesQuery(code, layerQuery);
  if (error) throw new Error(error);
  const payload = await api.get('/records/', {
    query: { q: query ?? [], detail: 'values', field: String(fieldCodeDty(code)), limit: 1000, sort: 'value' },
    signal
  });
  return (Array.isArray(payload?.values) ? payload.values : []).map((row) => ({
    value: String(row.value ?? ''),
    label: row.label != null && row.label !== '' ? String(row.label) : String(row.value ?? ''),
    count: Number(row.count) || 0
  }));
}

/**
 * The smallest and largest value of a numeric or date thematic field.
 *
 * @param {object} api HeuristApiClient.
 * @param {string} code Path code.
 * @param {Array|object|string} layerQuery Layer query.
 * @param {{signal?: AbortSignal}} [options]
 * @returns {Promise<{min: number|string|null, max: number|string|null}>} Bounds.
 */
export async function fieldBounds(api, code, layerQuery, { signal } = {}) {
  const { query, error } = fieldValuesQuery(code, layerQuery);
  if (error) throw new Error(error);
  const payload = await api.get('/records/', {
    query: { q: query ?? [], detail: 'minmax', field: String(fieldCodeDty(code)) },
    signal
  });
  return { min: payload?.min ?? null, max: payload?.max ?? null };
}

/** A query given as JSON text becomes JSON; other text stays text; empty is null. */
function normalizeQuery(query) {
  if (query == null) return null;
  if (typeof query !== 'string') return query;
  const text = query.trim();
  if (!text) return null;
  if (text.startsWith('[') || text.startsWith('{')) {
    try { return JSON.parse(text); } catch { return text; }
  }
  return text;
}
