/**
 * @file HeuristGraphConfigurationApi.js
 * @brief Configuration-only public API of heurist-graph (plan 29 §12): settings without a running module.
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

import { HeuristModuleConfigurationApi } from '#shared/host/HeuristModuleConfigurationApi.js';
import { graphConfiguration } from '../configuration.js';

/** Configuration API of heurist-graph without a running module (`viewerMode: 'configuration'`). */
export class HeuristGraphConfigurationApi extends HeuristModuleConfigurationApi {
  /**
   * @param {object} [options]
   * @param {object|null} [options.hostBridge] Host bridge (heurist-explorer opens the form in its window).
   * @param {Object<string, Function>} [options.termsProviders] `termsSource` lists (Smarty templates).
   */
  constructor({ hostBridge = null, termsProviders = {} } = {}) {
    super({ configuration: graphConfiguration, hostBridge, termsProviders });
  }
}
