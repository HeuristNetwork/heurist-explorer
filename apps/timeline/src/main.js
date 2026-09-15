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
import { showTimelineMessage } from "./ui/timelineMessages.js";
import "@fortawesome/fontawesome-free/css/fontawesome.min.css";
import "@fortawesome/fontawesome-free/css/solid.min.css";

import { getHeuristTimelineConfig } from "./timelineConfig.js";
import { initHeuristTimeline } from "./initHeuristTimeline.js";

const config = getHeuristTimelineConfig();

initHeuristTimeline(config).catch((error) => {
  showTimelineMessage(error, { error: true, title: "Unable to initialize the timeline" });
  const container = document.getElementById("heurist-timeline");
  if (container) {
    container.textContent = error?.message || String(error);
  }

  console.error("Unable to initialize heurist-timeline", error);
});

