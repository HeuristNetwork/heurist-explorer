/**
 * @file HeuristDataPublicApi.js
 * @brief Stable engine-neutral public API for host integrations.
 * @project     Heurist academic knowledge management system
 * @package     heurist-data
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
/** Stable engine-neutral public API for host integrations. */
export class HeuristDataPublicApi {
  constructor(application) {
    this.application = application;
    this.readyPromise = null;
    this.configurationDialogFactory = null;
    this.configurationDialog = null;
    this.publishedDialog = null;
  }
  setReadyPromise(value) {
    this.readyPromise = value;
  }
  /** Resolve when the application is ready. */
  ready() {
    return this.readyPromise || Promise.resolve(this);
  }
  /** Select and load a persisted Dataset. */
  setDataset(id, options) {
    return this.application.setDataset(id, options);
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
  notifyFilterLoading(filterId) {
    this.application.dispatch("heurist-data-filter-loading", {
      filterId: Number(filterId),
    });
  }
  notifyFilterLoaded(filter) {
    this.application.dispatch("heurist-data-filter-loaded", { filter });
  }
  requestCreateDataset() {
    return this.application.requestCreateDataset();
  }
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
  /** Reload the active Dataset or query source. */
  refresh() {
    const state = this.application.getState();
    if (state.datasetId)
      return this.setDataset(state.datasetId, { reload: true });
    if (state.query != null && state.query !== "") {
      return this.setQuery(state.query, { reload: true });
    }
    return Promise.resolve(state);
  }
  setConfigurationDialogFactory(factory) {
    this.configurationDialogFactory =
      typeof factory === "function" ? factory : null;
  }
  openConfigurationDialog(options = {}) {
    if (!this.configurationDialogFactory)
      throw new Error("Data configuration dialog is not available");
    this.configurationDialog?.close?.();
    this.configurationDialog = this.configurationDialogFactory(options);
    return this.configurationDialog;
  }
  openConfiguration(options = {}) {
    return this.openConfigurationDialog(options);
  }
  loadPreferences() {
    return this.application.host.loadPreferences?.() ?? null;
  }
  savePreferences(value) {
    return this.application.host.savePreferences?.(
      serializeDataConfigurationSettings(value),
    );
  }
  /** Apply normalized runtime configuration. */
  applyConfiguration(value) {
    return this.application.applyConfiguration(value);
  }
  async openPreferencesDialog(options = {}) {
    // Preferences must open from the live application configuration. Runtime
    // changes such as switching List/Card/Table are applied immediately but
    // are not necessarily persisted to the host until the dialog is saved.
    // Reloading host preferences here would therefore resurrect stale values.
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
  openHelp(options = {}) {
    if (this.application.host.supportsHostedHelp?.()) {
      return this.application.host.openHelp(options);
    }
    return false;
  }
  getHostContext() {
    return this.application.hostContext || {};
  }
  requestDataSourceAction(action) {
    return this.application.requestDataSourceAction(action);
  }
  requestSaveFilter() {
    const source = currentSource(this.application);
    this.application.dispatch("heurist-data-save-filter-requested", { source });
    return source;
  }
  addEventListener(...args) {
    this.application.addEventListener(...args);
  }
  removeEventListener(...args) {
    this.application.removeEventListener(...args);
  }
  destroy() {
    this.configurationDialog?.close?.();
    this.publishedDialog?.close?.();
    return this.application.destroy();
  }
}

function currentSource(application) {
  const state = application.getState();
  return {
    type: state.sourceType || (state.datasetId ? "dataset" : "query"),
    datasetId: state.datasetId ?? null,
    query: state.query ?? null,
  };
}

function publicationSettings(settings, runtimeLanguage) {
  const value = JSON.parse(JSON.stringify(settings || {}));
  value.options ||= {};
  value.options.ui ||= {};
  if (!value.options.ui.language || value.options.ui.language === "auto") {
    value.options.ui.language = runtimeLanguage || "eng";
  }
  return value;
}

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
