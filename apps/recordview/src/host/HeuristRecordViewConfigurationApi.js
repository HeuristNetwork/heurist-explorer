/**
 * @file HeuristRecordViewConfigurationApi.js
 * @brief Configuration-only public API of heurist-recordview (plan 29 §12): settings without a running module.
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

import { HeuristModuleConfigurationApi } from '#shared/host/HeuristModuleConfigurationApi.js';
import { recordViewConfiguration } from '../configuration.js';

/** Configuration API of heurist-recordview without a running module (`viewerMode: 'configuration'`). */
export class HeuristRecordViewConfigurationApi extends HeuristModuleConfigurationApi {
  /**
   * @param {object} [options]
   * @param {object|null} [options.hostBridge] Host bridge (heurist-explorer opens the form in its window).
   * @param {Object<string, Function>} [options.termsProviders] `termsSource` lists (Smarty templates).
   */
  constructor({ hostBridge = null, termsProviders = {} } = {}) {
    super({ configuration: recordViewConfiguration, hostBridge, termsProviders });
  }
}
