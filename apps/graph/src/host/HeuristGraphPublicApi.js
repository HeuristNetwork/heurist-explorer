/**
 * @file HeuristGraphPublicApi.js
 * @brief Stable public API for heurist-graph host integrations.
 * @project     Heurist academic knowledge management system
 * @package     heurist-graph
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { serializeGraphConfigurationSettings } from "../ui/config/graphConfigurationSchema.js";
import { PublishedDialog } from "#shared/ui";

export class HeuristGraphPublicApi {
  constructor(application) {
    this.application = application;
    this.readyPromise = null;
    this.configurationDialogFactory = null;
    this.publishedDialog = null;
  }

  setReadyPromise(promise) {
    this.readyPromise = promise;
  }

  ready() {
    return this.readyPromise || Promise.resolve(this);
  }

  setConfigurationDialogFactory(factory) {
    this.configurationDialogFactory = typeof factory === "function" ? factory : null;
  }

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

  /** Serialize settings and publish a reproducible graph snapshot via the host PublicationController. */
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

  load(options) {
    return this.application.load(options);
  }

  setDataset(id) {
    return this.application.setDataset(id);
  }

  activateCurrentResults() {
    return this.application.activateCurrentResults();
  }

  activateFilter(filter) {
    return this.application.activateFilter(filter);
  }

  fit() {
    return this.application.engine.fit();
  }

  exportGephi() {
    return this.application.exportGephi?.();
  }

  expandNode(recordId) {
    return this.application.expandNode(recordId);
  }

  getLegend() {
    return this.application.getLegend();
  }

  defineExpansions() { return this.application.defineExpansions(); }
  resetExpansionRules() { return this.application.resetExpansionRules(); }
  setRuleEnabled(id, enabled) { return this.application.setRuleEnabled(id, enabled); }
  getExpansionState(ids) { return this.application.getExpansionState(ids); }
  setExpansionDepth(depth, ids) { return this.application.setExpansionDepth(depth, ids); }
  advanceExpansion(ids) { return this.application.advanceExpansion(ids); }
  pruneExpansion(ids) { return this.application.pruneExpansion(ids); }

  setRelationshipVisibility(key, ids, visible) {
    return this.application.setRelationshipVisibility(key, ids, visible);
  }

  getVocabulary() {
    return this.application.getVocabulary();
  }

  setRecordTypeVisibility(recordTypeId, visible) {
    return this.application.setRecordTypeVisibility(recordTypeId, visible);
  }

  setLinkVisibility(key, visible) {
    return this.application.setLinkVisibility(key, visible);
  }

  setSelection(recordIds, options) {
    return this.application.setSelection(recordIds, options);
  }

  clearSelection() {
    return this.application.clearSelection();
  }

  getState() {
    return this.application.getState();
  }

  resize() {
    return this.application.resize();
  }

  addEventListener(...args) {
    return this.application.addEventListener(...args);
  }

  removeEventListener(...args) {
    return this.application.removeEventListener(...args);
  }

  destroy() {
    this.publishedDialog?.close?.();
    this.publishedDialog = null;
    return this.application.destroy();
  }
}

/**
 * Reduce the live application state to what reproduces the published view:
 * the source (Dataset id or the original query - never the expanded id list),
 * the selection, the active base-scope expansions, and hidden legend groups.
 * `recordIds`/`limits` are dropped - the graph is rebuilt on open by re-running
 * the source and re-applying the expansions.
 */
function publicationState(state) {
  const out = {
    query: state.query ?? null,
    datasetId: state.datasetId ?? null,
    datasetTitle: state.datasetTitle ?? null,
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
