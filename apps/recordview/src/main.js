/**
 * @file main.js
 * @brief Heurist Record View browser entry point.
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

import "#shared/ui/heurist-ui.css";
import "#shared/ui/heurist-module.css";
import "./style.css";
import { showRecordViewMessage } from "./ui/recordViewMessages.js";
import "@fortawesome/fontawesome-free/css/fontawesome.min.css";
import "@fortawesome/fontawesome-free/css/solid.min.css";
import { getHeuristRecordViewConfig } from "./recordViewConfig.js";
import { initHeuristRecordView } from "./initHeuristRecordView.js";
import { initLocale } from "#shared/ui";

const config = getHeuristRecordViewConfig();
const bootstrap = initLocale(
  config.language,
  config.localeBaseUrl || moduleBaseUrl(),
).then(() => initHeuristRecordView(config));

/**
 * Resolve assets beside the deployed bundle, not beside the legacy host page.
 *
 * @returns {string}
 */
function moduleBaseUrl() {
  return new URL("./", import.meta.url).href;
}

bootstrap.catch((error) => {
  showRecordViewMessage(error, { error: true, title: "Unable to initialize Record View" });
  const container = document.getElementById("heurist-recordview");
  if (container) container.textContent = error?.message || String(error);
  console.error("Unable to initialize heurist-recordview", error);
});
