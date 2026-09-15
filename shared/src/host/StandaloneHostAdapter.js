/**
 * @file StandaloneHostAdapter.js
 * @brief No-op host for independent module execution outside any Heurist host.
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

import { HostAdapter } from './HostAdapter.js';

/** HostAdapter with no overrides, used when a module runs without any embedding host. */
export class StandaloneHostAdapter extends HostAdapter {}
