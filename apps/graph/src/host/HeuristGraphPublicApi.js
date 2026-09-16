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

import { serializeGraphConfigurationSettings } from "../ui/config/graphConfigurationSchema.js";
import { PublishedDialog } from "#shared/ui";

/** Public API facade that exposes graph operations to callers and host applications. */
export class HeuristGraphPublicApi {
  /** @param {import('../core/GraphApplication.js').GraphApplication} application Graph application controller this API wraps. */
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
   * @returns {Promise<HeuristGraphPublicApi>} Pending ready promise or this API instance.
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
    if (!this.configurationDialogFactory) throw new Error("Graph configuration dialog is not available");
    const saved = (await this.application.host.loadPreferences?.()) ?? null;
    return this.configurationDialogFactory({ ...options, mode: "preferences", value: saved || this.application.config.persistedSettings || {}, onSave: async (value, context) => {
      const result = await this.application.host.savePreferences?.(
        serializeGraphConfigurationSettings(value),
      );
      this.application.applyConfiguration(context.serialized);
      return options.onSave?.(value, context, result) ?? result;
    } });
  }

  /**
   * Serialize settings and publish a reproducible graph snapshot via the host PublicationController.
   *
   * @param {object} value Settings to publish; serialized into the publication envelope.
   * @param {{preserveCurrentState?: boolean}} [publishOptions] Set `preserveCurrentState: false` to publish with no state.
   * @returns {Promise<object>} The host's publication result.
   */
  publish(value, publishOptions = {}) {
    const settings = serializeGraphConfigurationSettings(value);
    const state =
      publishOptions.preserveCurrentState === false
        ? {}
        : publicationState(this.getState());
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
      throw new Error("Graph configuration dialog is not available");
    const value = publicationSettings(
      options.value || this.application.config.persistedSettings || {},
      this.application.config.language,
    );
    return this.configurationDialogFactory({
      ...options,
      mode: "publish",
      value,
      onSave: async (value, context) => {
        const result = normalizePublicationResult(
          await this.publish(value, context.publishOptions),
        );
        this.application.dispatch("heurist-graph-published", {
          publication: result,
          settings: context.serialized,
        });
        await options.onSave?.(value, context, result);
        // GraphConfigurationDialog closes after this callback resolves. Defer the
        // published-link dialog so it opens once the configuration overlay is gone.
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
   * Load or merge a graph for a query.
   *
   * @param {object} options Load options; see `GraphApplication#load`.
   * @returns {Promise<object>} Updated application state.
   */
  load(options) {
    return this.application.load(options);
  }

  /**
   * Load a persisted Query Source by id and activate it as the graph's source.
   *
   * @param {number|string} id Query Source record id.
   * @returns {Promise<object>} Updated application state.
   */
  setQuerySource(id) {
    return this.application.setQuerySource(id);
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
   * Ask the host to save the active DataSource as a reusable Source record.
   *
   * @param {object} [options] Options forwarded to the host.
   * @returns {Promise<boolean|*>} `false` when unavailable, otherwise the host's result.
   */
  saveDatasourceAsSource(options) {
    return this.application.saveDatasourceAsSource(options);
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
   * Restore the most recently remembered Filtered Result query.
   *
   * @returns {Promise<object>} Updated application state.
   */
  activateCurrentResults() {
    return this.application.activateCurrentResults();
  }

  /**
   * Apply a saved Filter as a new search.
   *
   * @param {object} filter Saved filter (or its raw query).
   * @returns {Promise<object>} Updated application state.
   */
  activateFilter(filter) {
    return this.application.activateFilter(filter);
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
   * Expand one node by one additional depth level.
   *
   * @param {number|string} recordId Record id to expand from.
   * @returns {Promise<boolean>} True when the id was valid and expansion was requested.
   */
  expandNode(recordId) {
    return this.application.expandNode(recordId);
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
   * Open the host's expansion-rules editor and apply the result.
   *
   * @returns {Promise<void>}
   */
  defineExpansions() { return this.application.defineExpansions(); }

  /**
   * Discard the "Define expansions" override, reverting to the saved rules.
   *
   * @returns {Promise<void>}
   */
  resetExpansionRules() { return this.application.resetExpansionRules(); }

  /**
   * Enable or disable one expansion rule.
   *
   * @param {number|string} id Expansion rule id.
   * @param {boolean} enabled New enabled state.
   * @returns {Promise<void>}
   */
  setRuleEnabled(id, enabled) { return this.application.setRuleEnabled(id, enabled); }

  /**
   * Current expansion depth/max-depth/busy state.
   *
   * @param {Array<number>} [ids] Seed record ids to scope the state to; omit for the base scope.
   * @returns {{depth: number, maxDepth: number, busy: boolean}}
   */
  getExpansionState(ids) { return this.application.getExpansionState(ids); }

  /**
   * Set the expansion depth for one or more seeds (or the base scope).
   *
   * @param {number} depth Target depth.
   * @param {Array<number>} [ids] Seed record ids to scope the change to; omit for the base scope.
   * @returns {Promise<void>}
   */
  setExpansionDepth(depth, ids) { return this.application.setExpansionDepth(depth, ids); }

  /**
   * Expand one additional depth level for one or more seeds (or the base scope).
   *
   * @param {Array<number>} [ids] Seed record ids; omit for the base scope.
   * @returns {Promise<void>}
   */
  advanceExpansion(ids) { return this.application.advanceExpansion(ids); }

  /**
   * Retreat one depth level for one or more seeds (or the base scope).
   *
   * @param {Array<number>} [ids] Seed record ids; omit for the base scope.
   * @returns {Promise<void>}
   */
  pruneExpansion(ids) { return this.application.pruneExpansion(ids); }

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
   * Return the current application state.
   *
   * @returns {object} Current application state.
   */
  getState() {
    return this.application.getState();
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

/** Canonicalize the publication link the host returns to a single `pub_id` query parameter. */
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
