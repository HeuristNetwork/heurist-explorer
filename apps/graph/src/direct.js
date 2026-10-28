/**
 * @file direct.js
 * @brief Public bootstrap used when a host mounts Heurist Graph in the same page (website pages, plan 27a).
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-graph
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import "#shared/ui/heurist-ui.css";
import "#shared/ui/heurist-module.css";
import "./style.css";
import "@fortawesome/fontawesome-free/css/fontawesome.min.css";
import "@fortawesome/fontawesome-free/css/solid.min.css";
import { moduleLanguage, normalizeModuleBootstrap } from "#shared/config";
import { extendLocale } from "#shared/ui";
import { createHeuristGraphConfig } from "./graphConfig.js";
import { initHeuristGraph } from "./initHeuristGraph.js";

/**
 * Mount heurist-graph into a container of the host page. The graph puts its control panel
 * beside its element, so it renders into a frame inside the container (`.heurist-graph-direct`).
 *
 * @param {object} options Mount options.
 * @param {HTMLElement} options.container Element to mount the graph into.
 * @param {object} [options.bootstrap] Bootstrap envelope (runtime/settings/state).
 * @param {object|null} [options.bridge] Optional host bridge.
 * @param {string|null} [options.assetBaseUrl] Base URL of the graph's own assets (localization).
 * @returns {Promise<object>} The graph public API, once it is ready.
 * @throws {Error} When no container is supplied.
 */
export async function mountHeuristGraph({
  container,
  bootstrap = {},
  bridge = null,
  assetBaseUrl = null,
} = {}) {
  if (!container) throw new Error("A container is required to mount Heurist Graph");
  const frame = document.createElement("div");
  frame.className = "heurist-graph-direct";
  const element = document.createElement("main");
  element.id = uniqueContainerId();
  element.className = "heurist-graph";
  frame.append(element);
  container.replaceChildren(frame);
  await extendLocale(moduleLanguage(bootstrap), assetBaseUrl);
  const config = createHeuristGraphConfig(normalizeModuleBootstrap(bootstrap), { bridge, containerId: element.id });
  config.exposeGlobal = false;
  return initHeuristGraph(config);
}

/** Generate a container id not already present in the document. */
function uniqueContainerId() {
  let id;
  do id = `heurist-graph-${++uniqueContainerId.counter}`;
  while (document.getElementById(id));
  return id;
}
uniqueContainerId.counter = 0;
