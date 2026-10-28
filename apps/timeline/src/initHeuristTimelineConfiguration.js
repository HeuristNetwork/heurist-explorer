/**
 * @file initHeuristTimelineConfiguration.js
 * @brief Configuration-only start of heurist-timeline (`viewerMode: 'configuration'`, plan 29 §12).
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-timeline
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { HeuristTimelineConfigurationApi } from './host/HeuristTimelineConfigurationApi.js';

/**
 * Start the configuration-only API: no timeline is made.
 *
 * @param {object} config Module configuration.
 * @returns {Promise<HeuristTimelineConfigurationApi>} The configuration API, also `window.heuristTimeline`.
 */
export async function initHeuristTimelineConfiguration(config) {
  const api = new HeuristTimelineConfigurationApi({ hostBridge: config.host?.bridge || null });
  if (config.exposeGlobal !== false) globalThis.heuristTimeline = api;
  return api;
}
