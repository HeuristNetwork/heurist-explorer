/**
 * @file RemoteGeoJsonLayerLoader.js
 * @brief Fetches external GeoJSON resources, validates them, and produces normalized
 *        engine-neutral runtime layers.
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

import { HeuristApiError } from '#shared/api';
import { createGeoJsonRuntimeLayer } from './GeoJsonLayerLoader.js';

/** Invoke the native fetch implementation without losing its required global receiver in browsers. */
function defaultFetch(...args) {
  return globalThis.fetch(...args);
}

/** Loads external GeoJSON MapLayers through fetch. */
export class RemoteGeoJsonLayerLoader {
  /** @param {{fetchImpl?: Function}} [options] `fetchImpl` overrides the global `fetch`. */
  constructor({ fetchImpl = defaultFetch } = {}) {
    this.fetchImpl = fetchImpl;
  }

  /**
   * Fetch and validate a remote GeoJSON MapLayer.
   *
   * @param {object} mapLayer Normalized public MapLayer.
   * @param {object} context Layer-loading context.
   * @returns {Promise<object>} Engine-neutral runtime GeoJSON layer.
   * @throws {TypeError} When the source has no `url`.
   * @throws {HeuristApiError} When the fetch fails, returns a non-OK status, or invalid JSON.
   */
  async load(mapLayer, context) {
    const source = mapLayer.source;
    if (!source.url) {
      throw new TypeError('remote-geojson source requires url');
    }
    let response;
    try {
      response = await this.fetchImpl(source.url, {
        method: 'GET',
        headers: { Accept: 'application/geo+json, application/json' },
        signal: context.signal
      });
    } catch (error) {
      if (error?.name === 'AbortError' || context.signal?.aborted) {
        throw error;
      }
      throw new HeuristApiError(`Cannot load remote GeoJSON from ${source.url}`, {
        url: source.url,
        method: 'GET',
        cause: error
      });
    }

    if (!response.ok) {
      throw new HeuristApiError(
        `Remote GeoJSON request failed: ${response.status} ${response.statusText}`.trim(),
        { status: response.status, statusText: response.statusText, url: source.url, method: 'GET' }
      );
    }

    let geoJson;
    try {
      geoJson = await response.json();
    } catch (error) {
      throw new HeuristApiError(`Remote GeoJSON returned invalid JSON: ${source.url}`, {
        url: source.url,
        method: 'GET',
        cause: error
      });
    }

    return createGeoJsonRuntimeLayer(mapLayer, context, geoJson);
  }
}
