/**
 * @file configuration.js
 * @brief Configuration entry of heurist-map (plan 29): the configuration form JSON, defaults and
 *        settings normalizer, without the module itself. Hosts (Explorer, the website editor)
 *        import it to show the module's configuration form.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-map
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import form from "./ui/config/mapConfigurationForm.json" with { type: "json" };
import { createMapConfigurationDefaults } from "./ui/config/mapConfigurationDefaults.js";
import {
  normalizeMapConfigurationSettings,
  serializeMapConfigurationSettings,
} from "./ui/config/mapConfigurationSchema.js";

/** The configuration of heurist-map: form JSON, defaults, normalizer and serializer. */
export const mapConfiguration = Object.freeze({
  type: "map",
  form,
  defaults: createMapConfigurationDefaults,
  normalize: normalizeMapConfigurationSettings,
  serialize: serializeMapConfigurationSettings,
});
