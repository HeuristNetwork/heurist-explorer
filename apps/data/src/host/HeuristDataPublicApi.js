/**
 * @file HeuristDataPublicApi.js
 * @brief Stable engine-neutral public API for host integrations.
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

import { serializeDataConfigurationSettings } from "../ui/config/dataConfigurationSchema.js";
import { PublishedDialog } from "#shared/ui";

/** Stable engine-neutral public API for host integrations. */
export class HeuristDataPublicApi {
  /** @param {object} application Data application controller this API wraps. */
  constructor(application) {
    this.application = application;
    this.readyPromise = null;
    this.configurationDialogFactory = null;
    this.configurationDialog = null;
    this.publishedDialog = null;
  }

  /**
   * Register the promise that resolves once the application is ready.
   *
   * @param {Promise<object>} value Ready promise.
   * @returns {void}
   */
  setReadyPromise(value) {
    this.readyPromise = value;
  }

  /** Resolve when the application is ready. */
  ready() {
    return this.readyPromise || Promise.resolve(this);
  }

  /** Select and load a persisted Query Source. */
  setQuerySource(id, options) {
    return this.application.setQuerySource(id, options);
  }

  /** Select and load Filtered Result. */
  setQuery(query, options) {
    return this.application.setQuery(query, options);
  }

  /** Apply a complete Explorer DataSource, preserving its title and identity. */
  setDataSource(dataSource, options) {
    return this.application.setDataSource(dataSource, options);
  }

  /** Replace the selected record IDs. */
  setSelection(ids, options) {
    return this.application.setSelection(ids, options);
  }

  /** Clear the selected record IDs. */
  clearSelection() {
    return this.application.clearSelection();
  }

  /** Activate the remembered Filtered Result source. */
  activateCurrentResults() {
    return this.application.activateCurrentResults();
  }

  /** Activate a saved filter against Filtered Result. */
  activateFilter(filter) {
    return this.application.activateFilter(filter);
  }

  /**
   * Dispatch a public event announcing that a saved filter is loading.
   *
   * @param {number|string} filterId Saved filter record ID.
   * @returns {void}
   */
  notifyFilterLoading(filterId) {
    this.application.dispatch("heurist-data-filter-loading", {
      filterId: Number(filterId),
    });
  }

  /**
   * Dispatch a public event announcing that a saved filter has loaded.
   *
   * @param {object} filter Loaded filter definition.
   * @returns {void}
   */
  notifyFilterLoaded(filter) {
    this.application.dispatch("heurist-data-filter-loaded", { filter });
  }

  /**
   * Create a new persisted Query Source record and activate it.
   *
   * @returns {Promise<object|null>} The host's record-creation result, or `null` when unavailable.
   */
  requestCreateQuerySource() {
    return this.application.requestCreateQuerySource();
  }

  /**
   * Ask the host to edit the field selection for the active Query Source (or Filtered Result).
   *
   * @returns {Promise<*>} The host's `editFieldset` result, or `null` when unavailable.
   */
  requestPickFields() {
    return this.application.requestPickFields();
  }

  /** Return host and engine capabilities. */
  getCapabilities() {
    return this.application.getCapabilities();
  }

  /** Return the current application state. */
  getState() {
    return this.application.getState();
  }

  /** Resize the active rendering engine. */
  resize() {
    return this.application.resize();
  }

  /** Reload the active Query Source or query. */
  refresh() {
    const state = this.application.getState();
    if (state.querySourceId)
      return this.setQuerySource(state.querySourceId, { reload: true });
    if (state.query != null && state.query !== "") {
      return this.setQuery(state.query, { reload: true });
    }
    return Promise.resolve(state);
  }

  /**
   * Register the factory used to create a standalone configuration dialog
   * when the host has no dialog of its own.
   *
   * @param {Function|null} factory Called with dialog options; returns a dialog with an `open()`/`close()` API.
   * @returns {void}
   */
  setConfigurationDialogFactory(factory) {
    this.configurationDialogFactory =
      typeof factory === "function" ? factory : null;
  }

  /**
   * Open the standalone configuration dialog via the registered factory.
   *
   * @param {object} [options] Dialog options.
   * @returns {object} The opened dialog.
   * @throws {Error} When no configuration dialog factory has been registered.
   */
  openConfigurationDialog(options = {}) {
    if (!this.configurationDialogFactory)
      throw new Error("Data configuration dialog is not available");
    this.configurationDialog?.close?.();
    this.configurationDialog = this.configurationDialogFactory(options);
    return this.configurationDialog;
  }

  /**
   * Alias for {@link HeuristDataPublicApi#openConfigurationDialog}.
   *
   * @param {object} [options] Dialog options.
   * @returns {object} The opened dialog.
   */
  openConfiguration(options = {}) {
    return this.openConfigurationDialog(options);
  }

  /**
   * Load this module's persisted settings via the host.
   *
   * @returns {Promise<object|null>|null} Host's loaded preferences, or `null` when unsupported.
   */
  loadPreferences() {
    return this.application.host.loadPreferences?.() ?? null;
  }

  /**
   * Persist this module's settings via the host.
   *
   * @param {object} value Settings to persist; serialized before sending to the host.
   * @returns {*} Result of the host's save action, or `undefined` when unsupported.
   */
  savePreferences(value) {
    return this.application.host.savePreferences?.(
      serializeDataConfigurationSettings(value),
    );
  }

  /** Apply normalized runtime configuration. */
  applyConfiguration(value) {
    return this.application.applyConfiguration(value);
  }

  /**
   * Open the preferences editor: the host's own dialog when available, otherwise the standalone one.
   *
   * Opens from the live application configuration rather than reloading host preferences, since
   * runtime-only changes (e.g. switching List/Card/Table) are applied immediately but not
   * necessarily persisted until the dialog is saved; reloading here would resurrect stale values.
   *
   * @param {object} [options] Dialog options; `onSave` is wrapped to persist and re-apply settings.
   * @returns {Promise<object>} The opened dialog.
   */
  async openPreferencesDialog(options = {}) {
    const dialogOptions = {
      runtimeMode: this.application.config.runtimeMode,
      ...options,
      mode: "preferences",
      value: options.value || this.application.config.persistedSettings,
      onSave: async (value, context) => {
        const result = await this.savePreferences(value);
        await this.applyConfiguration(context.serialized);
        return options.onSave?.(value, context, result) ?? result;
      },
    };
    if (this.application.host.supportsHostedPreferencesDialog?.()) {
      return this.application.host.openPreferencesDialog(dialogOptions);
    }
    return this.openConfigurationDialog(dialogOptions);
  }

  /**
   * Publish a reproducible snapshot of the current (or given) settings and state via the host.
   *
   * @param {object} value Settings to publish; serialized into the publication envelope.
   * @param {{preserveCurrentState?: boolean}} [publishOptions] Set `preserveCurrentState: false` to publish with no state.
   * @returns {Promise<object>} The host's publication result.
   */
  publish(value, publishOptions = {}) {
    const settings = serializeDataConfigurationSettings(value);
    const state =
      publishOptions.preserveCurrentState === false ? {} : this.getState();
    return this.application.host.publish({
      format: "heurist-publication",
      version: 1,
      options: settings.options,
      config: settings.config,
      state,
    });
  }

  /**
   * Open the publish editor: the host's own dialog when available, otherwise the standalone one
   * seeded with publish-mode settings. On save, publishes and shows the resulting link dialog.
   *
   * @param {object} [options] Dialog options.
   * @returns {Promise<object>} The opened dialog.
   */
  openPublishDialog(options = {}) {
    if (this.application.host.supportsHostedPublishDialog?.()) {
      return this.application.host.openPublishDialog(options);
    }
    const value = publicationSettings(
      options.value || this.application.config.persistedSettings,
      this.application.config.language,
    );
    return this.openConfigurationDialog({
      ...options,
      mode: "publish",
      value,
      onSave: async (value, context) => {
        const result = normalizePublicationResult(
          await this.publish(value, context.publishOptions),
        );
        this.application.dispatch("heurist-data-published", {
          publication: result,
          settings: context.serialized,
        });
        await options.onSave?.(value, context, result);
        setTimeout(() => {
          this.publishedDialog?.close?.();
          this.publishedDialog = new PublishedDialog({
            publication: result,
          }).open();
        }, 0);
        return result;
      },
    });
  }

  /**
   * Return the embedding host's identity.
   *
   * @returns {object} Host context, or `{}` when not yet known.
   */
  getHostContext() {
    return this.application.hostContext || {};
  }

  /**
   * Perform a datasource-related action requested by a host UI element (see `DataApplication#requestDataSourceAction`).
   *
   * @param {'workspace'|'save-filter'|'save-source'} action Action to perform.
   * @returns {Promise<boolean|*>} Result of the underlying application action.
   */
  requestDataSourceAction(action) {
    return this.application.requestDataSourceAction(action);
  }

  /**
   * Dispatch a public event requesting that the current source be saved as a filter.
   *
   * @returns {{type: string, querySourceId: number|null, query: *}} The current source descriptor.
   */
  requestSaveFilter() {
    const source = currentSource(this.application);
    this.application.dispatch("heurist-data-save-filter-requested", { source });
    return source;
  }

  /**
   * Add a DOM event listener to the underlying application.
   *
   * @returns {void}
   */
  addEventListener(...args) {
    this.application.addEventListener(...args);
  }

  /**
   * Remove a DOM event listener from the underlying application.
   *
   * @returns {void}
   */
  removeEventListener(...args) {
    this.application.removeEventListener(...args);
  }

  /**
   * Close any open dialogs and tear down the application.
   *
   * @returns {Promise<void>}
   */
  destroy() {
    this.configurationDialog?.close?.();
    this.publishedDialog?.close?.();
    return this.application.destroy();
  }
}

/** Build the current-source descriptor (`{type, querySourceId, query}`) from application state. */
function currentSource(application) {
  const state = application.getState();
  return {
    type: state.sourceType || (state.querySourceId ? "querySource" : "query"),
    querySourceId: state.querySourceId ?? null,
    query: state.query ?? null,
  };
}

/** Clone settings for publication and default the UI language away from "auto". */
function publicationSettings(settings, runtimeLanguage) {
  const value = JSON.parse(JSON.stringify(settings || {}));
  value.options ||= {};
  value.options.ui ||= {};
  if (!value.options.ui.language || value.options.ui.language === "auto") {
    value.options.ui.language = runtimeLanguage || "eng";
  }
  return value;
}

/** Normalize a publication result's URL, migrating a legacy `publication_id` param to `pub_id`. */
function normalizePublicationResult(result) {
  if (!result?.url) return result;
  try {
    const url = new URL(
      result.url,
      globalThis.location?.href || "http://localhost/",
    );
    const publicationId =
      url.searchParams.get("pub_id") || url.searchParams.get("publication_id");
    if (publicationId) url.searchParams.set("pub_id", publicationId);
    url.searchParams.delete("publication_id");
    url.searchParams.delete("type");
    return { ...result, url: url.href };
  } catch {
    return result;
  }
}
