/**
 * @file geometryTypes.js
 * @brief Detect geometry families present in GeoJSON.
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
 * Detect point, line and polygon geometry families in a GeoJSON object.
 * The data is scanned once when a runtime layer is created and the compact
 * result can then be cached in application state.
 *
 * @param {object|null} geoJson A GeoJSON `FeatureCollection`, `Feature`, or bare geometry.
 * @returns {{point: boolean, line: boolean, polygon: boolean}} Which geometry families are present.
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

/** Mark the geometry family(ies) present in one GeoJSON geometry (or geometry collection), recursively. */
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
