/**
 * @file configuration.js
 * @brief Configuration entry of heurist-recordview (plan 29): the configuration form JSON, defaults and
 *        settings normalizer, without the module itself. Hosts (Explorer, the website editor)
 *        import it to show the module's configuration form.
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

import form from "./ui/config/recordViewConfigurationForm.json" with { type: "json" };
import { createRecordViewConfigurationDefaults } from "./ui/config/recordViewConfigurationDefaults.js";
import {
  normalizeRecordViewConfigurationSettings,
  serializeRecordViewConfigurationSettings,
} from "./ui/config/recordViewConfigurationSchema.js";

/** The configuration of heurist-recordview: form JSON, defaults, normalizer and serializer. */
export const recordViewConfiguration = Object.freeze({
  type: "recordview",
  form,
  defaults: createRecordViewConfigurationDefaults,
  normalize: normalizeRecordViewConfigurationSettings,
  serialize: serializeRecordViewConfigurationSettings,
});
