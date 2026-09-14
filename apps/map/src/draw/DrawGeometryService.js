/**
 * DrawGeometryService.js - Engine-neutral WKT and GeoJSON conversion for map drawing
 *
 * @project     Heurist mapping application
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 */

import wellknown from 'wellknown';

const LEGACY_PREFIXES = new Set(['m', 'pl', 'l', 'c', 'r', 'p']);

export class DrawGeometryService {
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

function legacyTypeCode(geometry) {
  if (!geometry) return 'm';
  if (geometry.type === 'Point') return 'p';
  if (geometry.type === 'LineString') return 'l';
  if (geometry.type === 'Polygon') return 'pl';
  return 'm';
}

function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
