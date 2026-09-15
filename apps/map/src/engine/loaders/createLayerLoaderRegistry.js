/**
 * @file createLayerLoaderRegistry.js
 * @brief Creates the default loader registry for query, record, inline, remote GeoJSON,
 *        tile, tiled-image, and image sources.
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

import { LayerLoaderRegistry } from './LayerLoaderRegistry.js';
import { GeoJsonLayerLoader } from './GeoJsonLayerLoader.js';
import { RemoteGeoJsonLayerLoader } from './RemoteGeoJsonLayerLoader.js';
import { TileLayerLoader } from './TileLayerLoader.js';
import { ImageLayerLoader } from './ImageLayerLoader.js';

/**
 * Build the default layer loader registry with every built-in source type registered.
 *
 * @param {object} [options] Loader dependencies.
 * @param {object} [options.queryGeoData] GeoJSON query provider, forwarded to the GeoJSON loader.
 * @param {object} [options.thematicAttributes] Thematic attribute provider, forwarded to the GeoJSON loader.
 * @param {Function} [options.fetchImpl] Fetch implementation forwarded to the remote GeoJSON loader.
 * @returns {LayerLoaderRegistry}
 */
export function createLayerLoaderRegistry({ queryGeoData, thematicAttributes, fetchImpl } = {}) {
  const registry = new LayerLoaderRegistry();
  registry
    .register(
      ['heurist-query', 'record', 'inline-geojson'],
      new GeoJsonLayerLoader({ queryGeoData, thematicAttributes })
    )
    .register('remote-geojson', new RemoteGeoJsonLayerLoader({ fetchImpl }))
    .register(['tile', 'tiled-image', 'tiledImage'], new TileLayerLoader())
    .register('image', new ImageLayerLoader());
  return registry;
}
