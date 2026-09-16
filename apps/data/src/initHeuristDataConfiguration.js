/**
 * @file initHeuristDataConfiguration.js
 * @brief Initializes the Heurist Data configuration editor.
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

import { HeuristDataConfigurationApi } from "./host/HeuristDataConfigurationApi.js";
import { ReportTemplateProvider } from "./data/ReportTemplateProvider.js";
import { HeuristApiClient } from "#shared/api";
import { RecordTypeProvider } from "#shared/data/RecordTypeProvider.js";
import { DatasetListProvider } from "./data/DatasetListProvider.js";
import { FilterProvider } from "./data/FilterProvider.js";

/** Start the small configuration-only build without creating DataTables. */
export async function initHeuristDataConfiguration(config) {
  const bridge = config.host?.bridge || null;
  const apiClient = new HeuristApiClient({
    apiBaseUrl: config.apiBaseUrl,
    database: config.database,
    accessToken: config.accessToken,
    headers: config.requestHeaders,
  });
  const recordTypes = new RecordTypeProvider({ apiClient });
  const providers = {
    datasetList: new DatasetListProvider({ apiClient, recordTypes }),
    filterList: new FilterProvider({ apiClient }),
    reportTemplates: new ReportTemplateProvider({
      baseUrl: resolveHeuristBaseUrl(config),
      database: config.database,
    }),
    widgetList: null,
  };
  const api = new HeuristDataConfigurationApi({
    providers,
    hostBridge: bridge,
  });
  globalThis.heuristData = api;
  return api;
}
/** Resolve the legacy Heurist base URL (for report template assets) from the host or API base URL. */
function resolveHeuristBaseUrl(config) {
  const hostBase = String(config.host?.baseUrl || "").trim();
  if (hostBase) return hostBase.endsWith("/") ? hostBase : `${hostBase}/`;
  const apiBase = String(config.apiBaseUrl || "")
    .trim()
    .replace(/\/+$/, "");
  const base = apiBase.replace(/\/api$/i, "");
  return base ? `${base}/` : null;
}
