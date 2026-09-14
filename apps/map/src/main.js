/**
 * main.js - Application entry point
 *
 * @fileOverview Starts the standalone mapping application, exposes its public API, and handles startup and hot-module cleanup.
 * @project     Heurist mapping application
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2026 Heurist Network
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @author      Artem Osmakov <osmakov@gmail.com>
 */

/**
 * @file main.js
 * @brief Entry point for the standalone Heurist Map application.
 *
 * @project     Standalone and embeddable mapping application for Heurist.
 * @link https://HeuristNetwork.org
 * @copyright (C) 2024 onwards Heurist Network
 * @license https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
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

import { showMapMessage } from './ui/mapMessages.js';
import { getHeuristMapConfig } from './mapConfig.js';
import { initHeuristMap } from './initHeuristMap.js';
import { initHeuristMapConfiguration } from './initHeuristMapConfiguration.js';
import { initLocale, $HR } from '#shared/ui';

// Leaflet.markercluster 1.x is distributed as a UMD plugin and expects a
// browser-global `L` while it is being evaluated. A static plugin import runs
// before this module body, so expose Leaflet first and load the plugin only
// afterwards.
const config = getHeuristMapConfig();
const messageContainer = document.getElementById(config.containerId);
const onWarning = (event) => showMapMessage(event.detail?.message);
const onError = (event) => showMapMessage(event.detail?.error || event.detail?.message, { error: true, title: 'Map error' });
messageContainer?.addEventListener('heurist-map-warning', onWarning);
messageContainer?.addEventListener('heurist-map-error', onError);

if (typeof window !== 'undefined') {
  window.L = L;
}

const bootstrap = Promise.all([
  initLocale(config.language, config.localeBaseUrl || moduleBaseUrl()),
  import('leaflet.markercluster'),
  import('leaflet-providers')
]).then(() => {
  return config.viewerMode === 'configuration'
    ? initHeuristMapConfiguration(config)
    : initHeuristMap(config);
});

bootstrap.catch(async (error) => {
  console.error('Cannot initialize Heurist Map', error);
  showMapMessage(error, { error: true, title: 'Unable to initialize the map' });

  // initHeuristMap exposes the facade before initialization so a partially
  // created engine can always be cleaned up after a startup failure.
  try {
    await window.heuristMap?.destroy();
  } catch (destroyError) {
    console.error('Cannot clean up Heurist Map after initialization failure', destroyError);
  }

  const container = document.getElementById(config.containerId);
  if (container) {
    container.textContent = $HR('Unable to initialize the map.');
    container.classList.add('heurist-map-error');
  }
});

function moduleBaseUrl() {
  return new URL('./', import.meta.url).href;
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    messageContainer?.removeEventListener('heurist-map-warning', onWarning);
    messageContainer?.removeEventListener('heurist-map-error', onError);
    window.heuristMap?.destroy();
    delete window.heuristMap;
  });
}
