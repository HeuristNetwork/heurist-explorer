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

import { serializeRecordViewConfigurationSettings } from "../ui/config/recordViewConfigurationSchema.js";
import { PublishedDialog } from "#shared/ui";

/** Public API facade that exposes Record View operations to callers and host applications. */
export class HeuristRecordViewPublicApi {
  /** @param {import('../core/RecordViewApplication.js').RecordViewApplication} application Record View application controller this API wraps. */
  constructor(application) {
    this.application = application;
    this.readyPromise = null;
    this.configurationDialogFactory = null;
    this.publishedDialog = null;
  }

  /**
   * Register the promise that resolves once the application is ready.
   *
   * @param {Promise<object>} promise Ready promise.
   * @returns {void}
   */
  setReadyPromise(promise) {
    this.readyPromise = promise;
  }

  /**
   * Resolves when the application is ready.
   *
   * @returns {Promise<HeuristRecordViewPublicApi>} Pending ready promise or this API instance.
   */
  ready() {
    return this.readyPromise || Promise.resolve(this);
  }

  /**
   * Register the factory used to create the configuration/publish dialog.
   *
   * @param {Function|null} factory Called with dialog options; returns a dialog with an `open()`/`close()` API.
   * @returns {void}
   */
  setConfigurationDialogFactory(factory) {
    this.configurationDialogFactory = typeof factory === "function" ? factory : null;
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
   * Serialize settings and publish a reproducible Record View snapshot via the host PublicationController.
   *
   * @param {object} value Settings to publish; serialized into the publication envelope.
   * @returns {Promise<object>} The host's publication result.
   */
  publish(value) {
    const settings = serializeRecordViewConfigurationSettings(value);
    const state = publicationState(this.getState());
    return this.application.host.publish({
      format: "heurist-publication",
      version: 1,
      options: settings.options,
      config: settings.config,
      state,
    });
  }

  /**
   * Open the publish editor seeded with publish-mode settings. On save, publishes and shows the
   * resulting link dialog.
   *
   * @param {object} [options] Dialog options.
   * @returns {object} The opened dialog.
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
      ...options,
      mode: "publish",
      value,
      onSave: async (value, context) => {
        const result = normalizePublicationResult(await this.publish(value));
        this.application.dispatch("heurist-recordview-published", {
          publication: result,
          settings: context.serialized,
        });
        await options.onSave?.(value, context, result);
        setTimeout(() => {
          this.publishedDialog?.close?.();
          this.publishedDialog = new PublishedDialog({ publication: result }).open();
        }, 0);
        return result;
      },
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
   * Return the current application state.
   *
   * @returns {object} Current application state.
   */
  getState() {
    return this.application.getState();
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

  /**
   * Close any open dialogs and tear down the application.
   *
   * @returns {Promise<void>}
   */
  destroy() {
    this.publishedDialog?.close?.();
    this.publishedDialog = null;
    return this.application.destroy();
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

/** Canonicalize the publication link the host returns to a single `pub_id` query parameter. */
function normalizePublicationResult(result) {
  if (!result?.url) return result;
  try {
    const url = new URL(result.url, globalThis.location?.href || "http://localhost/");
    const publicationId = url.searchParams.get("pub_id") || url.searchParams.get("publication_id");
    if (publicationId) url.searchParams.set("pub_id", publicationId);
    url.searchParams.delete("publication_id");
    url.searchParams.delete("type");
    return { ...result, url: url.href };
  } catch {
    return result;
  }
}
