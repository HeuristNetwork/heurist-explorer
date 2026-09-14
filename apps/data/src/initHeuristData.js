/**
 * @file initHeuristData.js
 * @brief Initializes the Heurist Data application.
 * @project     Heurist academic knowledge management system
 * @package     heurist-data
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { HeuristApiClient } from "#shared/api";
import { DataApplication } from "./core/DataApplication.js";
import { DatasetProvider } from "./data/DatasetProvider.js";
import { RecordDataProvider } from "./data/RecordDataProvider.js";
import { createDataEngine } from "./engine/createDataEngine.js";
import { createLoaderRegistry } from "./engine/loaders/createLoaderRegistry.js";
import { createHostAdapter } from "./host/createHostAdapter.js";
import { HeuristDataPublicApi } from "./host/HeuristDataPublicApi.js";
import { DataConfigurationDialog } from "./ui/config/DataConfigurationDialog.js";
import { ReportTemplateProvider } from "./data/ReportTemplateProvider.js";
import { FilterProvider } from "./data/FilterProvider.js";
import { RecordTypeProvider } from "./data/RecordTypeProvider.js";
import { DatasetListProvider } from "./data/DatasetListProvider.js";
import { DataControlPanel } from "./ui/DataControlPanel.js";
import { RecordContentProvider } from "./data/RecordContentProvider.js";

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
  const recordTypes = new RecordTypeProvider({ apiClient });
  const heuristBaseUrl = resolveHeuristBaseUrl(config);
  const providers = {
    recordTypes,
    datasetList: new DatasetListProvider({ apiClient, recordTypes }),
    filterList: new FilterProvider({ apiClient }),
    datasetProvider: new DatasetProvider({ apiClient }),
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
      datasetListProvider: options.datasetListProvider || providers.datasetList,
      filterListProvider: options.filterListProvider || providers.filterList,
      reportTemplateProvider: options.reportTemplateProvider || reportTemplates,
      widgetListProvider: options.widgetListProvider || null,
    }).open(),
  );
  const ready = application.initialize().then(() => api);
  const datasetListProvider = providers.datasetList;
  const filterListProvider = providers.filterList;
  let panel = null;
  const readyWithPanel = ready.then(async () => {
    const settings = config.persistedSettings;
    panel = new DataControlPanel({
      api,
      tableContainer: container,
      options: {
        ...settings.options.ui,
        runtimeMode: config.runtimeMode,
        readonly: config.readonly,
        editEnabled: config.engineOptions.interaction.editEnabled,
        currentResultsTitle: settings.config.currentResults.title,
        allowAllDatasets: settings.options.datasets.allowAll,
        allowedDatasetIds: settings.options.datasets.allowed,
        allowAllFilters: settings.options.filters.allowAll,
        allowedFilterIds: settings.options.filters.allowed,
      },
      datasetListProvider,
      filterListProvider,
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
  globalThis.heuristData = api;
  return readyWithPanel;
}

function resolveHeuristBaseUrl(config) {
  const hostBase = String(config.host?.baseUrl || "").trim();
  if (hostBase) return hostBase.endsWith("/") ? hostBase : `${hostBase}/`;
  const apiBase = String(config.apiBaseUrl || "")
    .trim()
    .replace(/\/+$/, "");
  const base = apiBase.replace(/\/api$/i, "");
  return base ? `${base}/` : null;
}
