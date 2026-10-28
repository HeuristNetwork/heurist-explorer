/**
 * @file HeuristModuleConfigurationApi.js
 * @brief The configuration API of a presentation module without a running module (plan 29 §12):
 *        defaults, normalize / serialize, validation, the description for an AI agent and the
 *        configuration form. Base of every `Heurist*ConfigurationApi` and of HeuristModulePublicApi.
 *
 * Made from the configuration entry of the module (`src/configuration.js` of each app):
 *
 *   class HeuristGraphConfigurationApi extends HeuristModuleConfigurationApi {
 *     constructor(options) { super({ ...options, configuration: graphConfiguration }); }
 *   }
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { createConfigurationDialogFactory } from '../ui/config/moduleConfigurationDialogFactory.js';
import { describeModuleConfiguration, validateModuleSettings } from '../data/moduleConfigurationForm.js';

/** Configuration API of a module: settings without a running module. */
export class HeuristModuleConfigurationApi {
  /**
   * @param {object} options
   * @param {{type: string, form: object, defaults: Function, normalize: Function, serialize: Function}} options.configuration
   *        The module's configuration entry.
   * @param {object|null} [options.hostBridge] Host bridge (heurist-explorer opens the form in its window).
   * @param {Object<string, Function>} [options.termsProviders] `termsSource` lists of the form in this window.
   * @param {object} [options.formOptions] More HEditForm options of the form in this window (special editors).
   * @param {Function|false|null} [options.dialogFactory] Dialog factory; default createConfigurationDialogFactory,
   *        `false`: none yet (set later with setConfigurationDialogFactory).
   */
  constructor({ configuration, hostBridge = null, termsProviders = {}, formOptions = {}, dialogFactory = null } = {}) {
    if (!configuration?.type) throw new Error('A module configuration entry is required');
    this.configuration = configuration;
    this.hostBridge = hostBridge || null;
    this.configurationDialog = null;
    this.configurationDialogFactory = dialogFactory === false ? null
      : typeof dialogFactory === 'function' ? dialogFactory
        : createConfigurationDialogFactory({ configuration, bridge: this.hostBridge, termsProviders, formOptions });
  }

  /**
   * Set the factory of the configuration form (the module's start makes it with its services).
   *
   * @param {Function|null} factory `(options) → {result, close}`.
   * @returns {void}
   */
  setConfigurationDialogFactory(factory) {
    this.configurationDialogFactory = typeof factory === 'function' ? factory : null;
  }

  /**
   * Resolves at once: no asynchronous start.
   *
   * @returns {Promise<HeuristModuleConfigurationApi>} This instance.
   */
  ready() {
    return Promise.resolve(this);
  }

  /**
   * The default settings of the module.
   *
   * @returns {{format: string, version: number, options: object, config: object}} Settings envelope.
   */
  getConfigurationDefaults() {
    return this.configuration.serialize(this.configuration.defaults());
  }

  /**
   * Settings checked and completed with the defaults.
   *
   * @param {object} [value] Raw settings.
   * @returns {{options: object, config: object}} Normalized settings.
   */
  normalizeConfiguration(value = {}) {
    return this.configuration.normalize(value);
  }

  /**
   * The versioned settings envelope that is stored.
   *
   * @param {object} [value] Raw settings.
   * @returns {{format: string, version: number, options: object, config: object}} Settings envelope.
   */
  serializeConfiguration(value = {}) {
    return this.configuration.serialize(value);
  }

  /**
   * Check settings: keys the module does not know, values it does not accept.
   *
   * @param {object} settings Settings `{options, config}` or an envelope.
   * @returns {Array<{key: string, message: string, value?: *}>} Errors (`value`: what the module uses instead); empty when valid.
   */
  validateConfiguration(settings) {
    return validateModuleSettings(this.configuration, settings);
  }

  /**
   * The options of the module without the UI, e.g. for an AI agent: the form JSON and one row per
   * option (key, caption, type, section, terms, termsSource, default, advanced, noUI, shown, forced,
   * modes, help). Lists named by `termsSource` come from configurationTerms().
   *
   * @param {{mode?: string, advanced?: boolean, simplified?: boolean}} [options] Mode `configuration`,
   *        `website` or `publication`; `advanced: false` counts the Advanced options as not shown.
   * @returns {{module: string, mode: string, form: object, options: Array<object>}}
   */
  describeConfiguration(options = {}) {
    return describeModuleConfiguration(this.configuration, options);
  }

  /**
   * The lists of `termsSource` the module knows (e.g. the map documents of the Map).
   *
   * @returns {Promise<Object<string, Array<{id: *, label: string}>>>} Lists by source name; none by default.
   */
  async configurationTerms() {
    return {};
  }

  /**
   * Open the configuration form in a mode (in heurist-explorer's window when it is the host). While
   * it is open, a second call gives the same handle.
   *
   * @param {object} [options] Factory options: `mode` (`preferences` / `configuration`, `website`, `publish` /
   *        `publication`), `value`, `title`, `terms`, `fields`, `onSave(settings, {mode, serialized})`, `state`.
   * @returns {{result: Promise<object|null>, close: Function}} The dialog handle.
   * @throws {Error} When the module has no configuration form.
   */
  openConfigurationDialog(options = {}) {
    if (!this.configurationDialogFactory) throw new Error(`The ${this.configuration.type} configuration form is not available`);
    this.configurationDialog = this.configurationDialogFactory(options);
    return this.configurationDialog;
  }

  /**
   * Close an open configuration form.
   *
   * @returns {void}
   */
  destroy() {
    this.configurationDialog?.close?.();
    this.configurationDialog = null;
  }
}
