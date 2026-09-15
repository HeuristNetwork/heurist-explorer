/**
 * @file HeuristTimelineHostAdapter.js
 * @brief Provides a Heurist-aware host adapter for embedded timeline integrations.
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

import { HostAdapter } from "#shared/host";

/**
 * Host adapter used when the timeline is embedded within the Heurist client runtime.
 */
export class HeuristTimelineHostAdapter extends HostAdapter {
  /**
   * Creates a Heurist host adapter configured for the timeline module.
   *
   * @param {{ bridge?: object, baseUrl?: string, database?: string|number|null, fetchImpl?: Function }} [options={}] - Host configuration.
   */
  constructor({ bridge = null, baseUrl = null, database = null, fetchImpl = null } = {}) {
    super({ bridge, baseUrl, database, fetchImpl, moduleType: "timeline" });
  }
}

