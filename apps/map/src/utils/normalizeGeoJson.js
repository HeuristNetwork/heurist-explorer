/**
 * @file normalizeGeoJson.js
 * @brief Normalizes FeatureCollections and adds stable feature, record, layer, title,
 *        and source metadata for later interaction.
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
 * Normalize GeoJSON feature metadata for record-backed and external datasets.
 * Explicit application feature IDs are preserved. Record-backed features receive
 * a deterministic per-feature ID when no application feature ID is supplied, so
 * multiple geometries belonging to the same Heurist record remain independently
 * addressable. External feature IDs are otherwise preserved.
 *
 * @param {object} value A GeoJSON `FeatureCollection`, `Feature`, or bare geometry.
 * @param {{layerId?: string, sourceType?: string}} [options] `layerId` seeds generated feature ids; `sourceType` is recorded on each feature.
 * @returns {object} Normalized `FeatureCollection` with `properties.heurist` metadata on every feature.
 * @throws {TypeError} When `value` is not an object.
 */
export function normalizeGeoJson(value, { layerId, sourceType = 'unknown' } = {}) {
  if (!value || typeof value !== 'object') {
    throw new TypeError('GeoJSON must be an object');
  }

  const collection = value.type === 'FeatureCollection'
    ? value
    : value.type === 'Feature'
      ? { type: 'FeatureCollection', features: [value] }
      : { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: value }] };

  const features = Array.isArray(collection.features) ? collection.features : [];
  const normalizedFeatures = features.map((feature, index) => normalizeFeature(feature, {
    layerId,
    sourceType,
    index
  }));

  return {
    ...collection,
    type: 'FeatureCollection',
    features: normalizedFeatures,
    meta: collection.meta && typeof collection.meta === 'object'
      ? { ...collection.meta }
      : undefined
  };
}

/** Normalize one feature, deriving a stable id and `properties.heurist` metadata. */
function normalizeFeature(value, context) {
  const feature = value && typeof value === 'object' ? value : {};
  const properties = feature.properties && typeof feature.properties === 'object'
    ? { ...feature.properties }
    : {};

  const recordId = positiveIntegerOrNull(
    properties.recordId
      ?? properties.rec_ID
      ?? properties.recId
      ?? feature.recordId
  );
  const recordTypeId = positiveIntegerOrNull(
    properties.recordTypeId
      ?? properties.rec_RecTypeID
      ?? properties.recTypeId
  );
  const title = firstNonEmptyString(
    properties.title,
    properties.rec_Title,
    properties.name,
    feature.title,
    recordId ? `Record ${recordId}` : null
  );

  const featureId = feature.id ?? properties.featureId ?? properties.id
    ?? (recordId ? `record-${recordId}` : `${context.layerId || 'layer'}-feature-${context.index + 1}`);

  properties.heurist = {
    ...(properties.heurist && typeof properties.heurist === 'object' ? properties.heurist : {}),
    featureId: String(featureId),
    recordId,
    recordTypeId,
    title,
    layerId: context.layerId || null,
    sourceType: context.sourceType
  };

  return {
    ...feature,
    type: 'Feature',
    id: featureId,
    properties,
    geometry: feature.geometry ?? null
  };
}

/** Normalize a value to a positive integer, or `null` when invalid. */
function positiveIntegerOrNull(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

/** Return the first non-empty stringified value among the arguments, or `''`. */
function firstNonEmptyString(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return '';
}
