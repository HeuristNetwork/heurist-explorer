/**
 * @file main.js
 * @brief Bootstraps the timeline module and initializes the Heurist runtime.
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
import "./page.css";
import { showTimelineMessage } from "./ui/timelineMessages.js";
import "@fortawesome/fontawesome-free/css/fontawesome.min.css";
import "@fortawesome/fontawesome-free/css/solid.min.css";

import { getHeuristTimelineConfig } from "./timelineConfig.js";
import { initHeuristTimeline } from "./initHeuristTimeline.js";
import { initLocale, useHostHelp } from "#shared/ui";

const config = getHeuristTimelineConfig();
// in Explorer's iframe the help manual opens in Explorer's window (2026-10-14)
useHostHelp(config.host?.bridge);

// the locale also sets the asset base: without it the help manual is looked for at the
// server root (404) and the interface strings are not translated (2026-10-14)
initLocale(config.language, config.localeBaseUrl || moduleBaseUrl())
  .catch((error) => console.warn("Unable to load heurist-timeline localization", error))
  .then(() => initHeuristTimeline(config))
  .catch((error) => {
    showTimelineMessage(error, { error: true, title: "Unable to initialize the timeline" });
    const container = document.getElementById("heurist-timeline");
    if (container) {
      container.textContent = error?.message || String(error);
    }

    console.error("Unable to initialize heurist-timeline", error);
  });

/** Base URL of this bundle (its `assets/` and user manuals). */
function moduleBaseUrl() {
  return new URL("./", import.meta.url).href;
}


import '#shared/ui/documents/document-controls.css';
import '@fortawesome/fontawesome-free/css/regular.min.css';
