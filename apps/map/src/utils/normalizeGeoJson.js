/**
 * normalizeGeoJson.js - GeoJSON metadata normalization
 *
 * @fileOverview Normalizes FeatureCollections and adds stable feature, record, layer, title, and source metadata for later interaction.
 * @project     Heurist mapping application
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2026 Heurist Network
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @author      Artem Osmakov <osmakov@gmail.com>
 */

/**
 * Normalize GeoJSON feature metadata for record-backed and external datasets.
 * Explicit application feature IDs are preserved. Record-backed features receive
 * a deterministic per-feature ID when no application feature ID is supplied, so
 * multiple geometries belonging to the same Heurist record remain independently
 * addressable. External feature IDs are otherwise preserved.
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

function positiveIntegerOrNull(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function firstNonEmptyString(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return '';
}
