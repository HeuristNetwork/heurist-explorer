/**
 * @file initHeuristGraphConfiguration.js
 * @brief Configuration-only start of heurist-graph (`viewerMode: 'configuration'`, plan 29 §12).
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

import { ReportTemplateProvider } from '#shared/data/ReportTemplateProvider.js';
import { smartyTemplateTerms } from '#shared/data/moduleConfigurationForm.js';
import { resolveHeuristBaseUrl } from '#shared/config';
import { HeuristGraphConfigurationApi } from './host/HeuristGraphConfigurationApi.js';

/**
 * Start the configuration-only API: no graph is made.
 *
 * @param {object} config Module configuration.
 * @returns {Promise<HeuristGraphConfigurationApi>} The configuration API, also `window.heuristGraph`.
 */
export async function initHeuristGraphConfiguration(config) {
  const reportTemplates = new ReportTemplateProvider({ baseUrl: resolveHeuristBaseUrl(config), database: config.database });
  const api = new HeuristGraphConfigurationApi({
    hostBridge: config.host?.bridge || null,
    termsProviders: { smartyTemplates: smartyTemplateTerms(reportTemplates) },
  });
  if (config.exposeGlobal !== false) globalThis.heuristGraph = api;
  return api;
}
