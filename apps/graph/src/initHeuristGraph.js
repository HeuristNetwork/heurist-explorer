import { showGraphMessage } from "./ui/graphMessages.js";
/**
 * @file initHeuristGraph.js
 * @brief Initializes the heurist-graph application.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-graph
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { HeuristApiClient } from "#shared/api";
import { GraphApplication } from "./core/GraphApplication.js";
import { GraphProvider } from "./data/GraphProvider.js";
import { createGraphEngine } from "./engine/createGraphEngine.js";
import { HeuristGraphPublicApi } from "./host/HeuristGraphPublicApi.js";
import { GraphControlPanel } from "./ui/GraphControlPanel.js";
import { createHostAdapter } from "./host/createHostAdapter.js";
import { RecordTypeProvider } from "#shared/data/RecordTypeProvider.js";
import { QuerySourceListProvider } from "#shared/data/QuerySourceListProvider.js";
import { QuerySourceProvider } from "#shared/data/QuerySourceProvider.js";
import { FilterProvider } from "./data/FilterProvider.js";
import { ReportTemplateProvider } from "./data/ReportTemplateProvider.js";
import { RecordContentProvider } from "./data/RecordContentProvider.js";
import { VocabularyProvider } from "#shared/data/VocabularyProvider.js";
import { GraphConfigurationDialog } from "./ui/config/GraphConfigurationDialog.js";

/**
 * Create providers, engine, host adapter, and application, mount the control panel,
 * and expose the result as `window.heuristGraph`.
 *
 * @param {object} config Normalized Graph configuration; see `graphConfig.js`.
 * @returns {Promise<import('./host/HeuristGraphPublicApi.js').HeuristGraphPublicApi>} Resolves once the application and control panel are ready.
 * @throws {Error} When `config.containerId` does not match an element in the document.
 */
export async function initHeuristGraph(config) {
  const container = document.getElementById(config.containerId);
  if (!container)
    throw new Error(`Graph container #${config.containerId} was not found`);
  const apiClient = new HeuristApiClient({
    apiBaseUrl: config.apiBaseUrl,
    database: config.database,
    accessToken: config.accessToken,
    headers: config.requestHeaders,
  });
  const heuristBaseUrl = resolveHeuristBaseUrl(config);
  const application = new GraphApplication({
    config,
    provider: new GraphProvider({ apiClient }),
    engine: createGraphEngine(config.engine),
    host: createHostAdapter(config.host),
    querySourceProvider: new QuerySourceProvider({ apiClient }),
    // Fetches server-rendered popup content for a Popup template
    recordContentProvider: new RecordContentProvider({
      baseUrl: heuristBaseUrl,
      database: config.database,
    }),
    // Resolves edge detail-type (dty_ID) and relation-type (trm_ID) labels
    // after each load, for the graph edge labels and the legend.
    vocabularyProvider: new VocabularyProvider({ apiClient }),
  });
  const api = new HeuristGraphPublicApi(application);
  api.addEventListener('heurist-graph-error', event => showGraphMessage(event.detail?.error || event.detail?.message, { error: true }));
  api.addEventListener('heurist-graph-warning', event => showGraphMessage(event.detail?.message));
  api.addEventListener('heurist-graph-message', event => showGraphMessage(event.detail?.message, { title: 'Graph' }));
  api.addEventListener('heurist-graph-loaded', () => {
    const limits = application.graph?.limits;
    if (limits?.edgesTruncated || limits?.truncated) {
      showGraphMessage('Graph is truncated; only links between loaded records are shown.');
    }
  });
  const canvas = document.createElement("div");
  canvas.className = "heurist-graph-canvas";
  const message = document.createElement("div");
  message.className = "heurist-graph-message";
  message.hidden = true;
  container.replaceChildren(canvas, message);
  const recordTypes = new RecordTypeProvider({ apiClient });
  const querySourceListProvider = new QuerySourceListProvider({
    apiClient, recordTypes,
    onUnavailable: () => application.disableQuerySourceEditing(),
  });
  const filterListProvider = new FilterProvider({ apiClient });
  const reportTemplateProvider = new ReportTemplateProvider({
    baseUrl: heuristBaseUrl,
    database: config.database,
  });
  api.setConfigurationDialogFactory((options = {}) => new GraphConfigurationDialog({
    ...options,
    querySourceListProvider,
    filterListProvider,
    reportTemplateProvider,
  }).open());
  const ready = application.initialize(canvas, { messageElement: message }).then(async () => {
    await new GraphControlPanel({
      api,
      container,
      options: {
        ...config.ui,
        runtimeMode: config.runtimeMode,
        currentResultsTitle: config.persistedSettings?.config?.currentResults?.title,
      },
      querySourceListProvider,
      querySourceProvider: new QuerySourceProvider({ apiClient }),
      filterListProvider,
    }).mount();
    return api;
  });
  api.setReadyPromise(ready);
  globalThis.heuristGraph = api;
  return ready;
}

/** Resolve the embedding Heurist site's root URL for template/content requests. */
function resolveHeuristBaseUrl(config) {
  const hostBase = String(config.host?.baseUrl || "").trim();
  if (hostBase) return hostBase.endsWith("/") ? hostBase : `${hostBase}/`;
  const apiBase = String(config.apiBaseUrl || "")
    .trim()
    .replace(/\/+$/, "");
  const base = apiBase.replace(/\/api$/i, "");
  return base ? `${base}/` : null;
}
