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
import { initLocale } from '#shared/ui';
import { getHeuristExplorerConfig } from './explorerConfig.js';
import { initHeuristExplorer } from './initHeuristExplorer.js';

const config = getHeuristExplorerConfig();
const startup = initLocale(
  config.language,
  config.localeBaseUrl || moduleBaseUrl(),
).then(() => initHeuristExplorer(config));

/**
 * Resolve assets beside the deployed bundle, not beside the host page.
 *
 * `import.meta.url` alone is wrong here: under `vite dev` it points at this
 * module's location in the dev server's module graph (`/src/main.js`), not
 * at the served document root where `public/`, and the user-manual copies,
 * actually live. Resolving Vite's own `BASE_URL` against the current
 * document's location gives the right root in both dev and a built bundle
 * (where this script and the manuals are copied side by side).
 */
function moduleBaseUrl() {
  return new URL(import.meta.env.BASE_URL, window.location.href).href;
}

startup.catch((error) => {
  const container = document.getElementById(config.containerId);
  if (container) container.textContent = error?.message || String(error);
  console.error('Unable to initialize heurist-explorer', error);
});
