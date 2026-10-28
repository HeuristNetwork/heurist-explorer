/**
 * @file configuration.js
 * @brief Configuration entry of heurist-data (plan 29): the configuration form JSON, defaults and
 *        settings normalizer, without the module itself. Hosts (Explorer, the website editor)
 *        import it to show the module's configuration form.
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

import form from "./ui/config/dataConfigurationForm.json" with { type: "json" };
import { createDataConfigurationDefaults } from "./ui/config/dataConfigurationDefaults.js";
import {
  normalizeDataConfigurationSettings,
  serializeDataConfigurationSettings,
} from "./ui/config/dataConfigurationSchema.js";

/**
 * The configuration of heurist-data: form JSON, defaults, normalizer, serializer and the
 * publication option *Preserve current state* (`preparePublication`, run by heurist-explorer's
 * publication form: without it the page has no state).
 */
export const dataConfiguration = Object.freeze({
  type: "data",
  form,
  defaults: createDataConfigurationDefaults,
  normalize: normalizeDataConfigurationSettings,
  serialize: serializeDataConfigurationSettings,
  preparePublication: ({ settings, state = null, publish = {} }) => ({
    settings,
    state: publish?.preserveState === false ? {} : state,
  }),
});
