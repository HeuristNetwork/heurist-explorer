/**
 * @file createGraphEngine.js
 * @brief Creates the configured graph rendering engine.
 * @project     Heurist academic knowledge management system
 * @package     heurist-graph
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { VisNetworkAdapter } from "./visnetwork/VisNetworkAdapter.js";

export function createGraphEngine(name = "vis-network") {
  if (name === "vis-network") return new VisNetworkAdapter();
  throw new Error(`Unknown Heurist Graph engine: ${name}`);
}
