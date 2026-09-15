/**
 * @file createMapEngine.js
 * @brief Creates the configured map engine adapter without exposing engine-specific
 *        implementation details to the application.
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

import { LeafletMapAdapter } from './LeafletMapAdapter.js';

/**
 * Create the configured map engine without exposing its implementation to the app.
 *
 * @param {string} engine Engine name; only `'leaflet'` is currently supported.
 * @returns {LeafletMapAdapter} The created engine adapter.
 * @throws {Error} When `engine` is not a known engine.
 */
export function createMapEngine(engine) {
  switch (engine) {
    case 'leaflet':
      return new LeafletMapAdapter();
    default:
      throw new Error(`Unsupported map engine: ${engine}`);
  }
}
