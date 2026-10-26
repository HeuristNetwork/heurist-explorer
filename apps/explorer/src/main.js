/**
 * @file main.js
 * @brief Entry point for the Heurist Explorer application.
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
import './page.css';
import { initLocale } from '#shared/ui';
import { getHeuristExplorerConfig } from './explorerConfig.js';

const config = getHeuristExplorerConfig();
const before = initLocale(config.language, config.localeBaseUrl || moduleBaseUrl());
// The public API is exposed at once - a legacy host polls for it from the
// frame's load event - and the application initializes once the locale is loaded.
// Editor mode (plan 21 §2.4): only the record editor; the workspace code is not loaded.
const startup = config.mode === 'editor'
  ? import('./editor/initRecordEditorShell.js').then(({ initRecordEditorShell }) => initRecordEditorShell(config, { before }))
  : import('./initHeuristExplorer.js').then(({ initHeuristExplorer }) => initHeuristExplorer(config, { before }));

/**
 * Resolve assets beside the deployed bundle, not beside the host page.
 *
 * Under `vite dev`, `import.meta.url` points at this module's location in the
 * dev server's module graph (`/src/main.js`), not at the served document root
 * where `public/` lives, so Vite's `BASE_URL` is resolved against the page.
 * A built bundle uses its own location: the page hosting it may live elsewhere
 * (the main Heurist UI loads hclient/modules/explorer/explorerViewer.html, while
 * the bundle and its assets are in hclient/bundles/heurist-explorer/).
 */
function moduleBaseUrl() {
  return import.meta.env.DEV
    ? new URL(import.meta.env.BASE_URL, window.location.href).href
    : new URL('./', import.meta.url).href;
}

startup.catch((error) => {
  const container = document.getElementById(config.containerId);
  if (container) container.textContent = error?.message || String(error);
  console.error('Unable to initialize heurist-explorer', error);
});
