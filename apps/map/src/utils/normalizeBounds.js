/**
 * normalizeBounds.js - Geographic bounds normalization
 *
 * @fileOverview Normalizes engine-neutral geographic bounds from either the public Heurist API min/max format or the west/south/east/north client format.
 * @project     Heurist mapping application
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2026 Heurist Network
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @author      Artem Osmakov <osmakov@gmail.com>
 */

/**
 * Normalize geographic bounds to the canonical client representation.
 *
 * The Heurist API currently returns `{minx, miny, maxx, maxy}` while the
 * engine-neutral client model uses `{west, south, east, north}`.
 *
 * @param {Object|Array|null} value Bounds value to normalize.
 * @returns {{west:number,south:number,east:number,north:number}|null} Canonical bounds, or null when invalid.
 */
export function normalizeBounds(value) {
  if (!value) {
    return null;
  }

  const west = Number(value.west ?? value.minx ?? value.minX ?? value[0]);
  const south = Number(value.south ?? value.miny ?? value.minY ?? value[1]);
  const east = Number(value.east ?? value.maxx ?? value.maxX ?? value[2]);
  const north = Number(value.north ?? value.maxy ?? value.maxY ?? value[3]);

  if (![west, south, east, north].every(Number.isFinite)) {
    return null;
  }

  if (south > north || west > east) {
    return null;
  }

  return { west, south, east, north };
}
