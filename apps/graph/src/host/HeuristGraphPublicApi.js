/**
 * @file HeuristGraphPublicApi.js
 * @brief Stable public API for heurist-graph host integrations.
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

import { HeuristModulePublicApi } from "#shared/host/HeuristModulePublicApi.js";
import { graphConfiguration } from "../configuration.js";
import { serializeGraphConfigurationSettings } from "../ui/config/graphConfigurationSchema.js";

/**
 * Public API facade that exposes graph operations to callers and host applications. The
 * configuration API (plan 29 §12) comes from HeuristModulePublicApi.
 */
export class HeuristGraphPublicApi extends HeuristModulePublicApi {
  /** @param {import('../core/GraphApplication.js').GraphApplication} application Graph application controller this API wraps. */
  constructor(application) {
    super(application, { configuration: graphConfiguration });
  }

  /**
   * Open the preferences editor, seeded from freshly-loaded host preferences when available.
   *
   * @param {object} [options] Dialog options; `onSave` is wrapped to persist and re-apply settings.
   * @returns {Promise<object>} The opened dialog.
   * @throws {Error} When no configuration dialog factory has been registered.
   */
  async openPreferencesDialog(options = {}) {
    if (!this.configurationDialogFactory) throw new Error("Graph configuration dialog is not available");
    const saved = (await this.application.host.loadPreferences?.()) ?? null;
    return this.configurationDialogFactory({ title: "Graph options", ...options, mode: "preferences", value: saved || this.application.config.persistedSettings || {}, onSave: async (value, context) => {
      const result = await this.application.host.savePreferences?.(
        serializeGraphConfigurationSettings(value),
      );
      this.application.applyConfiguration(context.serialized);
      return options.onSave?.(value, context, result) ?? result;
    } });
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
   * settings and the state, and shows the result.
   *
   * @param {object} [options] Dialog options.
   * @returns {object} The opened dialog.
   * @throws {Error} When no configuration dialog factory has been registered.
   */
  openPublishDialog(options = {}) {
    if (!this.configurationDialogFactory)
      throw new Error("Graph configuration dialog is not available");
    const value = publicationSettings(
      options.value || this.application.config.persistedSettings || {},
      this.application.config.language,
    );
    // Explorer writes the page (plan 29); Preserve current state of its form keeps or drops this state
    return this.configurationDialogFactory({
      title: "Publish graph",
      ...options,
      mode: "publish",
      value,
      state: publicationState(this.getState()),
    });
  }

  /**
   * Load or merge a graph for a query.
   *
   * @param {object} options Load options; see `GraphApplication#load`.
   * @returns {Promise<object>} Updated application state.
   */
  load(options) {
    return this.application.load(options);
  }

  /**
   * Apply a DataSource pushed by the host (main runtime), unless the viewer has stuck the current one.
   *
   * @param {object} dataSource DataSource to activate.
   * @returns {Promise<object>} Updated application state; unchanged when pinned.
   */
  setDataSource(dataSource) {
    return this.application.setDataSource(dataSource);
  }

  /**
   * Show or hide a loading indicator for an inbound host DataSource push,
   * called by the host right before/after its setDataSource() call.
   *
   * @param {boolean} loading Whether a load is in progress.
   * @returns {void}
   */
  setLoading(loading) {
    return this.application.setLoading(loading);
  }

  /**
   * Stick (or unstick) the active DataSource against inbound host pushes.
   *
   * @param {boolean} pinned New pinned state.
   * @returns {boolean} The applied pinned state.
   */
  setPinned(pinned) {
    return this.application.setPinned(pinned);
  }

  /**
   * Toggle the pinned state; see `setPinned()`.
   *
   * @returns {boolean} The applied pinned state.
   */
  togglePinned() {
    return this.application.togglePinned();
  }

  /**
   * Ask the host to activate and display the active DataSource.
   *
   * @returns {Promise<boolean|*>} `false` when unavailable, otherwise the host's result.
   */
  showDataSource() {
    return this.application.showDataSource();
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
   * Fit the viewport to the full graph.
   *
   * @returns {*} Result of the engine's fit call.
   */
  fit() {
    return this.application.engine.fit();
  }

  /**
   * Serialize and download the current graph as Gephi-compatible JSON.
   *
   * @returns {*} Result of the application's export call.
   */
  exportGephi() {
    return this.application.exportGephi?.();
  }

  /**
   * Legend model derived from the loaded graph; see `GraphApplication#getLegend`.
   *
   * @returns {object} Legend model.
   */
  getLegend() {
    return this.application.getLegend();
  }

  /**
   * Discard a restored rule override, reverting to the saved rules.
   *
   * @returns {Promise<void>}
   */
  resetExpansionRules() { return this.application.resetExpansionRules(); }

  /**
   * Apply changed expansion rules of the active DataSource without reloading the graph.
   *
   * @param {Array<object>} rules Expansion rules.
   * @returns {Promise<object>} Updated application state.
   */
  setDataSourceRules(rules) { return this.application.setDataSourceRules(rules); }

  /** @returns {boolean} Whether this view may edit the DataSource's rules (authors only). */
  canEditRules() { return this.application.canEditRules(); }

  /**
   * Open the host's Expansion rules dialog for the active DataSource.
   *
   * @returns {Promise<Array<object>|null>} Applied rules, or `null`.
   */
  editRules() { return this.application.editRules(); }

  /**
   * Add one "any pointer or relationship" step to every rule branch that can grow,
   * save the rules into the DataSource and show the new deepest level.
   *
   * @returns {Promise<boolean>} Whether the rules grew.
   */
  quickExpand() { return this.application.quickExpand(); }

  /** @returns {number} The maximum allowed nodes when the graph already has that many, otherwise 0. */
  nodeLimitReached() { return this.application.nodeLimitReached(); }

  /** @returns {boolean} Whether quick expansion can add a step. */
  canQuickExpand() { return this.application.canQuickExpand(); }

  /**
   * Smart expansion: record types (with counts) the next step would reach.
   *
   * @param {{signal?: AbortSignal}} [options]
   * @returns {Promise<Array<{id: number, label: string, count: number}>|null>}
   */
  smartExpansionTypes(options) { return this.application.smartExpansionTypes(options); }

  /**
   * Smart expansion: add a step reaching only the chosen record types and show it.
   *
   * @param {Array<number>} types Chosen record types.
   * @returns {Promise<boolean>} Whether the rules grew.
   */
  smartExpand(types) { return this.application.smartExpand(types); }

  /**
   * Enable or disable one expansion rule.
   *
   * @param {number|string} id Expansion rule id.
   * @param {boolean} enabled New enabled state.
   * @returns {Promise<void>}
   */
  setRuleEnabled(id, enabled) { return this.application.setRuleEnabled(id, enabled); }

  /**
   * Current expansion level of the whole graph, its maximum and busy state.
   *
   * @returns {{depth: number, maxDepth: number, busy: boolean}}
   */
  getExpansionState() { return this.application.getExpansionState(); }

  /**
   * Set the expansion level of the whole graph.
   *
   * @param {number} depth Target level.
   * @returns {Promise<void>}
   */
  setExpansionDepth(depth) { return this.application.setExpansionDepth(depth); }

  /**
   * Stop the running expansion requests; the main graph is not affected.
   *
   * @returns {void}
   */
  stopExpansion() { return this.application.stopExpansion(); }

  /**
   * Expand the whole graph by one level.
   *
   * @returns {Promise<void>}
   */
  advanceExpansion() { return this.application.advanceExpansion(); }

  /**
   * Retreat the whole graph by one level.
   *
   * @returns {Promise<void>}
   */
  pruneExpansion() { return this.application.pruneExpansion(); }

  /**
   * Show or hide specific relationship types within a link group without reloading.
   *
   * @param {string} key Link group key; see `GraphApplication#getLegend`.
   * @param {Array<number|string>} ids Relation-type (trm_ID) ids to toggle.
   * @param {boolean} visible New visibility state.
   * @returns {Promise<object>} Updated legend model.
   */
  setRelationshipVisibility(key, ids, visible) {
    return this.application.setRelationshipVisibility(key, ids, visible);
  }

  /**
   * Resolved edge vocabulary for the legend renderer; see `GraphApplication#getVocabulary`.
   *
   * @returns {object} Resolved vocabulary.
   */
  getVocabulary() {
    return this.application.getVocabulary();
  }

  /**
   * Show or hide every node of one record type without reloading.
   *
   * @param {number|string} recordTypeId Record type id.
   * @param {boolean} visible New visibility state.
   * @returns {Promise<object>} Updated legend model.
   */
  setRecordTypeVisibility(recordTypeId, visible) {
    return this.application.setRecordTypeVisibility(recordTypeId, visible);
  }

  /**
   * Show or hide every edge of one link group without reloading.
   *
   * @param {string} key Link group key; see `GraphApplication#getLegend`.
   * @param {boolean} visible New visibility state.
   * @returns {Promise<object>} Updated legend model.
   */
  setLinkVisibility(key, visible) {
    return this.application.setLinkVisibility(key, visible);
  }

  /**
   * Set the selected record IDs.
   *
   * @param {Array<number>} recordIds Selected record IDs.
   * @param {object} [options] Options forwarded to `GraphApplication#setSelection`.
   * @returns {Promise<Array<number>>} The applied selection.
   */
  setSelection(recordIds, options) {
    return this.application.setSelection(recordIds, options);
  }

  /**
   * Clear the current selection.
   *
   * @returns {Promise<Array<number>>} The applied (empty) selection.
   */
  clearSelection() {
    return this.application.clearSelection();
  }

  /**
   * Restore a state of getState(): the query (or the Query Source query) and the selection.
   * Expansions and hidden legend groups are not restored.
   *
   * @param {object} [state] State.
   * @returns {Promise<object>} The state afterwards.
   */
  async setState(state = {}) {
    await this.application.load({ query: state.query ?? null });
    await this.application.setSelection(Array.isArray(state.selection) ? state.selection : []);
    return this.getState();
  }

  /**
   * Resize the rendering engine.
   *
   * @returns {*} Result of the engine's resize call.
   */
  resize() {
    return this.application.resize();
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

}

/**
 * Reduce the live application state to what reproduces the published view:
 * the source (Query Source id or the original query - never the expanded id list),
 * the selection, the active base-scope expansions, and hidden legend groups.
 * `recordIds`/`limits` are dropped - the graph is rebuilt on open by re-running
 * the source and re-applying the expansions.
 */
function publicationState(state) {
  const out = {
    query: state.query ?? null,
    querySourceId: state.querySourceId ?? null,
    querySourceTitle: state.querySourceTitle ?? null,
    selection: Array.isArray(state.selection) ? state.selection : [],
  };
  const expansions = state.expansions;
  if (expansions && Array.isArray(expansions.rules) && expansions.rules.length) {
    out.expansions = {
      rules: expansions.rules,
      enabled: expansions.enabled || [],
      depth: expansions.depth || 0,
    };
  }
  const hidden = state.hidden || {};
  if (
    (hidden.recordTypes && hidden.recordTypes.length) ||
    (hidden.links && hidden.links.length) ||
    (hidden.relationships && hidden.relationships.length)
  ) {
    out.hidden = {
      recordTypes: hidden.recordTypes || [],
      links: hidden.links || [],
      relationships: hidden.relationships || [],
    };
  }
  return out;
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
