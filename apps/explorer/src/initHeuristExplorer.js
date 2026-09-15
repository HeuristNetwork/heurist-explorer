/**
 * @file initHeuristExplorer.js
 * @brief Creates the Explorer application and its public API, and exposes it globally.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-explorer
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { ExplorerApplication } from './core/ExplorerApplication.js';
import { HeuristExplorerPublicApi } from './host/HeuristExplorerPublicApi.js';

/**
 * Create, initialize, and expose the Explorer application as `window.heuristExplorer`.
 *
 * @param {object} config Normalized Explorer configuration; see `explorerConfig.js`.
 * @returns {Promise<HeuristExplorerPublicApi>} Resolves once the application has initialized.
 * @throws {Error} When `config.containerId` does not match an element in the document.
 */
export async function initHeuristExplorer(config) {
  const container = document.getElementById(config.containerId);
  if (!container) throw new Error(`#${config.containerId} was not found`);

  const application = new ExplorerApplication({ container, config });
  const api = new HeuristExplorerPublicApi(application);
  const ready = application.initialize().then(() => api);
  api.setReadyPromise(ready);
  globalThis.heuristExplorer = api;
  return ready;
}
