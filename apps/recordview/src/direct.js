/**
 * @file direct.js
 * @brief Public bootstrap used when Heurist Explorer hosts Record View in the same realm.
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

import "#shared/ui/heurist-module.css";
import "./style.css";
import { extendLocale } from "#shared/ui";
import { createHeuristRecordViewConfig } from "./recordViewConfig.js";
import { initHeuristRecordView } from "./initHeuristRecordView.js";

/**
 * Mount heurist-recordview directly into a same-realm container (Explorer's `direct` module mode),
 * bypassing the iframe/bootstrap-global bridge used by the standalone/embedded builds.
 *
 * @param {object} options Mount options.
 * @param {HTMLElement} options.container Element to mount Record View into; assigned a generated id if it has none.
 * @param {object} [options.bootstrap] Bootstrap envelope (runtime/settings/source/state), as normally supplied via the host bridge.
 * @param {object|null} [options.bridge] Optional host bridge forwarded to the created configuration.
 * @param {string|null} [options.assetBaseUrl] Base URL Record View's own assets (localization, icons) are loaded from.
 * @returns {Promise<object>} The initialized Record View public API.
 * @throws {Error} When no container is supplied.
 */
export async function mountHeuristRecordView({
  container,
  bootstrap = {},
  bridge = null,
  assetBaseUrl = null,
} = {}) {
  if (!container) throw new Error("A container is required to mount Record View");
  const containerId = container.id || uniqueContainerId();
  container.id = containerId;
  await extendLocale(bootstrap.runtime?.language, assetBaseUrl);
  const config = createHeuristRecordViewConfig(bootstrap, { bridge, containerId });
  config.exposeGlobal = false;
  config.moduleAssetBaseUrl = assetBaseUrl;
  return initHeuristRecordView(config);
}

/** Generate a container id not already present in the document. */
function uniqueContainerId() {
  let id;
  do id = `heurist-recordview-${++uniqueContainerId.counter}`;
  while (document.getElementById(id));
  return id;
}
uniqueContainerId.counter = 0;
