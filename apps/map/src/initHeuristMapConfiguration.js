/**
 * @file initHeuristMapConfiguration.js
 * @brief Configuration-only bootstrap.
 *
 * Starts the reusable map configuration UI without creating a MapApplication,
 * map engine, Leaflet map, basemap, providers, or MapDocuments.
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

import { HeuristMapConfigurationApi } from './host/HeuristMapConfigurationApi.js';
import { createHostAdapter } from './host/createHostAdapter.js';
import { HeuristApiClient } from '#shared/api';
import { RecordTypeProvider } from './data/RecordTypeProvider.js';
import { MapDocumentListProvider } from './data/MapDocumentListProvider.js';
import { getLeafletBaseMapCatalog } from './engine/leaflet/LeafletBasemapCatalog.js';

/**
 * Initialize the configuration-only map bootstrap and expose its public API.
 *
 * @param {object} [config] Normalized runtime/application configuration.
 * @returns {Promise<HeuristMapConfigurationApi>} The configuration-only public API.
 */
export async function initHeuristMapConfiguration(config = {}) {
  // Configuration-only mode is commonly hosted in a transparent iframe over
  // another Heurist dialog. Mark the document so CSS can leave the iframe
  // canvas transparent while the configuration backdrop provides the modal
  // shading.
  if (typeof document !== 'undefined') {
    document.documentElement.classList.add('heurist-map-configuration-mode');
  }

  const apiClient = new HeuristApiClient({
    apiBaseUrl: config.apiBaseUrl,
    database: config.database,
    accessToken: config.accessToken,
    headers: config.requestHeaders
  });
  const recordTypes = new RecordTypeProvider({ apiClient });
  const mapDocumentListProvider = apiClient.isConfigured()
    ? new MapDocumentListProvider({ apiClient, recordTypes })
    : null;
  const publicApi = new HeuristMapConfigurationApi({
    mapDocumentListProvider,
    baseMapCatalog: getLeafletBaseMapCatalog(),
    hostBridge: config.host?.bridge || null,
    host: createHostAdapter(config.host)
  });
  window.heuristMap = publicApi;
  return publicApi;
}
