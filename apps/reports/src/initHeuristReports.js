/**
 * @file initHeuristReports.js
 * @brief Initializes the heurist-reports application (reports manager and editor).
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-reports
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { HeuristApiClient, JobClient } from '#shared/api';
import { ReportApi } from './data/ReportApi.js';
import { ReportsHostAdapter } from './host/ReportsHostAdapter.js';
import { HeuristReportsPublicApi } from './host/HeuristReportsPublicApi.js';
import { ReportsApplication } from './core/ReportsApplication.js';
import { ReportManager } from './ui/ReportManager.js';

/**
 * Create the API clients, application and view, and expose the public API
 * (`window.heuristReports` unless `config.exposeGlobal === false`).
 *
 * @param {object} config Normalized configuration; see `reportsConfig.js`.
 * @returns {Promise<HeuristReportsPublicApi>} Resolves once the list is shown.
 * @throws {Error} When `config.containerId` does not match an element in the document.
 */
export async function initHeuristReports(config) {
  const container = document.getElementById(config.containerId);
  if (!container) throw new Error(`Reports container #${config.containerId} was not found`);
  const apiClient = new HeuristApiClient({
    apiBaseUrl: config.apiBaseUrl || defaultApiBaseUrl(config.baseUrl),
    database: config.database,
    accessToken: config.accessToken,
    headers: config.requestHeaders
  });
  const application = new ReportsApplication({
    config,
    reportApi: new ReportApi({ apiClient }),
    jobClient: new JobClient({ apiClient }),
    host: new ReportsHostAdapter(config.bridge)
  });
  container.classList.add('heurist-reports-root');
  const view = new ReportManager().attach(container, { application });
  application.setView(view);

  const api = new HeuristReportsPublicApi(application);
  api.setReadyPromise(application.initialize());
  if (config.exposeGlobal !== false) globalThis.heuristReports = api;
  await api.ready();
  return api;
}

/** `<baseUrl>api` when only the Heurist base URL is known. */
function defaultApiBaseUrl(baseUrl) {
  const value = String(baseUrl || '').trim();
  if (!value) return null;
  return `${value.endsWith('/') ? value : `${value}/`}api`;
}
