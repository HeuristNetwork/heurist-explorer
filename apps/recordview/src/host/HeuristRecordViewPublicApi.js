/**
 * @file HeuristRecordViewPublicApi.js
 * @brief Stable public API for heurist-recordview host integrations.
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

import { HeuristModulePublicApi } from "#shared/host/HeuristModulePublicApi.js";
import { recordViewConfiguration } from "../configuration.js";
import { serializeRecordViewConfigurationSettings } from "../ui/config/recordViewConfigurationSchema.js";

/**
 * Public API facade that exposes Record View operations to callers and host applications. The
 * configuration API (plan 29 §12) comes from HeuristModulePublicApi.
 */
export class HeuristRecordViewPublicApi extends HeuristModulePublicApi {
  /** @param {import('../core/RecordViewApplication.js').RecordViewApplication} application Record View application controller this API wraps. */
  constructor(application) {
    super(application, { configuration: recordViewConfiguration });
  }

  /** @protected The settings in use (Record View keeps them on the application). */
  currentSettings() {
    return this.application.settings || null;
  }

  /**
   * Open the preferences editor, seeded from freshly-loaded host preferences when available.
   *
   * @param {object} [options] Dialog options; `onSave` is wrapped to persist and re-apply settings.
   * @returns {Promise<object>} The opened dialog.
   * @throws {Error} When no configuration dialog factory has been registered.
   */
  async openPreferencesDialog(options = {}) {
    if (!this.configurationDialogFactory) throw new Error("Record View configuration dialog is not available");
    const saved = (await this.application.host.loadPreferences?.()) ?? null;
    return this.configurationDialogFactory({
      title: "Record View options",
      ...options,
      mode: "preferences",
      value: saved || this.application.settings || {},
      onSave: async (value, context) => {
        const result = await this.application.host.savePreferences?.(
          serializeRecordViewConfigurationSettings(value),
        );
        this.application.applyConfiguration(context.serialized);
        return options.onSave?.(value, context, result) ?? result;
      },
    });
  }

  /**
   * Whether this module can be published: only from heurist-explorer, whose configuration
   * form writes the page (plan 29).
   *
   * @returns {boolean}
   */
  canPublish() {
    return typeof this.application.host?.bridge?.openConfiguration === "function";
  }

  /**
   * Open the publication form in heurist-explorer (plan 29): Explorer writes the page from these
   * settings and the state (the displayed record), and shows the result.
   *
   * @param {object} [options] Dialog options.
   * @returns {{result: Promise<object|null>, close: Function}} The dialog handle.
   * @throws {Error} When no configuration dialog factory has been registered.
   */
  openPublishDialog(options = {}) {
    if (!this.configurationDialogFactory)
      throw new Error("Record View configuration dialog is not available");
    const value = publicationSettings(
      options.value || this.application.settings || {},
      this.application.config.language,
    );
    return this.configurationDialogFactory({
      title: "Publish Record View",
      ...options,
      mode: "publish",
      value,
      state: publicationState(this.getState()),
    });
  }

  /**
   * Directly display one record, bypassing the selection-array policy.
   *
   * @param {number|string} id Record id to display.
   * @returns {Promise<object>} Updated application state; see `getState`.
   */
  setRecord(id) {
    return this.application.setRecord(id);
  }

  /**
   * Show a record the user picked (e.g. from the recently viewed list) and publish it
   * as the selection, like following a link inside the record.
   *
   * @param {number|string} id Record id to display.
   * @returns {Promise<object>} Updated application state; see `getState`.
   */
  navigateToRecord(id) {
    return this.application.navigateToRecord(id);
  }

  /**
   * The last viewed records (at most 12), most recent first.
   *
   * @returns {Array<{id:number, title:string}>}
   */
  getRecentRecords() {
    return this.application.getRecentRecords?.() || [];
  }

  /**
   * Apply a new shared selection, choosing the primary record per `selectionMode`.
   *
   * @param {Array<number>} ids Selected record IDs.
   * @returns {Promise<object>} Updated application state; see `getState`.
   */
  setSelection(ids) {
    return this.application.setSelection(ids);
  }

  /**
   * Clear the current selection and displayed record.
   *
   * @returns {Promise<object>} Updated application state; see `getState`.
   */
  clear() {
    return this.application.clear();
  }

  /**
   * Merge partial option overrides and re-render.
   *
   * @param {object} options Partial option overrides.
   * @returns {Promise<object>} Updated application state; see `getState`.
   */
  setOptions(options) {
    return this.application.setOptions(options);
  }

  /**
   * Restore a state of getState(): the displayed record.
   *
   * @param {object} [state] State.
   * @returns {Promise<object>} The state afterwards.
   */
  async setState(state = {}) {
    const id = Number(state.recordId);
    return id > 0 ? this.application.setRecord(id) : this.application.clear();
  }

  /**
   * Return the host's optional capability flags.
   *
   * @returns {object} Capability flags, or `{}` when the host declares none.
   */
  getHostCapabilities() {
    return this.application.getHostCapabilities();
  }

  /**
   * Add a DOM event listener to the underlying application.
   *
   * @returns {void}
   */
  addEventListener(...args) {
    return this.application.addEventListener(...args);
  }

  /**
   * Remove a DOM event listener from the underlying application.
   *
   * @returns {void}
   */
  removeEventListener(...args) {
    return this.application.removeEventListener(...args);
  }

  /**
   * Resize the rendered content. No-op: Record View has no canvas geometry to recompute.
   *
   * @returns {boolean} Always `true`.
   */
  resize() {
    return true;
  }

}

/**
 * Reduce the live application state to what reproduces the published view:
 * the displayed record id and the selection-following policy. The shared
 * `selection` array is dropped — a publication has no live SyncEngine to
 * follow, only the one record it was published from.
 */
function publicationState(state) {
  return {
    recordId: state.recordId ?? null,
    selectionMode: state.selectionMode,
  };
}

/** Force a concrete UI language into publication settings ("auto" cannot resolve without a runtime). */
function publicationSettings(settings, runtimeLanguage) {
  const value = JSON.parse(JSON.stringify(settings || {}));
  value.options ||= {};
  value.options.ui ||= {};
  if (!value.options.ui.language || value.options.ui.language === "auto") {
    value.options.ui.language = runtimeLanguage || "eng";
  }
  return value;
}
