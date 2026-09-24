/**
 * @file geoExtent.js
 * @brief Pure helpers for geographic extents `{west, south, east, north}`:
 *        conversion to/from WKT and GeoJSON, and human-friendly rounding.
 *
 * The extent object is also a valid Heurist query value:
 *   {"geo":{"west":-16,"south":32,"east":40,"north":72}}
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

const EDGES = ['west', 'south', 'east', 'north'];
const COORDINATE_PAIR = /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\s+-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;

/**
 * @param {*} value
 * @returns {boolean} Whether `value` carries all four numeric edges.
 */
export function isExtent(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    && EDGES.every((key) => value[key] !== '' && value[key] != null && Number.isFinite(Number(value[key])));
}

/**
 * @param {object} extent
 * @returns {string} Closed rectangular `POLYGON((…))` WKT, or `''` when not an extent.
 */
export function extentToWkt(extent) {
  if (!isExtent(extent)) return '';
  const { west, south, east, north } = numericExtent(extent);
  return `POLYGON((${west} ${south},${east} ${south},${east} ${north},${west} ${north},${west} ${south}))`;
}

/**
 * @param {object} extent
 * @returns {{type:'Polygon', coordinates:number[][][]}|null} Rectangular GeoJSON polygon.
 */
export function extentToGeoJson(extent) {
  if (!isExtent(extent)) return null;
  const { west, south, east, north } = numericExtent(extent);
  return {
    type: 'Polygon',
    coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]]
  };
}

/**
 * Bounding extent of any GeoJSON geometry, feature or collection.
 *
 * @param {object} geojson
 * @returns {{west:number,south:number,east:number,north:number}|null}
 */
export function extentFromGeoJson(geojson) {
  const positions = [];
  const visit = (node) => {
    if (!node) return;
    if (Array.isArray(node) && node.length >= 2 && node.every((value) => typeof value === 'number')) {
      positions.push(node);
    } else if (Array.isArray(node)) {
      for (const item of node) visit(item);
    } else if (typeof node === 'object') {
      visit(node.coordinates || node.geometry || node.features || node.geometries);
    }
  };
  visit(geojson);
  return extentOf(positions);
}

/**
 * Bounding extent of a WKT geometry's coordinate pairs.
 *
 * @param {string} wkt
 * @returns {{west:number,south:number,east:number,north:number}|null}
 */
export function extentFromWkt(wkt) {
  const pairs = String(wkt || '').match(COORDINATE_PAIR);
  return pairs ? extentOf(pairs.map((pair) => pair.trim().split(/\s+/).map(Number))) : null;
}

/**
 * Round an extent to a precision that suits its size, always outward so the
 * rounded box still covers the original. The size is the extent's smaller
 * side (so a long thin box keeps its thin dimension):
 *   ≥ 5°  -> whole degrees
 *   ≥ 2°  -> 2 decimals
 *   ≥ 1°  -> 4 decimals
 *   < 1°  -> unchanged
 *
 * @param {object} extent
 * @returns {{west:number,south:number,east:number,north:number}|null}
 */
export function roundExtent(extent) {
  if (!isExtent(extent)) return null;
  const { west, south, east, north } = numericExtent(extent);
  // an extent crossing the antimeridian has west > east
  const width = east >= west ? east - west : east - west + 360;
  const size = Math.min(width, north - south);
  const digits = size >= 5 ? 0 : size >= 2 ? 2 : size >= 1 ? 4 : null;
  if (digits == null) return { west, south, east, north };

  const factor = 10 ** digits;
  const down = (v) => Number((Math.floor(v * factor) / factor).toFixed(digits));
  const up = (v) => Number((Math.ceil(v * factor) / factor).toFixed(digits));
  const clamp = (v, limit) => Math.max(-limit, Math.min(limit, v));
  return {
    west: clamp(down(west), 180),
    south: clamp(down(south), 90),
    east: clamp(up(east), 180),
    north: clamp(up(north), 90)
  };
}

/** @returns {{west:number,south:number,east:number,north:number}} Edges as numbers. */
function numericExtent(extent) {
  return {
    west: Number(extent.west), south: Number(extent.south),
    east: Number(extent.east), north: Number(extent.north)
  };
}

/** @returns {{west:number,south:number,east:number,north:number}|null} Box around `[x, y]` points. */
function extentOf(points) {
  if (!points.length) return null;
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  return { west: Math.min(...xs), south: Math.min(...ys), east: Math.max(...xs), north: Math.max(...ys) };
}
