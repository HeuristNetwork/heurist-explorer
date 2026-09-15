/**
 * @file main.js
 * @brief Heurist Graph browser entry point.
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
import { showGraphMessage } from "./ui/graphMessages.js";
import "@fortawesome/fontawesome-free/css/fontawesome.min.css";
import "@fortawesome/fontawesome-free/css/solid.min.css";
import { getHeuristGraphConfig } from "./graphConfig.js";
import { initHeuristGraph } from "./initHeuristGraph.js";
import { initLocale } from "#shared/ui";

const config = getHeuristGraphConfig();
const bootstrap = initLocale(
  config.language,
  config.localeBaseUrl || moduleBaseUrl(),
).then(() => initHeuristGraph(config));

function moduleBaseUrl() {
  // Resolve assets beside the deployed bundle, not beside dataViewer.html.
  return new URL("./", import.meta.url).href;
}

bootstrap.catch((error) => {
  showGraphMessage(error, { error: true, title: "Unable to initialize the graph" });
  const container = document.getElementById("heurist-graph");
  if (container) container.textContent = error?.message || String(error);
  console.error("Unable to initialize heurist-graph", error);
});
