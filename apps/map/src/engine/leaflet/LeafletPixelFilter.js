/**
 * LeafletPixelFilter.js - Leaflet TileLayer.PixelFilter integration
 *
 * @fileOverview Loads the Leaflet-specific pixel-filter plugin while keeping
 * Leaflet globals and plugin details out of the engine-neutral map model.
 * @project     Heurist mapping application
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2026 Heurist Network
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @author      Artem Osmakov <osmakov@gmail.com>
 */

let pixelFilterLoadPromise = null;

/**
 * Ensure L.TileLayer.PixelFilter and L.tileLayerPixelFilter are registered.
 *
 * The upstream package is a legacy Leaflet plugin which expects a global `L`.
 * Vite otherwise keeps our Leaflet import module-scoped, so expose the same
 * Leaflet instance only for the duration of the plugin import.
 *
 * @param {Object} L Leaflet namespace used by LeafletMapAdapter.
 * @returns {Promise<void>} Resolves when the plugin is registered.
 */
export async function ensureLeafletPixelFilter(L) {
  if (typeof L?.tileLayerPixelFilter === 'function') {
    return;
  }

  if (!pixelFilterLoadPromise) {
    pixelFilterLoadPromise = (async () => {
      const hadGlobalLeaflet = Object.prototype.hasOwnProperty.call(globalThis, 'L');
      const previousLeaflet = globalThis.L;
      globalThis.L = L;

      try {
        await import('leaflet-tilelayer-pixelfilter');
      } finally {
        if (hadGlobalLeaflet) {
          globalThis.L = previousLeaflet;
        } else {
          delete globalThis.L;
        }
      }

      if (typeof L?.tileLayerPixelFilter !== 'function') {
        throw new Error('Leaflet TileLayer.PixelFilter plugin did not register correctly');
      }
    })().catch((error) => {
      pixelFilterLoadPromise = null;
      throw error;
    });
  }

  await pixelFilterLoadPromise;
}
