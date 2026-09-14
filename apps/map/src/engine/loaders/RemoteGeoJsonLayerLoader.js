/**
 * RemoteGeoJsonLayerLoader.js - Remote GeoJSON layer loader
 *
 * @fileOverview Fetches external GeoJSON resources, validates them, and produces normalized engine-neutral runtime layers.
 * @project     Heurist mapping application
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2026 Heurist Network
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @author      Artem Osmakov <osmakov@gmail.com>
 */

import { HeuristApiError } from '#shared/api';
import { createGeoJsonRuntimeLayer } from './GeoJsonLayerLoader.js';

function defaultFetch(...args) {
  return globalThis.fetch(...args);
}

/**
 * Loads external GeoJSON MapLayers through fetch.
 */
export class RemoteGeoJsonLayerLoader {
  /**
   * Create and initialize the class instance.
   */
  constructor({ fetchImpl = defaultFetch } = {}) {
    this.fetchImpl = fetchImpl;
  }

  /**
   * Load a MapLayer using the loader registered for its source type.
   * @returns {Promise<*>} Resolves when the operation completes.
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
