/**
 * @file direct.js
 * @brief Public bootstrap used when a host mounts Heurist Timeline in the same page (website pages, plan 27a).
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-timeline
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
import { normalizeModuleBootstrap } from "#shared/config";
import { extendLocale } from "#shared/ui";
import { createHeuristTimelineConfig } from "./timelineConfig.js";
import { initHeuristTimeline } from "./initHeuristTimeline.js";

/**
 * Mount heurist-timeline into a container of the host page. The timeline puts its toolbar
 * beside its element, so it renders into a frame inside the container
 * (`.heurist-timeline-direct`, the role of `body` in the timeline's own page).
 *
 * @param {object} options Mount options.
 * @param {HTMLElement} options.container Element to mount the timeline into.
 * @param {object} [options.bootstrap] Bootstrap envelope (runtime/settings/state).
 * @param {object|null} [options.bridge] Optional host bridge.
 * @param {string|null} [options.assetBaseUrl] Base URL of the timeline's own assets (localization).
 * @returns {Promise<object>} The timeline public API, once it is ready.
 * @throws {Error} When no container is supplied.
 */
export async function mountHeuristTimeline({
  container,
  bootstrap = {},
  bridge = null,
  assetBaseUrl = null,
} = {}) {
  if (!container) throw new Error("A container is required to mount Heurist Timeline");
  const frame = document.createElement("div");
  frame.className = "heurist-timeline-direct";
  const element = document.createElement("main");
  element.id = uniqueContainerId();
  frame.append(element);
  container.replaceChildren(frame);
  await extendLocale(bootstrap.runtime?.language, assetBaseUrl);
  const config = createHeuristTimelineConfig(normalizeModuleBootstrap(bootstrap), { bridge, containerId: element.id });
  config.exposeGlobal = false;
  return initHeuristTimeline(config);
}

/** Generate a container id not already present in the document. */
function uniqueContainerId() {
  let id;
  do id = `heurist-timeline-${++uniqueContainerId.counter}`;
  while (document.getElementById(id));
  return id;
}
uniqueContainerId.counter = 0;
