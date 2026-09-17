/**
 * @file initHeuristData.js
 * @brief Initializes the Heurist Data application.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-data
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { HeuristApiClient } from "#shared/api";
import { DataApplication } from "./core/DataApplication.js";
import { QuerySourceProvider } from "#shared/data/QuerySourceProvider.js";
import { RecordDataProvider } from "./data/RecordDataProvider.js";
import { createDataEngine } from "./engine/createDataEngine.js";
import { createLoaderRegistry } from "./engine/loaders/createLoaderRegistry.js";
import { createHostAdapter } from "./host/createHostAdapter.js";
import { HeuristDataPublicApi } from "./host/HeuristDataPublicApi.js";
import { DataConfigurationDialog } from "./ui/config/DataConfigurationDialog.js";
import { ReportTemplateProvider } from "./data/ReportTemplateProvider.js";
import { DataControlPanel } from "./ui/DataControlPanel.js";
import { RecordContentProvider } from "./data/RecordContentProvider.js";

/**
 * Create providers, engine, host adapter, and application, mount the control panel,
 * and expose the result as `window.heuristData`.
 *
 * @param {object} config Normalized Data configuration; see `dataConfig.js`.
 * @returns {Promise<import('./host/HeuristDataPublicApi.js').HeuristDataPublicApi>} Resolves once the application and control panel are ready.
 * @throws {Error} When `config.containerId` does not match an element in the document.
 */
export async function initHeuristData(config) {
  const container = document.getElementById(config.containerId);
  if (!container)
    throw new Error(`Data container #${config.containerId} was not found`);
  const apiClient = new HeuristApiClient({
    apiBaseUrl: config.apiBaseUrl,
    database: config.database,
    accessToken: config.accessToken,
    headers: config.requestHeaders,
  });
  const heuristBaseUrl = resolveHeuristBaseUrl(config);
  const providers = {
    querySourceProvider: new QuerySourceProvider({ apiClient }),
    recordDataProvider: new RecordDataProvider({ apiClient }),
    recordContent: new RecordContentProvider({
      baseUrl: heuristBaseUrl,
      database: config.database,
    }),
  };
  const application = new DataApplication({
    container,
    config,
    engine: await createDataEngine(config.engine),
    engineFactory: createDataEngine,
    host: createHostAdapter(config.host),
    loaders: createLoaderRegistry(providers),
    providers,
  });
  const api = new HeuristDataPublicApi(application);
  const reportTemplates = new ReportTemplateProvider({
    baseUrl: heuristBaseUrl,
    database: config.database,
  });
  api.setConfigurationDialogFactory((options = {}) =>
    new DataConfigurationDialog({
      ...options,
      reportTemplateProvider: options.reportTemplateProvider || reportTemplates,
    }).open(),
  );
  const ready = application.initialize().then(() => api);
  let panel = null;
  const readyWithPanel = ready.then(async () => {
    const settings = config.persistedSettings;
    panel = new DataControlPanel({
      api,
      tableContainer: container,
      options: {
        ...settings.options.ui,
        helpBaseUrl: config.moduleAssetBaseUrl,
        runtimeMode: config.runtimeMode,
        readonly: config.readonly,
        editEnabled: config.engineOptions.interaction.editEnabled,
        currentResultsTitle: settings.config?.currentResults?.title,
      },
    });
    await panel.mount();
    return api;
  });
  const originalDestroy = api.destroy.bind(api);
  api.destroy = () => {
    panel?.destroy();
    return originalDestroy();
  };
  api.setReadyPromise(readyWithPanel);
  container.classList.add("heurist-data-root");
  if (config.exposeGlobal !== false) globalThis.heuristData = api;
  return readyWithPanel;
}

/** Resolve the legacy Heurist base URL (for report/publication asset links) from the host or API base URL. */
function resolveHeuristBaseUrl(config) {
  const hostBase = String(config.host?.baseUrl || "").trim();
  if (hostBase) return hostBase.endsWith("/") ? hostBase : `${hostBase}/`;
  const apiBase = String(config.apiBaseUrl || "")
    .trim()
    .replace(/\/+$/, "");
  const base = apiBase.replace(/\/api$/i, "");
  return base ? `${base}/` : null;
}
