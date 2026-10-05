/**
 * @file reportsConfig.js
 * @brief Bootstrap normalization for heurist-reports.
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

import { getFrameHostBridge, getGlobalBootstrap } from '#shared/host';
import { resolveModuleBootstrap } from '#shared/config';

/**
 * Build the configuration from the host bridge (iframe) or the standalone bootstrap.
 *
 * @returns {object} Normalized Reports configuration.
 */
export function getHeuristReportsConfig() {
  const bridge = getFrameHostBridge('heuristReportsHost');
  const bootstrap = resolveModuleBootstrap({
    bridge,
    standalone: getGlobalBootstrap('heuristModuleBootstrap')
  });
  return createHeuristReportsConfig(bootstrap, { bridge });
}

/**
 * Normalize an explicit bootstrap envelope (Explorer's direct mount, tests).
 *
 * @param {object} [bootstrap] Bootstrap envelope: `runtime` (database, apiBaseUrl, baseUrl,
 *        language, accessToken, requestHeaders) and optional `state.report` to open.
 * @param {{bridge?: object|null, containerId?: string}} [options]
 * @returns {object} Normalized Reports configuration.
 */
export function createHeuristReportsConfig(bootstrap = {}, { bridge = null, containerId = 'heurist-reports' } = {}) {
  const runtime = bootstrap.runtime || {};
  const language = String(runtime.language || 'eng').slice(0, 3).toLowerCase();
  return {
    containerId,
    runtimeMode: String(runtime.runtimeMode || 'standalone').toLowerCase(),
    database: runtime.database || null,
    apiBaseUrl: runtime.apiBaseUrl || null,
    baseUrl: runtime.baseUrl || null,
    accessToken: runtime.accessToken || null,
    requestHeaders: runtime.requestHeaders || {},
    language: /^[a-z]{3}$/.test(language) ? language : 'eng',
    localeBaseUrl: runtime.localeBaseUrl || runtime.moduleBaseUrl || null,
    bridge,
    initialReport: bootstrap.state?.report ?? null
  };
}
