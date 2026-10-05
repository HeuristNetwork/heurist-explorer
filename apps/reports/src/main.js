/**
 * @file main.js
 * @brief Heurist reports manager browser entry point (standalone or iframe).
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-reports
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import '#shared/ui/heurist-ui.css';
import '#shared/ui/heurist-module.css';
import './style.css';
import '@fortawesome/fontawesome-free/css/fontawesome.min.css';
import '@fortawesome/fontawesome-free/css/solid.min.css';
import '@fortawesome/fontawesome-free/css/regular.min.css';
import { HMsg, initLocale } from '#shared/ui';
import { getHeuristReportsConfig } from './reportsConfig.js';
import { initHeuristReports } from './initHeuristReports.js';

const config = getHeuristReportsConfig();
const bootstrap = initLocale(config.language, config.localeBaseUrl || moduleBaseUrl())
  .then(() => initHeuristReports(config));

/** Resolve assets beside the deployed bundle, not beside the host page. */
function moduleBaseUrl() {
  return new URL('./', import.meta.url).href;
}

bootstrap.catch((error) => {
  HMsg.showMsgErr(error?.message || String(error));
  const container = document.getElementById('heurist-reports');
  if (container) container.textContent = error?.message || String(error);
  console.error('Unable to initialize heurist-reports', error);
});
