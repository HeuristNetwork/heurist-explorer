/**
 * @file HeuristModulePublicApi.js
 * @brief The configuration API of a running presentation module (plan 29 §12): current settings,
 *        set / patch / reset (applied at once, optionally saved as preferences), state and the
 *        `heurist-module-configuration-changed` event. Base of every `Heurist*PublicApi`.
 *
 * A module class gives its configuration entry and, where the defaults do not fit, the hooks:
 * - `currentSettings()`: the settings in use (default `application.config.persistedSettings`);
 * - `applySettings(envelope)`: apply them live (default `application.applyConfiguration`);
 * - `saveSettings(envelope)`: store them as the user's preferences (default `host.savePreferences`);
 * - `getState()` / `setState(state)` (default `application.getState` / `application.restoreState`).
 *
 * Publication is not here: heurist-explorer publishes a module from its form (plan 29, 2026-10-28).
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

import { HEURIST_MODULE_EVENTS } from '../contracts/moduleContracts.js';
import { changedSettingKeys, expandSettingsPatch, mergeSettings } from '../data/moduleConfigurationForm.js';
import { HeuristModuleConfigurationApi } from './HeuristModuleConfigurationApi.js';

/** Public API of a running module: its configuration API plus the live settings and state. */
export class HeuristModulePublicApi extends HeuristModuleConfigurationApi {
  /**
   * @param {object} application The module's application controller (`dispatch`, `addEventListener`).
   * @param {object} options
   * @param {object} options.configuration The module's configuration entry (`src/configuration.js`).
   */
  constructor(application, { configuration }) {
    // the module's start sets the form factory with its services (setConfigurationDialogFactory)
    super({ configuration, dialogFactory: false });
    this.application = application;
    this.readyPromise = null;
  }

  /**
   * Set the promise that resolves when the module has started.
   *
   * @param {Promise<object>} promise Start promise.
   * @returns {void}
   */
  setReadyPromise(promise) {
    this.readyPromise = promise;
  }

  /**
   * Resolves when the module has started.
   *
   * @returns {Promise<object>} Start promise, or this API.
   */
  ready() {
    return this.readyPromise || Promise.resolve(this);
  }

  /**
   * The settings in use.
   *
   * @returns {{format: string, version: number, options: object, config: object}} Settings envelope.
   */
  getConfiguration() {
    return this.configuration.serialize(this.currentSettings() || {});
  }

  /**
   * Apply settings at once (normalized; keys not given get the defaults).
   *
   * @param {object} settings Settings `{options, config}` or an envelope.
   * @param {{save?: boolean}} [options] `save: true` also stores them as the user's preferences.
   * @returns {Promise<object>} The settings envelope in use afterwards.
   */
  async setConfiguration(settings, { save = false } = {}) {
    const before = this.getConfiguration();
    const envelope = this.configuration.serialize(this.configuration.normalize(settings || {}));
    await this.applySettings(envelope);
    if (save) await this.saveSettings(envelope);
    const after = this.getConfiguration();
    this.application.dispatch?.(HEURIST_MODULE_EVENTS.CONFIGURATION_CHANGED, {
      module: this.configuration.type, settings: after, changedKeys: changedSettingKeys(before, after)
    });
    return after;
  }

  /**
   * Change some settings, keeping the others.
   *
   * @param {object} partial Dotted keys (`{'config.defaults.pageSize': 500}`) or a nested partial value.
   * @param {{save?: boolean}} [options] `save: true` also stores the settings as the user's preferences.
   * @returns {Promise<object>} The settings envelope in use afterwards.
   */
  patchConfiguration(partial, options = {}) {
    return this.setConfiguration(mergeSettings(this.getConfiguration(), expandSettingsPatch(partial)), options);
  }

  /**
   * Go back to the default settings.
   *
   * @param {{save?: boolean}} [options] `save: true` also stores them as the user's preferences.
   * @returns {Promise<object>} The settings envelope in use afterwards.
   */
  resetConfiguration(options = {}) {
    return this.setConfiguration(this.configuration.defaults(), options);
  }

  /**
   * The current state of the module (what a publication or a saved view keeps).
   *
   * @returns {object} State.
   */
  getState() {
    return this.application.getState();
  }

  /**
   * Restore a state given by getState().
   *
   * @param {object} state State.
   * @returns {Promise<*>} Resolves when the state is shown.
   * @throws {Error} When the module can not restore a state.
   */
  async setState(state) {
    if (typeof this.application.restoreState !== 'function') {
      throw new Error(`The ${this.configuration.type} module can not restore a state`);
    }
    return this.application.restoreState(state || {});
  }

  /**
   * Hook: the settings in use.
   *
   * @protected
   * @returns {object|null}
   */
  currentSettings() {
    return this.application.config?.persistedSettings || null;
  }

  /**
   * Hook: apply a settings envelope live.
   *
   * @protected
   * @param {object} envelope Normalized settings envelope.
   * @returns {Promise<*>}
   */
  applySettings(envelope) {
    return this.application.applyConfiguration(envelope);
  }

  /**
   * Hook: store a settings envelope as the user's preferences.
   *
   * @protected
   * @param {object} envelope Normalized settings envelope.
   * @returns {Promise<*>}
   */
  saveSettings(envelope) {
    return this.application.host?.savePreferences?.(envelope);
  }

  /**
   * Close an open configuration form and stop the module.
   *
   * @returns {Promise<void>|void}
   */
  destroy() {
    super.destroy();
    return this.application.destroy?.();
  }
}
