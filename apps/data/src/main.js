/**
 * @file main.js
 * @brief Heurist Data browser entry point.
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

import "#shared/ui/heurist-ui.css";
import "#shared/ui/heurist-module.css";
import "./style.css";
import "@fortawesome/fontawesome-free/css/fontawesome.min.css";
import "@fortawesome/fontawesome-free/css/solid.min.css";
import "@fortawesome/fontawesome-free/css/regular.min.css";
import { getHeuristDataConfig } from "./dataConfig.js";
import { initHeuristData } from "./initHeuristData.js";
import { initHeuristDataConfiguration } from "./initHeuristDataConfiguration.js";
import { initLocale } from "#shared/ui";

const config = getHeuristDataConfig();
const startup = initLocale(
  config.language,
  config.localeBaseUrl || moduleBaseUrl(),
).then(() =>
  config.viewerMode === "configuration"
    ? initHeuristDataConfiguration(config)
    : initHeuristData(config),
);

/**
 * Resolve assets beside the deployed bundle, not beside dataViewer.html.
 *
 * @returns {string}
 */
function moduleBaseUrl() {
  return new URL("./", import.meta.url).href;
}

startup.catch((error) => {
  const container = document.getElementById("heurist-data");
  if (container) container.textContent = error?.message || String(error);
  console.error("Unable to initialize heurist-data", error);
});
