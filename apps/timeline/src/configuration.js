/**
 * @file configuration.js
 * @brief Configuration entry of heurist-timeline (plan 29): the configuration form JSON, defaults and
 *        settings normalizer, without the module itself. Hosts (Explorer, the website editor)
 *        import it to show the module's configuration form.
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

import form from "./ui/config/timelineConfigurationForm.json" with { type: "json" };
import { createTimelineConfigurationDefaults } from "./ui/config/timelineConfigurationDefaults.js";
import {
  normalizeTimelineConfigurationSettings,
  serializeTimelineConfigurationSettings,
} from "./ui/config/timelineConfigurationSchema.js";

/** The configuration of heurist-timeline: form JSON, defaults, normalizer and serializer. */
export const timelineConfiguration = Object.freeze({
  type: "timeline",
  form,
  defaults: createTimelineConfigurationDefaults,
  normalize: normalizeTimelineConfigurationSettings,
  serialize: serializeTimelineConfigurationSettings,
});
