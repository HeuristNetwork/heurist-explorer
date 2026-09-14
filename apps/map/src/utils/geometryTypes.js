/**
 * geometryTypes.js - Detect geometry families present in GeoJSON.
 *
 * @project     Heurist mapping application
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 */

/**
 * Detect point, line and polygon geometry families in a GeoJSON object.
 * The data is scanned once when a runtime layer is created and the compact
 * result can then be cached in application state.
 */
export function detectGeometryTypes(geoJson) {
  const result = { point: false, line: false, polygon: false };
  if (!geoJson) return result;

  if (geoJson.type === 'FeatureCollection') {
    for (const feature of geoJson.features || []) {
      collectGeometryType(feature?.geometry, result);
      if (result.point && result.line && result.polygon) break;
    }
    return result;
  }

  if (geoJson.type === 'Feature') {
    collectGeometryType(geoJson.geometry, result);
    return result;
  }

  collectGeometryType(geoJson, result);
  return result;
}

function collectGeometryType(geometry, result) {
  if (!geometry || !geometry.type) return;
  switch (geometry.type) {
    case 'Point':
    case 'MultiPoint':
      result.point = true;
      break;
    case 'LineString':
    case 'MultiLineString':
      result.line = true;
      break;
    case 'Polygon':
    case 'MultiPolygon':
      result.polygon = true;
      break;
    case 'GeometryCollection':
      for (const child of geometry.geometries || []) {
        collectGeometryType(child, result);
        if (result.point && result.line && result.polygon) break;
      }
      break;
    default:
      break;
  }
}
