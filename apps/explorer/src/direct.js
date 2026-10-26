/**
 * @file direct.js
 * @brief Public bootstrap used when a host mounts Heurist Explorer in the same page (website pages, plan 27a).
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

import '@fortawesome/fontawesome-free/css/fontawesome.min.css';
import '@fortawesome/fontawesome-free/css/solid.min.css';
import '@fortawesome/fontawesome-free/css/regular.min.css';
import '#shared/ui/heurist-ui.css';
import './style.css';
import { normalizeModuleBootstrap } from '#shared/config';
import { extendLocale } from '#shared/ui';
import { createHeuristExplorerConfig } from './explorerConfig.js';
import { initHeuristExplorer } from './initHeuristExplorer.js';

/**
 * Mount heurist-explorer into a container of the host page (no `window.heuristExplorer`).
 *
 * @param {object} options Mount options.
 * @param {HTMLElement} options.container Element to mount Explorer into; assigned a generated id if it has none.
 * @param {object} [options.bootstrap] Bootstrap envelope (runtime/settings/state).
 * @param {object|null} [options.bridge] Optional host bridge.
 * @param {string|null} [options.assetBaseUrl] Base URL of Explorer's own assets (localization).
 * @returns {Promise<object>} The Explorer public API, once Explorer is ready.
 * @throws {Error} When no container is supplied.
 */
export async function mountHeuristExplorer({
  container,
  bootstrap = {},
  bridge = null,
  assetBaseUrl = null,
} = {}) {
  if (!container) throw new Error('A container is required to mount Heurist Explorer');
  container.id = container.id || uniqueContainerId();
  const config = createHeuristExplorerConfig(normalizeModuleBootstrap(bootstrap), { bridge, containerId: container.id });
  config.exposeGlobal = false;
  return initHeuristExplorer(config, { before: extendLocale(config.language, assetBaseUrl) });
}

/** Generate a container id not already present in the document. */
function uniqueContainerId() {
  let id;
  do id = `heurist-explorer-${++uniqueContainerId.counter}`;
  while (document.getElementById(id));
  return id;
}
uniqueContainerId.counter = 0;
