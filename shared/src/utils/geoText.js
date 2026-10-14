/**
 * @file geoText.js
 * @brief Human-readable text of a geographic value: feature type, number of
 *        vertices and the coordinate ranges, e.g.
 *        `Polygon n=5 (X -153.2389637,190.6447474 Y -38.3421436,70.3620549)`.
 *
 * The one place this text is built on the client (Record View, record editor
 * HInputGeo, Filter Builder). The server builds the same text in
 * `Heurist\Utilities\GeoText` (report {wrap dt="geo"}); keep both in step.
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

import { isExtent } from './geoExtent.js';

/** WKT keyword → feature type name. */
const FEATURE_TYPES = {
  POINT: 'Point',
  MULTIPOINT: 'MultiPoint',
  LINESTRING: 'LineString',
  MULTILINESTRING: 'MultiLineString',
  POLYGON: 'Polygon',
  MULTIPOLYGON: 'MultiPolygon',
  GEOMETRYCOLLECTION: 'GeometryCollection'
};

/**
 * Human-readable text of a WKT geometry or a map extent: `Type n=vertices (X min,max Y min,max)`;
 * a single point is `Point (X x Y y)`. A value that is not WKT is returned as it is.
 *
 * @param {string|{west:number, south:number, east:number, north:number}|null} value WKT text
 *        (a legacy Heurist type code before it, e.g. `pl POLYGON(...)`, is ignored) or an extent.
 * @returns {string} The text; `''` for an empty value.
 */
export function geoToHuman(value) {
  if (isExtent(value)) {
    return `BBOX (X ${coordinate(value.west)},${coordinate(value.east)} Y ${coordinate(value.south)},${coordinate(value.north)})`;
  }
  const text = String(value ?? '').trim().replace(/^(?:p|pl|c|r|l|m)\s+(?=[a-z]+\s*\(|[a-z]+\s+empty)/i, '');
  if (!text) return '';
  const keyword = /^([a-z]+)(?:\s+(?:zm|z|m))?\s*(?:\(|empty\b)/i.exec(text)?.[1]?.toUpperCase();
  if (!keyword) return text;
  const type = FEATURE_TYPES[keyword] || keyword;
  const vertices = wktVertices(text);
  if (!vertices.length) return type;
  if (vertices.length === 1) {
    return `${type} (X ${coordinate(vertices[0][0])} Y ${coordinate(vertices[0][1])})`;
  }
  const xs = vertices.map((vertex) => vertex[0]);
  const ys = vertices.map((vertex) => vertex[1]);
  return `${type} n=${vertices.length} (X ${coordinate(Math.min(...xs))},${coordinate(Math.max(...xs))}`
    + ` Y ${coordinate(Math.min(...ys))},${coordinate(Math.max(...ys))})`;
}

/**
 * The vertices of a WKT geometry: x and y of every coordinate (z/m are ignored).
 *
 * @param {string} wkt WKT text.
 * @returns {Array<[number, number]>} Vertices.
 */
export function wktVertices(wkt) {
  const vertices = [];
  // innermost parentheses hold the coordinate lists
  for (const [, list] of String(wkt ?? '').matchAll(/\(([^()]*)\)/g)) {
    for (const item of list.split(',')) {
      const [x, y] = item.trim().split(/\s+/).map(Number);
      if (Number.isFinite(x) && Number.isFinite(y)) vertices.push([x, y]);
    }
  }
  return vertices;
}

/** A coordinate rounded to 7 decimals, without insignificant trailing zeros. */
function coordinate(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  const rounded = Number(number.toFixed(7));
  return String(Object.is(rounded, -0) ? 0 : rounded);
}
