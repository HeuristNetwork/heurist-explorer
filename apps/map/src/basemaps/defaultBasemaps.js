/**
 * @file defaultBasemaps.js
 * @brief Heurist curated base-map definitions.
 *
 * Standard entries refer to provider IDs exposed by leaflet-providers.js.
 * Custom entries remain engine-neutral XYZ tile definitions and are handled by
 * the active map-engine adapter.
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

export const DEFAULT_BASE_MAPS = Object.freeze([
  provider('OpenStreetMap'),
  provider('OpenTopoMap'),
  provider('Esri.WorldStreetMap'),
  provider('Esri.WorldTopoMap'),
  provider('Esri.WorldImagery'),
  provider('Esri.WorldShadedRelief'),
  provider('Stadia.StamenToner'),
  provider('Stadia.StamenTonerLite'),
  provider('Stadia.StamenTerrain'),
  provider('Stadia.StamenTerrainBackground'),
  provider('Stadia.StamenWatercolor'),
  provider('Esri.NatGeoWorldMap'),
  provider('Esri.WorldGrayCanvas'),
  provider('MapTilesAPI.OSMEnglish'),
  Object.freeze({
    id: 'DARE.RomanEmpire',
    title: 'DARE Roman Empire',
    type: 'tile',
    url: 'https://dh.gu.se/tiles/imperium/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://dh.gu.se/dare/" target="_blank">Digital Atlas of the Roman Empire (DARE)</a> '
      + 'by <a href="https://www.gu.se/digital-humaniora" target="_blank">Johan Åhlfeldt, Centre for Digital Humanities, University of Gothenburg</a> '
      + '(Licensed under <a href="https://creativecommons.org/licenses/by/4.0/">CC-BY-4.0</a>)',
    minZoom: 4,
    maxZoom: 11
  }),
  provider('GeoportailFrance.plan'),
  provider('GeoportailFrance.parcels'),
  provider('GeoportailFrance.orthos'),
  Object.freeze({ id: 'None', title: 'None', type: 'none' })
]);

/**
 * Return a fresh, mutable copy of the curated default base-map list.
 *
 * @returns {Array<object>} Cloned base-map definitions.
 */
export function getDefaultBaseMaps() {
  return DEFAULT_BASE_MAPS.map(cloneDefinition);
}

/** Build a standard leaflet-providers base-map entry from its provider id. */
function provider(id) {
  return Object.freeze({ id, title: id, type: 'tile', provider: id });
}

/** Deep-clone a JSON-safe value, tolerating `null`/`undefined`. */
function cloneDefinition(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}
