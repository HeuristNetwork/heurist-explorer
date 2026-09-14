/**
 * createMapEngine.js - Map engine factory
 *
 * @fileOverview Creates the configured map engine adapter without exposing engine-specific implementation details to the application.
 * @project     Heurist mapping application
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2026 Heurist Network
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @author      Artem Osmakov <osmakov@gmail.com>
 */

import { LeafletMapAdapter } from './LeafletMapAdapter.js';

/**
 * Create the configured map engine without exposing its implementation to the app.
 */
export function createMapEngine(engine) {
  switch (engine) {
    case 'leaflet':
      return new LeafletMapAdapter();
    default:
      throw new Error(`Unsupported map engine: ${engine}`);
  }
}
