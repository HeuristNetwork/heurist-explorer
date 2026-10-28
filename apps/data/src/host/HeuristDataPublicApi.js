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

import { HeuristModulePublicApi } from "#shared/host/HeuristModulePublicApi.js";
import { dataConfiguration } from "../configuration.js";
import { serializeDataConfigurationSettings } from "../ui/config/dataConfigurationSchema.js";

/**
 * Stable engine-neutral public API for host integrations. The configuration API (plan 29 §12)
 * comes from HeuristModulePublicApi.
 */
export class HeuristDataPublicApi extends HeuristModulePublicApi {
  /** @param {object} application Data application controller this API wraps. */
  constructor(application) {
    super(application, { configuration: dataConfiguration });
  }

  /** Select and load Filtered Result. */
  setQuery(query, options) {
    return this.application.setQuery(query, options);
  }

  /** Apply a complete Explorer DataSource, preserving its title and identity. */
  setDataSource(dataSource, options) {
    return this.application.setDataSource(dataSource, options);
  }

  /**
   * Apply changed expansion rules of the active DataSource (the host's rules-only update).
   *
   * @param {Array<object>} rules Expansion rules.
   * @returns {Promise<void>}
   */
  setDataSourceRules(rules) {
    return this.application.setDataSourceRules(rules);
  }

  /**
   * Current state of the expansion-level pane.
   *
   * @returns {object|null} See `ExpansionLevelView#getState`, or `null` without the pane.
   */
  getExpansionState() {
    return this.application.expansion?.getState() ?? null;
  }

  /**
   * Show or hide the expansion-level pane.
   *
   * @param {boolean} active Whether the pane is shown.
   * @returns {Promise<void>}
   */
  setExpansionActive(active) {
    return this.application.expansion?.setActive(active);
  }

  /**
   * Show another expansion level.
   *
   * @param {number} level Level 1–4.
   * @returns {Promise<void>}
   */
  setExpansionLevel(level) {
    return this.application.expansion?.setLevel(level);
  }

  /**
   * Enable or disable one expansion rule in the level pane.
   *
   * @param {number} index Rule position.
   * @param {boolean} enabled Whether the rule is used.
   * @returns {Promise<void>}
   */
  setExpansionRuleEnabled(index, enabled) {
    return this.application.expansion?.setRuleEnabled(index, enabled);
  }

  /**
   * Show exactly level n, or all levels 1..n.
   *
   * @param {boolean} cumulative Whether the lower levels are included.
   * @returns {Promise<void>}
   */
  setExpansionCumulative(cumulative) {
    return this.application.expansion?.setCumulative(cumulative);
  }

  /**
   * Filter the level by the main list's selection, or not.
   *
   * @param {boolean} value Whether the selection filters the level.
   * @returns {Promise<void>}
   */
  setExpansionFilterBySelection(value) {
    return this.application.expansion?.setFilterBySelection(value);
  }

  /** @returns {boolean} Whether the host lets this user edit expansion rules. */
  canEditRules() {
    return this.application.canEditRules();
  }

  /** @returns {boolean} Whether quick expansion can add a step. */
  canQuickExpand() {
    return this.application.canQuickExpand();
  }

  /** Open the host's Expansion rules dialog (authors only). */
  editRules() {
    return this.application.editRules();
  }

  /** Add one "any pointer or relationship" step to every rule branch and show it. */
  quickExpand() {
    return this.application.quickExpand();
  }

  /**
   * Smart expansion: record types (with counts) the next step would reach.
   *
   * @param {{signal?: AbortSignal}} [options]
   * @returns {Promise<Array<{id: number, label: string, count: number}>|null>}
   */
  smartExpansionTypes(options) {
    return this.application.smartExpansionTypes(options);
  }

  /**
   * Smart expansion: add a step reaching only the chosen record types and show it.
   *
   * @param {Array<number>} types Chosen record types.
   * @returns {Promise<boolean>} Whether the rules changed.
   */
  smartExpand(types) {
    return this.application.smartExpand(types);
  }

  /** Show or hide a loading indicator, called by the host around its setDataSource() call. */
  setLoading(loading) {
    return this.application.setLoading(loading);
  }

  /** Replace the selected record IDs. */
  setSelection(ids, options) {
    return this.application.setSelection(ids, options);
  }

  /** Clear the selected record IDs. */
  clearSelection() {
    return this.application.clearSelection();
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

  /**
   * Restore a state of getState(): the DataSource (or the query) and the selection.
   *
   * @param {object} [state] State.
   * @returns {Promise<object>} The state afterwards.
   */
  async setState(state = {}) {
    if (state.dataSource) await this.application.setDataSource(state.dataSource);
    else if (state.query != null && state.query !== "") await this.application.setQuery(state.query);
    await this.application.setSelection(Array.isArray(state.selection) ? state.selection : []);
    return this.getState();
  }

  /**
   * Show a host's element under the source header, or remove it with `null`
   * (heurist-explorer's simplified interface puts its Query Source editor there).
   * Only an element of this document: in direct mode, not through an iframe.
   *
   * @param {HTMLElement|null} element Element to show, or null.
   * @returns {boolean} Whether the element is shown.
   */
  setHeaderContent(element) {
    return this.headerContentHandler?.(element) === true;
  }

  /**
   * Set the handler of setHeaderContent (the control panel, once mounted).
   *
   * @param {Function|null} handler `(element) → boolean`.
   * @returns {void}
   */
  setHeaderContentHandler(handler) {
    this.headerContentHandler = typeof handler === "function" ? handler : null;
  }

  /** Resize the active rendering engine. */
  resize() {
    return this.application.resize();
  }

  /** Reload the active Query Source or query. */
  refresh() {
    const state = this.application.getState();
    if (state.querySourceId) {
      // setQuerySource is internal-only (see DataApplication#setQuerySource);
      // reload re-fetches the persisted definition through the application
      // directly rather than the public API.
      return this.application.setQuerySource(state.querySourceId, {
        reload: true,
        dataSource: state.dataSource,
        title: state.title,
      });
    }
    if (state.query != null && state.query !== "") {
      return this.setQuery(state.query, { reload: true });
    }
    return Promise.resolve(state);
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
      // heurist-explorer's simplified interface: fewer sections (it sets them itself)
      simplified: this.application.config.simplified === true,
      title: "Data options",
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
   * Whether this module can be published: only from heurist-explorer, whose configuration
   * form writes the page (plan 29).
   *
   * @returns {boolean}
   */
  canPublish() {
    return typeof this.application.host?.bridge?.openConfiguration === "function";
  }

  /**
   * Open the publication form: the host's own dialog when available (legacy Heurist), otherwise
   * the form in heurist-explorer (plan 29), which writes the page from these settings and the state.
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
    // Explorer writes the page (plan 29); Preserve current state of its form keeps or drops this state
    return this.openConfigurationDialog({
      title: "Publish data",
      ...options,
      mode: "publish",
      value,
      state: this.getState(),
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
