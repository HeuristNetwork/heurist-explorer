/**
 * @file initHeuristTimeline.js
 * @brief Initializes the timeline runtime and binds it to the host container.
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

import { HeuristApiClient } from "#shared/api";
import { createHostAdapter } from "./host/createHostAdapter.js";
import { validateTimelineConfig } from "./validateTimelineConfig.js";
import { showTimelineMessage } from "./ui/timelineMessages.js";

/**
 * Initializes the timeline application for the supplied container and runtime settings.
 *
 * @param {object} config - Timeline runtime configuration.
 * @returns {Promise<object>} A promise resolving to the public timeline API.
 * @throws {Error} If the config is invalid or the required DOM container is missing.
 */
export async function initHeuristTimeline(config) {
  const { config: safeConfig, container } = validateTimelineConfig(config);

  const [
    { TimelineApplication },
    { TemporalDataProvider },
    { VisTimelineEngine },
    { HeuristTimelinePublicApi },
    { TimelineToolbar },
  ] = await Promise.all([
    import("./core/TimelineApplication.js"),
    import("./data/TemporalDataProvider.js"),
    import("./engine/vis/VisTimelineEngine.js"),
    import("./host/HeuristTimelinePublicApi.js"),
    import("./ui/TimelineToolbar.js"),
  ]);

  const apiClient = new HeuristApiClient({
    apiBaseUrl: safeConfig.apiBaseUrl,
    database: safeConfig.database,
    accessToken: safeConfig.accessToken,
    headers: safeConfig.requestHeaders,
  });

  const application = new TimelineApplication({
    container,
    config: safeConfig,
    engine: new VisTimelineEngine(),
    host: createHostAdapter(safeConfig.host),
    provider: new TemporalDataProvider({ apiClient }),
  });

  const api = new HeuristTimelinePublicApi(application);
  api.addEventListener('heurist-timeline-error', (event) => {
    showTimelineMessage(event.detail?.error || event.detail?.message, { error: true });
  });
  api.addEventListener('heurist-timeline-warning', (event) => {
    showTimelineMessage(event.detail?.message);
  });
  api.addEventListener('heurist-timeline-message', (event) => {
    showTimelineMessage(event.detail?.message, { title: 'Timeline' });
  });

  const toolbar = new TimelineToolbar({ api, settings: safeConfig.settings });
  toolbar.mount(container);

  const ready = application.initialize().then(() => api);
  api.setReadyPromise(ready);

  const originalDestroy = api.destroy.bind(api);
  api.destroy = () => {
    toolbar.destroy();
    return originalDestroy();
  };

  globalThis.heuristTimeline = api;
  return ready;
}
