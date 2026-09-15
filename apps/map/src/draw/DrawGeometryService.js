/**
 * @file DrawGeometryService.js
 * @brief Engine-neutral WKT and GeoJSON conversion for map drawing.
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

import wellknown from 'wellknown';

const LEGACY_PREFIXES = new Set(['m', 'pl', 'l', 'c', 'r', 'p']);

/** Converts between WKT, legacy Heurist geometry strings, and GeoJSON for the drawing session. */
export class DrawGeometryService {
  /**
   * Parse a drawing value into GeoJSON.
   *
   * @param {*} value GeoJSON object, JSON string, WKT string, legacy-prefixed WKT, or bare coordinate list.
   * @param {{mode?: string}} [options] `mode` selects rectangle interpretation for a 2-point coordinate list.
   * @returns {object|null} Parsed GeoJSON geometry, or `null` for empty input.
   * @throws {Error} When the value is not valid WKT or GeoJSON.
   */
  parse(value, options = {}) {
    if (value == null || value === '') return null;
    if (typeof value === 'object') return clone(value);
    let text = String(value).trim();
    if (!text) return null;
    if (text.startsWith('{') || text.startsWith('[')) return JSON.parse(text);
    const match = text.match(/^(\S{1,2})\s+([\s\S]+)$/);
    if (match && LEGACY_PREFIXES.has(match[1].toLowerCase())) text = match[2];
    const simple = parseSimpleCoordinates(text, options.mode);
    if (simple) return simple;
    const geometry = wellknown.parse(text);
    if (!geometry) throw new Error('The supplied geometry is not valid WKT or GeoJSON');
    return geometry;
  }

  /**
   * Serialize a GeoJSON value (or Feature/FeatureCollection) to `{type, wkt, geojson}`.
   *
   * @param {object} geojson GeoJSON geometry, Feature, or FeatureCollection.
   * @returns {{type: string, wkt: string, geojson: object}|null} Serialized geometry, or `null` when empty.
   * @throws {Error} When the geometry cannot be converted to WKT.
   */
  serialize(geojson) {
    const geometry = toGeometry(geojson);
    if (!geometry) return null;
    const wkt = wellknown.stringify(geometry);
    if (!wkt) throw new Error('Cannot convert the drawing to WKT');
    return {
      type: legacyTypeCode(geometry),
      wkt,
      geojson: clone(geojson)
    };
  }
}

/** Parse a whitespace/comma-separated list of bare numeric coordinates into a Point/Polygon/MultiPoint geometry. */
function parseSimpleCoordinates(text, mode) {
  if (/[A-Za-z(){}\[\]]/.test(text)) return null;
  const values = text.replace(/,/g, ' ').trim().split(/\s+/).map(Number);
  if (!values.length || values.some((value) => !Number.isFinite(value)) || values.length % 2) return null;
  const coordinates = [];
  for (let index = 0; index < values.length; index += 2) coordinates.push([values[index], values[index + 1]]);
  if (coordinates.length === 1) return { type: 'Point', coordinates: coordinates[0] };
  if (['rectangle', 'image'].includes(mode) && coordinates.length === 2) {
    const [[x1, y1], [x2, y2]] = coordinates;
    return {
      type: 'Polygon',
      coordinates: [[[x1, y1], [x2, y1], [x2, y2], [x1, y2], [x1, y1]]]
    };
  }
  return { type: 'MultiPoint', coordinates };
}

/** Extract a bare geometry from a GeoJSON value, unwrapping Feature/FeatureCollection. */
function toGeometry(value) {
  if (!value || typeof value !== 'object') return null;
  if (value.type === 'Feature') return value.geometry || null;
  if (value.type === 'FeatureCollection') {
    const geometries = value.features.map((feature) => feature?.geometry).filter(Boolean);
    if (!geometries.length) return null;
    return geometries.length === 1 ? geometries[0] : { type: 'GeometryCollection', geometries };
  }
  return value.coordinates || value.geometries ? value : null;
}

/** Map a GeoJSON geometry type to its legacy single/double-letter Heurist type code. */
function legacyTypeCode(geometry) {
  if (!geometry) return 'm';
  if (geometry.type === 'Point') return 'p';
  if (geometry.type === 'LineString') return 'l';
  if (geometry.type === 'Polygon') return 'pl';
  return 'm';
}

/** Deep-clone a JSON-safe value, tolerating `null`/`undefined`. */
function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
