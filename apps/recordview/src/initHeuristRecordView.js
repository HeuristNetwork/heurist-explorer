/**
 * @file initHeuristRecordView.js
 * @brief Initializes the heurist-recordview application.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-recordview
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */
import { showRecordViewMessage } from "./ui/recordViewMessages.js";
import { HeuristApiClient } from "#shared/api";
import { RecordViewApplication } from "./core/RecordViewApplication.js";
import { RecordDataProvider } from "./data/RecordDataProvider.js";
import { VocabularyProvider } from "./data/VocabularyProvider.js";
import { RecordContentProvider } from "./data/RecordContentProvider.js";
import { ReportTemplateProvider } from "./data/ReportTemplateProvider.js";
import { HeuristRecordViewPublicApi } from "./host/HeuristRecordViewPublicApi.js";
import { RecordViewRenderer } from "./ui/RecordViewRenderer.js";
import { RecordViewControlPanel } from "./ui/RecordViewControlPanel.js";
import { createHostAdapter } from "./host/createHostAdapter.js";
import { RecordViewConfigurationDialog } from "./ui/config/RecordViewConfigurationDialog.js";

/**
 * Create providers, host adapter, and application, mount the control panel,
 * and expose the result as `window.heuristRecordview`.
 *
 * @param {object} config Normalized Record View configuration; see `recordViewConfig.js`.
 * @returns {Promise<import('./host/HeuristRecordViewPublicApi.js').HeuristRecordViewPublicApi>} Resolves once the application and control panel are ready.
 * @throws {Error} When `config.containerId` does not match an element in the document.
 */
export async function initHeuristRecordView(config) {
  const container = document.getElementById(config.containerId);
  if (!container) throw new Error(`Record View container #${config.containerId} was not found`);
  const apiClient = new HeuristApiClient({
    apiBaseUrl: config.apiBaseUrl,
    database: config.database,
    accessToken: config.accessToken,
    headers: config.requestHeaders,
  });
  const heuristBaseUrl = resolveHeuristBaseUrl(config);

  const controlPanelHost = document.createElement("div");
  controlPanelHost.className = "heurist-recordview-panel-host";
  const body = document.createElement("div");
  body.className = "heurist-recordview-content";
  container.replaceChildren(controlPanelHost, body);

  const application = new RecordViewApplication({
    config,
    recordDataProvider: new RecordDataProvider({ apiClient }),
    vocabularyProvider: new VocabularyProvider({ apiClient }),
    recordContentProvider: new RecordContentProvider({ baseUrl: heuristBaseUrl, database: config.database }),
    renderer: new RecordViewRenderer({ container: body }),
    host: createHostAdapter(config.host),
  });
  const api = new HeuristRecordViewPublicApi(application);
  api.addEventListener("heurist-recordview-error", (event) =>
    showRecordViewMessage(event.detail?.error || event.detail?.message, { error: true }),
  );

  const reportTemplateProvider = new ReportTemplateProvider({ baseUrl: heuristBaseUrl, database: config.database });
  api.setConfigurationDialogFactory((options = {}) =>
    new RecordViewConfigurationDialog({ ...options, reportTemplateProvider }).open(),
  );

  const controlPanel = new RecordViewControlPanel({
    api,
    options: {
      showOptions: config.options.ui.showOptions,
      showPublish: config.options.ui.showPublish,
      showHeader: config.persistedSettings.config.defaults.showHeader,
      headerTitle: config.persistedSettings.config.defaults.headerTitle,
      readonly: config.options.interaction.readonly,
    },
  });

  const ready = application.initialize().then(async () => {
    controlPanel.mount(controlPanelHost);
    return api;
  });
  api.setReadyPromise(ready);
  globalThis.heuristRecordview = api;
  return ready;
}

/** Resolve the embedding Heurist site's root URL for legacy/Smarty renderer requests. */
function resolveHeuristBaseUrl(config) {
  const hostBase = String(config.host?.baseUrl || "").trim();
  if (hostBase) return hostBase.endsWith("/") ? hostBase : `${hostBase}/`;
  const apiBase = String(config.apiBaseUrl || "").trim().replace(/\/+$/, "");
  const base = apiBase.replace(/\/api$/i, "");
  return base ? `${base}/` : null;
}
