/**
 * @file direct.js
 * @brief Public bootstrap used when a host mounts Heurist Map in the same page (website pages, plan 27a).
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-map
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import '#shared/ui/heurist-ui.css';
import '#shared/ui/heurist-module.css';
import './style.css';
import './assets/jquery-ui.icon-font.css';
import '@fortawesome/fontawesome-free/css/fontawesome.min.css';
import '@fortawesome/fontawesome-free/css/solid.min.css';
import '@fortawesome/fontawesome-free/css/regular.min.css';

import { moduleLanguage, normalizeModuleBootstrap } from '#shared/config';
import { extendLocale } from '#shared/ui';
import { createHeuristMapConfig } from './mapConfig.js';
import { initHeuristMap } from './initHeuristMap.js';

/**
 * Mount heurist-map into a container of the host page. Several maps can share a page:
 * each gets its own container id and no `window.heuristMap` is set.
 *
 * @param {object} options Mount options.
 * @param {HTMLElement} options.container Element to mount the map into; assigned a generated id if it has none.
 * @param {object} [options.bootstrap] Bootstrap envelope (runtime/settings/state).
 * @param {object|null} [options.bridge] Optional host bridge.
 * @param {string|null} [options.assetBaseUrl] Base URL of the map's own assets (localization).
 * @returns {Promise<object>} The map public API, once the map is ready.
 * @throws {Error} When no container is supplied.
 */
export async function mountHeuristMap({
  container,
  bootstrap = {},
  bridge = null,
  assetBaseUrl = null,
} = {}) {
  if (!container) throw new Error('A container is required to mount Heurist Map');
  container.id = container.id || uniqueContainerId();
  // Leaflet.markercluster is a UMD plugin that expects a global `L` while it is evaluated
  window.L = window.L || L;
  await Promise.all([
    extendLocale(moduleLanguage(bootstrap), assetBaseUrl),
    import('leaflet.markercluster'),
    import('leaflet-providers')
  ]);
  const config = createHeuristMapConfig(normalizeModuleBootstrap(bootstrap), { bridge, containerId: container.id });
  config.exposeGlobal = false;
  return initHeuristMap(config);
}

/** Generate a container id not already present in the document. */
function uniqueContainerId() {
  let id;
  do id = `heurist-map-${++uniqueContainerId.counter}`;
  while (document.getElementById(id));
  return id;
}
uniqueContainerId.counter = 0;
