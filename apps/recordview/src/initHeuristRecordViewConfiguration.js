/**
 * @file initHeuristRecordViewConfiguration.js
 * @brief Configuration-only start of heurist-recordview (`viewerMode: 'configuration'`, plan 29 §12).
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

import { ReportTemplateProvider } from '#shared/data/ReportTemplateProvider.js';
import { smartyTemplateTerms } from '#shared/data/moduleConfigurationForm.js';
import { resolveHeuristBaseUrl } from '#shared/config';
import { HeuristRecordViewConfigurationApi } from './host/HeuristRecordViewConfigurationApi.js';

/**
 * Start the configuration-only API: no recordview is made.
 *
 * @param {object} config Module configuration.
 * @returns {Promise<HeuristRecordViewConfigurationApi>} The configuration API, also `window.heuristRecordview`.
 */
export async function initHeuristRecordViewConfiguration(config) {
  const reportTemplates = new ReportTemplateProvider({ baseUrl: resolveHeuristBaseUrl(config), database: config.database });
  const api = new HeuristRecordViewConfigurationApi({
    hostBridge: config.host?.bridge || null,
    termsProviders: { smartyTemplates: smartyTemplateTerms(reportTemplates) },
  });
  if (config.exposeGlobal !== false) globalThis.heuristRecordview = api;
  return api;
}
