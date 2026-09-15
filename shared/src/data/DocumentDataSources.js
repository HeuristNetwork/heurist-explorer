/**
 * @file DocumentDataSources.js
 * @brief Shared DataSource identity and document routing helpers.
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
 * Deep-clone a plain value via `structuredClone`.
 *
 * @param {*} value Candidate value.
 * @returns {*} The cloned value, or `value` itself when nullish.
 */
const clonePlain = value => value == null ? value : structuredClone(value);

/**
 * Coerce a value to an opacity fraction clamped to `[0, 1]`.
 *
 * @param {*} value Candidate opacity value.
 * @returns {number} The clamped opacity, defaulting non-numeric input to `0`.
 */
const normalizeRuntimeOpacity = value => Math.max(0, Math.min(1, Number(value) || 0));

/**
 * Validate and clone a raw DataSource snapshot, requiring a `reference` and a non-empty query.
 *
 * @param {object} value Raw DataSource snapshot.
 * @returns {object|null} A cloned, validated DataSource snapshot, or `null` when invalid.
 */
export function normalizeRuntimeDataSource(value) {
  if (!value || typeof value !== 'object' || !value.reference || !value.request) return null;
  if (value.request.q == null || value.request.q === '') return null;
  return clonePlain(value);
}

/**
 * Normalize and de-duplicate a list of raw DataSource snapshots by reference key.
 *
 * @param {Array} values Raw DataSource snapshots.
 * @returns {Array<object>} Unique, validated DataSource snapshots.
 */
export function uniqueDataSources(values) {
  const result = [];
  const keys = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const source = normalizeRuntimeDataSource(value);
    const key = source?.reference?.key;
    if (!source || !key || keys.has(key)) continue;
    keys.add(key);
    result.push(source);
  }
  return result;
}

/**
 * Compute a stable, short alphanumeric hash of a value's string form (FNV-1a).
 *
 * @param {*} value Value to hash (coerced to a string).
 * @returns {string} Base-36 hash string.
 */
export function stableHash(value) {
  let hash = 2166136261;
  const text = String(value || '');
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

/**
 * Derive a DataSource snapshot from a MapLayer definition backed by a Heurist query.
 *
 * @param {object} definition MapLayer definition.
 * @returns {object|null} The derived DataSource snapshot, or `null` when the layer has no
 *          Heurist-query source.
 */
export function dataSourceFromLayerDefinition(definition) {
  if (definition?.source?.type !== 'heurist-query' || definition.source.query == null) return null;
  const linked = definition.source.dataSourceReference;
  const sourceId = Number(linked?.id);
  const reference = linked?.type === 'source' && Number.isInteger(sourceId) && sourceId > 0
    ? { type: 'source', id: sourceId, key: `source:${sourceId}` }
    : { type: 'query', id: null, key: `query:map-${stableHash(JSON.stringify(definition.source.query))}` };
  return {
    reference,
    title: definition.source.title || definition.title || 'Map layer',
    request: { q: clonePlain(definition.source.query) },
    presentation: {
      data: null,
      map: {
        geoFields: clonePlain(definition.source.geoFields || []),
        dynamicRequests: definition.options?.dynamicRequests === true,
        minZoom: definition.options?.minZoom ?? null,
        maxZoom: definition.options?.maxZoom ?? null,
        style: clonePlain(definition.style || {}),
        opacity: normalizeRuntimeOpacity(definition.opacity ?? 1),
        visible: definition.visible !== false
      },
      graph: null,
      timeline: null,
      filterForm: null
    }
  };
}

