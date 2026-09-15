/**
 * @file initHeuristMap.js
 * @brief Creates the map engine, host adapter, API providers, layer loaders, application
 *        controller, and stable public API.
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

import { MapApplication } from './core/MapApplication.js';
import { applyPersistedSettings } from './mapConfig.js';
import { createMapEngine } from './engine/createMapEngine.js';
import { createHostAdapter } from './host/createHostAdapter.js';
import { HeuristMapPublicApi } from './host/HeuristMapPublicApi.js';
import { HeuristApiClient } from '#shared/api';
import { MapDocumentProvider } from './data/MapDocumentProvider.js';
import { MapLayerProvider } from './data/MapLayerProvider.js';
import { QueryGeoDataProvider } from './data/QueryGeoDataProvider.js';
import { ThematicAttributeProvider } from './data/ThematicAttributeProvider.js';
import { RecordTypeProvider } from './data/RecordTypeProvider.js';
import { MapDocumentListProvider } from './data/MapDocumentListProvider.js';
import { PopupProvider } from './data/PopupProvider.js';
import { ReportTemplateProvider } from './data/ReportTemplateProvider.js';
import { MapControlPanel } from './ui/MapControlPanel.js';
import { MapConfigurationDialog } from './ui/config/MapConfigurationDialog.js';
import { createLayerLoaderRegistry } from './engine/loaders/createLayerLoaderRegistry.js';
import { DrawController } from './draw/DrawController.js';
import { DrawPanel } from './ui/DrawPanel.js';

/**
 * Initialize the standalone map and expose its stable same-origin public API.
 *
 * @param {Object} config Normalized runtime/application configuration.
 * @returns {Promise<HeuristMapPublicApi>}
 */
export async function initHeuristMap(config) {
  const container = document.getElementById(config.containerId);
  if (!container) {
    throw new Error(`Map container #${config.containerId} was not found`);
  }
  // The host page's #heurist-map div is a flex column shared with the optional
  // source header (see MapControlPanel's showSourceHeader). Leaflet takes
  // ownership of whatever container it is given (L.map(container)), so it
  // must render into its own child rather than into #heurist-map directly.
  const mapViewport = document.createElement('div');
  mapViewport.className = 'heurist-map-viewport';
  container.append(mapViewport);

  const mapEngine = createMapEngine(config.engine);
  const host = createHostAdapter(config.host);

  // A host that left the bootstrap settings empty (getHeuristMapConfig()
  // set loadPreferencesOnInit accordingly) never gets a second chance once
  // MapApplication's constructor has already derived documents/base maps/
  // dynamic-document state from bare defaults. Fetch and merge the user's
  // own `heurist-map` preference now, matching heurist-graph/heurist-data's
  // loadPreferencesOnInit self-heal. Best-effort: a host that can't serve
  // preferences (e.g. the standalone dev harness) must not block startup.
  if (config.loadPreferencesOnInit && typeof host.loadPreferences === 'function') {
    try {
      const saved = await host.loadPreferences();
      if (saved) config = applyPersistedSettings(config, saved);
    } catch { /* Fall back to bootstrap-supplied defaults. */ }
  }

  const apiClient = new HeuristApiClient({
    apiBaseUrl: config.apiBaseUrl,
    database: config.database,
    accessToken: config.accessToken,
    headers: config.requestHeaders
  });

  const recordTypes = new RecordTypeProvider({ apiClient });
  const heuristBaseUrl = resolveHeuristBaseUrl(config);
  const providers = {
    recordTypes,
    mapDocumentList: new MapDocumentListProvider({ apiClient, recordTypes }),
    mapDocument: new MapDocumentProvider({ apiClient }),
    mapLayer: new MapLayerProvider({ apiClient }),
    queryGeoData: new QueryGeoDataProvider({ apiClient }),
    thematicAttributes: new ThematicAttributeProvider({ apiClient }),
    popup: new PopupProvider({ baseUrl: heuristBaseUrl, database: config.database }),
    reportTemplates: new ReportTemplateProvider({ baseUrl: heuristBaseUrl, database: config.database })
  };
  const layerLoaders = createLayerLoaderRegistry({
    queryGeoData: providers.queryGeoData,
    thematicAttributes: providers.thematicAttributes
  });

  const application = new MapApplication({
    container: mapViewport,
    config,
    mapEngine,
    host,
    providers,
    layerLoaders
  });

  const drawController = new DrawController({
    mapEngine,
    dispatch: (name, detail) => application.dispatch(name, detail)
  });
  const publicApi = new HeuristMapPublicApi(application, drawController);
  publicApi.setConfigurationDialogFactory((options = {}) => {
    const dialog = new MapConfigurationDialog({
      ...options,
      reportTemplateProvider: providers.reportTemplates,
      onEditSymbology: options.onEditSymbology || ((value, editorOptions) => publicApi.editSymbology(value, editorOptions)),
      onEditExtent: options.onEditExtent || (typeof config.host?.bridge?.editExtent === 'function'
        ? ((bounds, editorOptions) => config.host.bridge.editExtent(bounds, editorOptions))
        : null)
    });
    dialog.open();
    return dialog;
  });
  let controlPanel = null;
  let drawPanel = null;
  const readyPromise = application.initialize().then(async () => {
    controlPanel = new MapControlPanel({
      api: publicApi,
      mapContainer: mapViewport,
      options: config.ui
    });
    controlPanel.mount();
    application.controlPanel = controlPanel;
    if (config.viewerMode === 'draw') {
      drawPanel = new DrawPanel({ api: publicApi, container: mapViewport }).mount();
      application.drawPanel = drawPanel;
    }

    if (apiClient.isConfigured()) {
      // Published state owns startup activation when it names a document. Do not
      // first activate mapDocuments.initiallyActive and then switch documents again.
      await publicApi.loadMapDocuments(config.documents.query, {
        activateFirst: config.viewerMode !== 'draw' && config.initialState?.activeDocumentId == null
      });
    }
    if (config.initialState) {
      await publicApi.restoreState(config.initialState);
    }
    return publicApi;
  });
  publicApi.setReadyPromise(readyPromise);

  // Narrow, stable API for same-origin iframe and direct host integrations.
  window.heuristMap = publicApi;

  return readyPromise;
}

/**
 * Resolve the Heurist site base URL used to build popup/report-template asset links.
 *
 * @param {object} [config] Normalized runtime/application configuration.
 * @returns {string|null} The trailing-slash-terminated base URL, or `null` when unresolvable.
 */
function resolveHeuristBaseUrl(config = {}) {
  const hostBaseUrl = String(config.host?.baseUrl || '').trim();
  if (hostBaseUrl) return hostBaseUrl.endsWith('/') ? hostBaseUrl : `${hostBaseUrl}/`;
  const apiBaseUrl = String(config.apiBaseUrl || '').trim().replace(/\/+$/, '');
  if (!apiBaseUrl) return null;
  const baseUrl = apiBaseUrl.replace(/\/api$/i, '');
  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
}
