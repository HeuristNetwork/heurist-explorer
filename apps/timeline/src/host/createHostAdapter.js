/**
 * @file createHostAdapter.js
 * @brief Chooses the correct host adapter for standalone or embedded Heurist execution.
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

import { StandaloneHostAdapter } from "#shared/host";
import { HeuristTimelineHostAdapter } from "./HeuristTimelineHostAdapter.js";

/**
 * Returns the host adapter appropriate to the configured deployment mode.
 *
 * @param {object} [config] - Host runtime configuration.
 * @returns {object} A host adapter instance.
 */
export function createHostAdapter(config) {
  return config?.type === "heurist"
    ? new HeuristTimelineHostAdapter(config)
    : new StandaloneHostAdapter();
}

