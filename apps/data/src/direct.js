/**
 * @file direct.js
 * @brief Public bootstrap used when Heurist Explorer hosts Data in the same realm.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-data
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import "#shared/ui/heurist-module.css";
import "./style.css";
import { extendLocale } from "#shared/ui";
import { createHeuristDataConfig } from "./dataConfig.js";
import { initHeuristData } from "./initHeuristData.js";

/**
 * Mount heurist-data directly into a same-realm container (Explorer's `direct` module mode),
 * bypassing the iframe/bootstrap-global bridge used by the standalone/embedded builds.
 *
 * @param {object} options Mount options.
 * @param {HTMLElement} options.container Element to mount Data into; assigned a generated id if it has none.
 * @param {object} [options.bootstrap] Bootstrap envelope (runtime/settings/state), as normally supplied via the host bridge.
 * @param {object|null} [options.bridge] Optional host bridge forwarded to the created configuration.
 * @param {string|null} [options.assetBaseUrl] Base URL Data's own assets (localization, icons) are loaded from.
 * @returns {Promise<object>} The initialized Data public API.
 * @throws {Error} When no container is supplied.
 */
export async function mountHeuristData({
  container,
  bootstrap = {},
  bridge = null,
  assetBaseUrl = null,
} = {}) {
  if (!container) throw new Error("A container is required to mount Heurist Data");
  const containerId = container.id || uniqueContainerId();
  container.id = containerId;
  container.classList.add("heurist-data-root");
  await extendLocale(bootstrap.runtime?.language, assetBaseUrl);
  const config = createHeuristDataConfig(bootstrap, { bridge, containerId });
  config.exposeGlobal = false;
  config.moduleAssetBaseUrl = assetBaseUrl;
  return initHeuristData(config);
}

/** Generate a container id not already present in the document. */
function uniqueContainerId() {
  let id;
  do id = `heurist-data-${++uniqueContainerId.counter}`;
  while (document.getElementById(id));
  return id;
}
uniqueContainerId.counter = 0;
