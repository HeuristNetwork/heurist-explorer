/**
 * @file configuration.js
 * @brief Configuration entry of heurist-graph (plan 29): the configuration form JSON, defaults and
 *        settings normalizer, without the module itself. Hosts (Explorer, the website editor)
 *        import it to show the module's configuration form.
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

import form from "./ui/config/graphConfigurationForm.json" with { type: "json" };
import { createGraphConfigurationDefaults } from "./ui/config/graphConfigurationDefaults.js";
import {
  normalizeGraphConfigurationSettings,
  serializeGraphConfigurationSettings,
} from "./ui/config/graphConfigurationSchema.js";

/** The configuration of heurist-graph: form JSON, defaults, normalizer and serializer. */
export const graphConfiguration = Object.freeze({
  type: "graph",
  form,
  defaults: createGraphConfigurationDefaults,
  normalize: normalizeGraphConfigurationSettings,
  serialize: serializeGraphConfigurationSettings,
});
