/**
 * @file HeuristDataConfigurationApi.js
 * @brief Configuration-only public API of heurist-data (plan 29 §12): settings without a running module.
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

import { HeuristModuleConfigurationApi } from "#shared/host/HeuristModuleConfigurationApi.js";
import { smartyTemplateTerms } from "#shared/data/moduleConfigurationForm.js";
import { dataConfiguration } from "../configuration.js";

/** Exposes configuration editing without starting the data application. */
export class HeuristDataConfigurationApi extends HeuristModuleConfigurationApi {
  /**
   * @param {object} [options] API configuration.
   * @param {object} [options.providers] Supporting providers (reportTemplates).
   * @param {object|null} [options.hostBridge] Host bridge (heurist-explorer opens the form in its window).
   */
  constructor({ providers = {}, hostBridge = null } = {}) {
    super({
      configuration: dataConfiguration,
      hostBridge,
      termsProviders: { smartyTemplates: smartyTemplateTerms(providers.reportTemplates) },
    });
    this.providers = providers;
  }
}
