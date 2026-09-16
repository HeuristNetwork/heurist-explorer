/**
 * @file createHostAdapter.js
 * @brief Creates the host adapter for standalone or embedded operation.
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

import { StandaloneHostAdapter } from "#shared/host";
import { HeuristRecordViewHostAdapter } from "./HeuristRecordViewHostAdapter.js";

/**
 * Select the host adapter for the given bootstrap host descriptor.
 *
 * @param {object|null} host Bootstrap `host` field; `{type: 'heurist', ...}` for a legacy Heurist host.
 * @returns {object} A `HeuristRecordViewHostAdapter`, the raw `host` object, or a `StandaloneHostAdapter`.
 */
export function createHostAdapter(host) {
  if (host?.type === "heurist") return new HeuristRecordViewHostAdapter(host);
  if (host) return host;
  return new StandaloneHostAdapter();
}
