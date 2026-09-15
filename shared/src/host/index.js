/**
 * @file index.js
 * @brief Barrel export for the shared host-adapter and host-bridge facilities.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

export { HostAdapter } from './HostAdapter.js';
export { StandaloneHostAdapter } from './StandaloneHostAdapter.js';
export { getFrameHostBridge, getGlobalBootstrap } from './hostBridge.js';
