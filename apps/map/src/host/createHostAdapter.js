/**
 * createHostAdapter.js - Host adapter factory
 *
 * @fileOverview Returns a supplied host integration or creates the standalone host adapter.
 * @project     Heurist mapping application
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2026 Heurist Network
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @author      Artem Osmakov <osmakov@gmail.com>
 */

import { StandaloneHostAdapter } from '#shared/host';
import { HeuristHostAdapter } from './HeuristHostAdapter.js';

/**
 * Create host adapter.
 *
 * @returns {*} Function result.
 */
export function createHostAdapter(host) {
  if (host?.type === 'heurist') {
    return new HeuristHostAdapter(host);
  }
  if (host) {
    return host;
  }

  return new StandaloneHostAdapter();
}
