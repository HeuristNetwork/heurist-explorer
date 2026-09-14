/**
 * @file createHostAdapter.js
 * @brief Creates the host adapter for standalone or embedded operation.
 * @project     Heurist academic knowledge management system
 * @package     heurist-data
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { StandaloneHostAdapter } from "#shared/host";
import { HeuristGraphHostAdapter } from "./HeuristGraphHostAdapter.js";

export function createHostAdapter(host) {
  if (host?.type === "heurist") return new HeuristGraphHostAdapter(host);
  if (host) return host;
  return new StandaloneHostAdapter();
}
