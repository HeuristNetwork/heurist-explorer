/**
 * @file GraphApplication.js
 * @brief Coordinates graph loading, merging, selection, and rendering.
 * @project     Heurist academic knowledge management system
 * @package     heurist-graph
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { GraphDocument } from "./GraphDocument.js";
import { GraphExpansions } from './GraphExpansions.js';

export class GraphApplication extends EventTarget {
  constructor({
    config,
    provider,
    engine,
    host,
    datasetProvider = null,
    recordContentProvider = null,
    vocabularyProvider = null,
  }) {
    super();
    this.config = config;
    this.provider = provider;
    this.engine = engine;
    this.host = host;
    this.datasetProvider = datasetProvider;
    this.recordContentProvider = recordContentProvider;
    this.vocabularyProvider = vocabularyProvider;
    this.graph = null;
    this.ruleOverrides = new Map();
    this.expansionQueue = Promise.resolve();
    this.expansions = null;
    // Human labels for edges, resolved from the API after every load:
    // `fields` keyed by detail-type dty_ID, `relationTypes` by relation-type
    // trm_ID. `relationTypeTrees` keeps each relation type's descendant tree
    // for the legend renderer. See VocabularyProvider.
    this.edgeLabels = { fields: new Map(), relationTypes: new Map() };
    this.relationTypeTrees = {};
    this.selection = normalizeIds(config.selection);
    this.abortController = null;
    this.generation = 0;
    // Legend state: record types and link groups the viewer has hidden.
    this.hiddenRecordTypes = new Set();
    this.hiddenLinks = new Set();
    this.hiddenRelationships = new Set();
    this.dataset = null;
    this.response = null;
    this.recordTypeNames = new Map();
    // Active source tracking, mirroring heurist-data's DataApplication: a
    // persisted Dataset "wins" against inbound Filtered Result queries until
    // the viewer explicitly reactivates Filtered Result.
    this.source = null;
    this.currentResultsQuery =
      config.query == null || config.query === "" ? null : config.query;
    // DOM handles for the empty-result presentation. Set by initialize().
    this.canvasElement = null;
    this.messageElement = null;
  }

  async initialize(container, { messageElement = null } = {}) {
    this.canvasElement = container;
    this.messageElement = messageElement;
    await this.host?.initialize?.({ config: this.config });
    await this._loadInitialPreferences();
    await this.engine.initialize({
      container,
      options: this.config.engineOptions,
      onSelectionChange: (ids) => this.setSelection(ids, { fromEngine: true }),
      onNodeActivate: (id) => this.expandNode(id).catch(error => this.dispatch('heurist-graph-error', { error, operation:'expansion' })),
      onPopupContentRequest: (request) => this.requestPopupContent(request),
    });
    await this.#restoreInitialView();
    return this;
  }

  /**
   * Reproduce a published (or host-seeded) view: activate the persisted Dataset
   * by id, or run the persisted query, then re-apply the saved base-scope
   * expansions and legend visibility. Matches heurist-data's publish/open cycle.
   */
  async #restoreInitialView() {
    let loaded = false;
    if (this.config.datasetId) {
      try {
        await this.setDataset(this.config.datasetId);
        loaded = true;
      } catch (error) {
        this.dispatch("heurist-graph-error", {
          error,
          operation: "restore-dataset",
        });
      }
    }
    if (!loaded && this.config.query != null && this.config.query !== "") {
      await this.load({ query: this.config.query });
      loaded = true;
    }
    if (!loaded) {
      this.#setEmptyState(true);
      return;
    }
    await this.#restoreExpansions(this.config.initialExpansions);
    await this.#restoreHiddenGroups(this.config.initialHidden);
  }

  /** Re-enable the published rules and drive the base scope to the saved depth. */
  async #restoreExpansions(saved) {
    if (!saved || !this.expansions) return;
    const key = this.config.datasetId
      ? `dataset:${this.config.datasetId}`
      : "current";
    if (Array.isArray(saved.rules) && saved.rules.length) {
      this.ruleOverrides.set(key, structuredClone(saved.rules));
      this.expansions.setRules(saved.rules);
    }
    const wrapped = this.expansions.rules || [];
    (Array.isArray(saved.enabled) ? saved.enabled : []).forEach((on, index) => {
      if (wrapped[index]) wrapped[index].enabled = on === true;
    });
    const depth = Math.max(0, Number(saved.depth) || 0);
    if (depth > 0) await this.setExpansionDepth(depth);
    else if (wrapped.some((rule) => rule.enabled)) await this.renderExpansions();
  }

  /** Restore hidden record types / link groups after the graph is on screen. */
  async #restoreHiddenGroups(saved) {
    if (!saved) return;
    for (const id of saved.recordTypes || [])
      this.hiddenRecordTypes.add(Number(id) || 0);
    for (const groupKey of saved.links || []) this.hiddenLinks.add(String(groupKey));
    for (const token of saved.relationships || [])
      this.hiddenRelationships.add(String(token));
    if (
      this.hiddenRecordTypes.size ||
      this.hiddenLinks.size ||
      this.hiddenRelationships.size
    )
      await this.#renderVisible();
  }

  /**
   * Load host-persisted settings before the engine's first render, matching
   * heurist-data's DataApplication. This only runs when the bootstrap didn't
   * already embed persisted settings (`config.loadPreferencesOnInit`), so a
   * host that inlines settings at bootstrap never pays for a redundant fetch.
   */
  async _loadInitialPreferences() {
    if (
      !this.config.loadPreferencesOnInit ||
      typeof this.host?.loadPreferences !== "function"
    )
      return;
    try {
      const saved = await this.host.loadPreferences();
      if (!saved) return;
      const { normalizeGraphConfigurationSettings } = await import(
        "../ui/config/graphConfigurationSchema.js"
      );
      const normalized = normalizeGraphConfigurationSettings(saved);
      this.config.persistedSettings = normalized;
      this.config.ui = normalized.options.ui;
      this.config.limits = {
        ...this.config.limits,
        maxNodes:
          Number(normalized.config.defaults.maxNodes) ||
          this.config.limits.maxNodes,
        maxEdges:
          Number(normalized.config.defaults.maxEdges) ||
          this.config.limits.maxEdges,
      };
      this.config.engineOptions = {
        ...this.config.engineOptions,
        gravity: normalized.config.defaults.gravity,
        layoutMode: normalized.config.defaults.layoutMode,
        movement: normalized.config.defaults.movement,
        scaling: normalized.config.defaults.scaling,
        showNodeLabels: normalized.config.defaults.showNodeLabels,
        showEdgeLabels: normalized.config.defaults.showEdgeLabels,
        labelMaxLength: normalized.config.defaults.labelLength,
        popupDelay: normalized.config.defaults.popupDelay,
        popupTemplate: normalized.config.defaults.popupTemplate,
        selectionEnabled: normalized.options.interaction.selectionEnabled,
        popupEnabled: normalized.options.interaction.popupEnabled,
        nativeControls: normalized.options.nativeControls,
      };
    } catch (error) {
      this.dispatch("heurist-graph-error", { error, operation: "load-preferences" });
    }
  }

  /**
   * Load or merge a graph for a query.
   *
   * A plain (non-merge) call is ignored while a persisted Dataset is the
   * active source - matching heurist-data's `DataApplication.setQuery()` -
   * so a Filtered Result query the host pushes (a global search event, once
   * applied after the widget becomes visible) never clobbers a Dataset the
   * viewer deliberately selected. Internal callers that manage `this.source`
   * themselves (`setDataset`, `activateCurrentResults`) pass `internal: true`
   * to bypass that guard.
   *
   * Whatever the outcome, the *remembered* Filtered Result query is still
   * updated first (matching heurist-data's "host search events keep Current
   * Results up to date" comment) so `activateCurrentResults()` always
   * restores the latest one, even one that arrived while a Dataset was on
   * screen - not a stale query from before the Dataset was selected. Pass
   * `remember: false` to skip that (restoring/loading a Dataset's own query
   * must never be remembered as a Filtered Result query).
   *
   * An explicit `null`/empty query always wins, even over an active Dataset -
   * it deactivates any Dataset and shows the empty-result message.
   */
  async load({
    query = this.config.query,
    links,
    merge = false,
    internal = false,
    remember = true,
  } = {}) {
    const normalizedQuery = query == null || query === "" ? null : query;

    if (normalizedQuery == null && !merge) {
      this.generation += 1;
      this.abortController?.abort("Graph cleared");
      this.source = null;
      this.config.datasetId = null;
      this.config.datasetTitle = null;
      this.config.query = null;
      this.graph = new GraphDocument();
      this.expansions = null;
      this.dataset = null;
      this.response = null;
      await this.engine.setGraph(this.graph);
      await this.engine.setSelection(this.selection);
      this.#setEmptyState(true);
      this.dispatchEvent(
        new CustomEvent("heurist-graph-loaded", {
          detail: { graph: this.graph, total: 0 },
        }),
      );
      return this.getState();
    }

    if (!merge) {
      if (normalizedQuery != null && remember) {
        this.currentResultsQuery = normalizedQuery;
      }
      if (this.source?.type === "dataset" && !internal) return this.getState();
      if (!internal) {
        this.source = { type: "query", query: normalizedQuery };
        this.dataset = null;
      }
    }

    const generation = ++this.generation;
    this.abortController?.abort("Superseded graph request");
    this.abortController = new AbortController();

    // An incremental expansion never re-runs internal-edge discovery; the
    // initial graph and a Saved Filter default to discovering every edge until
    // a Dataset supplies an explicit link set.
    const linkSelection = merge
      ? undefined
      : links ?? this.source?.links ?? this.dataset?.links ?? this.config.links ?? "all";
    const result = await this.provider.load({
      query: normalizedQuery,
      links: linkSelection,
      limits: this.config.limits,
      signal: this.abortController.signal,
    });
    if (generation !== this.generation)
      throw abortError("Superseded graph request");
    this.response = result;
    if (!merge) {
      this.edgeLabels = { fields: new Map(), relationTypes: new Map() };
      this.relationTypeTrees = {};
      this.recordTypeNames = new Map();
      this.hiddenLinks.clear();
      this.hiddenRelationships.clear();
      this.hiddenRecordTypes.clear();
    }
    this.graph =
      merge && this.graph ? this.graph.merge(result.graph) : result.graph;
    if (!merge) {
      this.expansions = new GraphExpansions(this.graph, this.getExpansionRules(), this.config.limits);
      const rules = this.getExpansionRules();
      if (rules.some(r => !r.name && r.query) && this.host?.describeRules) {
        try {
          const described = await this.host.describeRules(rules);
          if (generation !== this.generation) throw abortError('Graph changed');
          this.expansions.setRules(described);
        } catch (error) { if (error.name === 'AbortError') throw error; }
      }
    }
    this.config.query = normalizedQuery;
    const visible = this.#filterGraph(this.graph);
    await (merge
      ? this.engine.mergeGraph(visible)
      : this.engine.setGraph(visible));
    await this.engine.setSelection(this.selection);
    // Reframe the viewport only for a genuinely new/switched graph, never for
    // an incremental node expansion (merge) - an unprompted re-center while
    // expanding, or on an unrelated resize/rejected update, is disorienting.
    if (!merge) await this.engine.fit?.();
    this.#setEmptyState(this.graph.records.length === 0);
    this.dispatchEvent(
      new CustomEvent("heurist-graph-loaded", { detail: result }),
    );
    // The graph is already on screen with numeric fallback labels; swap in
    // detail-type and relation-type names once the API resolves them.
    await this.#resolveVocabulary(generation);
    return this.getState();
  }

  /**
   * Resolve human labels for every edge detail type (dty_ID) and relation type
   * (trm_ID) in the loaded graph, push them into the engine, and keep the
   * relation-type trees for the legend. Best-effort: a failure leaves the
   * numeric fallback labels untouched.
   */
  async #resolveVocabulary(generation) {
    if (!this.vocabularyProvider || !this.graph) return;
    const fieldIds = new Set();
    const relationIds = new Set();
    for (const edge of this.graph.edges) {
      if (edge.fieldId) fieldIds.add(edge.fieldId);
      if (edge.relationshipId) relationIds.add(edge.relationshipId);
    }
    for (const spec of Object.values(this.graph.links)) {
      const match = /:rt(\d+):/.exec(String(spec));
      if (match) relationIds.add(Number(match[1]));
    }
    const signal = this.abortController?.signal;
    try {
      const [fields, relations, recordTypes] = await Promise.all([
        fieldIds.size
          ? this.vocabularyProvider.getFieldNames([...fieldIds], { signal })
          : new Map(),
        relationIds.size
          ? this.vocabularyProvider.getRelationTypeTrees([...relationIds], {
              signal,
            })
          : { names: new Map(), trees: {} },
        this.vocabularyProvider.getRecordTypeNames?.(this.graph.records.map(r => r.recordTypeId), { signal }) || new Map(),
      ]);

      if (generation !== undefined && generation !== this.generation) return;
      this.edgeLabels = { fields, relationTypes: relations.names };
      this.relationTypeTrees = relations.trees;
      this.recordTypeNames = recordTypes;
      await this.engine.setEdgeLabels?.(this.edgeLabels);
      this.dispatch("heurist-graph-vocabulary-changed", {
        fields: this.edgeLabels.fields,
        relationTypes: this.edgeLabels.relationTypes,
        relationTypeTrees: this.relationTypeTrees,
      });
    } catch (error) {
      if (error?.name === "AbortError") return;
      this.dispatch("heurist-graph-error", { error, operation: "vocabulary" });
    }
  }

  async setDataset(id) {
    const dataset = await this.datasetProvider?.load?.(id);
    const query = dataset?.source?.query ?? dataset?.query;
    if (query == null || query === "") throw new Error("Dataset query is empty");
    this.dataset = dataset;
    this.config.datasetId = Number(id);
    this.config.datasetTitle = dataset.title || dataset.rec_Title || null;
    this.source = { type: "dataset", datasetId: Number(id) };
    return this.load({ query, links: dataset.links ?? "all", internal: true, remember: false });
  }

  /** Restore the most recently remembered Filtered Result query, locally. */
  activateCurrentResults() {
    this.dataset = null;
    this.source = null;
    this.config.datasetId = null;
    this.config.datasetTitle = null;
    return this.load({
      query: this.currentResultsQuery,
      internal: true,
      remember: false,
    });
  }

  /**
   * Apply a saved Filter as a new search, matching heurist-data: hosted mode
   * triggers the global ON_REC_SEARCHSTART event through the host bridge (so
   * every realm-matching widget - including this one, once the host echoes
   * the search result back - stays in sync); standalone mode runs the
   * search internally by loading the filter's query directly.
   */
  async activateFilter(filter) {
    this.dataset = null;
    this.config.datasetId = null;
    this.config.datasetTitle = null;
    this.source = null;
    const query = filter?.query ?? filter;
    if (query == null || query === "") return this.getState();
    if (this.host?.supportsSearch?.()) {
      const { createFilterSearchRequest } = await import(
        "../data/FilterSearchRequest.js"
      );
      const request = createFilterSearchRequest(filter, {
        searchRealm: this.config.searchRealm,
        source: this.config.sourceId || null,
      });
      await this.host.doSearch(request);
      return this.getState();
    }
    return this.load({ query });
  }

  /** Load per-record popup content from the configured presentation template. */
  async requestPopupContent({ recordId, signal } = {}) {
    const template = this.config.engineOptions?.popupTemplate;
    if (!template || !this.recordContentProvider) return null;
    const id = Number(recordId);
    if (!Number.isInteger(id) || id < 1) return null;
    const content = await this.recordContentProvider.load({
      records: [{ rec_ID: id }],
      template,
      signal,
    });
    return content.get(id) ?? content.get(String(id)) ?? null;
  }

  /**
   * Apply settings edited in the configuration dialog to the running
   * application, matching heurist-data's `DataApplication.applyConfiguration()`:
   * push the renderer-facing options into the live engine and re-render the
   * current graph, and let `GraphControlPanel` react to the UI-facing options
   * through the dispatched event, instead of only ever taking effect on the
   * next full reload.
   */
  /** Runtime fallback for databases without the optional Dataset record type. */
  disableDatasetEditing() {
    this.datasetAvailable = false;
    const settings = this.config.persistedSettings || {};
    this.config.persistedSettings = {
      ...settings,
      options: {
        ...settings.options,
        interaction: { ...settings.options?.interaction, readonly: true, editEnabled: false },
      },
    };
  }

  async applyConfiguration(value) {
    const { normalizeGraphConfigurationSettings } = await import(
      "../ui/config/graphConfigurationSchema.js"
    );
    const normalized = normalizeGraphConfigurationSettings(value);
    if (this.datasetAvailable === false) {
      normalized.options.interaction.readonly = true;
      normalized.options.interaction.editEnabled = false;
    }
    const defaults = normalized.config.defaults;
    this.config.persistedSettings = normalized;
    this.config.ui = normalized.options.ui;
    this.config.limits = {
      ...this.config.limits,
      maxNodes: Number(defaults.maxNodes) || this.config.limits.maxNodes,
      maxEdges: Number(defaults.maxEdges) || this.config.limits.maxEdges,
    };
    this.config.engineOptions = {
      ...this.config.engineOptions,
      gravity: defaults.gravity,
      layoutMode: defaults.layoutMode,
      movement: defaults.movement,
      scaling: defaults.scaling,
      showNodeLabels: defaults.showNodeLabels,
      showEdgeLabels: defaults.showEdgeLabels,
      labelMaxLength: defaults.labelLength,
      popupDelay: defaults.popupDelay,
      popupTemplate: defaults.popupTemplate,
      selectionEnabled: normalized.options.interaction.selectionEnabled,
      popupEnabled: normalized.options.interaction.popupEnabled,
      nativeControls: normalized.options.nativeControls,
    };
    await this.engine.applyConfiguration?.(this.config.engineOptions);
    // Gravity/scaling/label length only take effect on vis-network through a
    // fresh render (scaling recomputes each node's `value`, labels are
    // re-truncated); re-render the graph already on screen instead of
    // waiting for the next load()/expandNode().
    await this.#renderVisible();
    this.dispatch("heurist-graph-configuration-changed", {
      options: normalized.options,
      config: normalized.config,
    });
    return this.getState();
  }

  exportGephi() {
    const payload = JSON.stringify({ nodes: this.graph?.records || [], edges: this.graph?.edges || [] }, null, 2);
    if (typeof document === "undefined") return payload;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    link.download = "heurist-graph.gephi.json";
    link.click();
    URL.revokeObjectURL(link.href);
    return payload;
  }

  async expandNode(recordId) {
    const id = Number(recordId);
    if (!Number.isInteger(id) || id < 1) return false;
    await this.advanceExpansion([id]);
    return true;
  }

  getExpansionRules() {
    const value = this.ruleOverrides.get(this.config.datasetId ? `dataset:${this.config.datasetId}` : 'current')
      ?? this.dataset?.rules ?? this.config.rules ?? [];
    return typeof value === 'string' ? JSON.parse(value || '[]') : value;
  }

  async defineExpansions() {
    const generation = this.generation;
    const result = await this.host.editRules(structuredClone(this.getExpansionRules()));
    if (result == null) return;
    if (generation !== this.generation) throw new Error('The active graph changed. Reopen Define expansions.');
    await this.setExpansionRules(result.rules);
  }

  async setExpansionRules(rules) {
    if (!Array.isArray(rules)) throw new TypeError('Expansion rules must be an array');
    this.ruleOverrides.set(this.config.datasetId ? `dataset:${this.config.datasetId}` : 'current', structuredClone(rules));
    this.expansions?.setRules(rules);
    await this.renderExpansions();
  }

  async resetExpansionRules() {
    this.ruleOverrides.delete(this.config.datasetId ? `dataset:${this.config.datasetId}` : 'current');
    this.expansions?.setRules(this.getExpansionRules());
    await this.renderExpansions();
  }

  getExpansionState(seedIds = null) {
    const state = this.expansions;
    const scopes = state ? (seedIds?.length ? seedIds.map(id => state.scope([id])) : [state.scope()]) : [];
    const maxDepth = Math.max(0, ...(state?.rules || []).filter(r => r.enabled).map(r => r.maxDepth));
    return { depth: scopes.length ? Math.min(maxDepth, ...scopes.map(s => s.depth)) : 0,
      maxDepth,
      busy: !!this.expansionBusy };
  }

  async setRuleEnabled(id, enabled) {
    const state = this.expansions;
    const rule = state?.rules.find(r => r.id === id);
    if (!rule) return;
    rule.enabled = enabled;
    if (!enabled) return this.renderExpansions();
    const scope = state.scope();
    const previousDepth = scope.depth;
    scope.depth = Math.max(scope.depth, rule.maxDepth);
    try { await this.runExpansion(state, rule, scope); }
    catch (error) {
      rule.enabled = false; scope.depth = previousDepth;
      if (state === this.expansions) await this.renderExpansions();
      throw error;
    }
  }

  async setExpansionDepth(depth, seedIds = null) {
    const state = this.expansions;
    if (!state) return;
    // Individual seed memberships keep a multi-selection's surviving branches
    // active when another selected seed loses its last contributing source.
    if (seedIds?.length > 1) {
      for (const id of seedIds) {
        if (state !== this.expansions) return;
        await this.setExpansionDepth(depth, [id]);
      }
      return;
    }
    const scope = state.scope(seedIds);
    if (!scope.seeds.every(id => this.graph.recordIds.includes(id))) return;
    const previous = scope.depth;
    scope.depth = Math.max(0, Math.min(Number(depth) || 0, this.getExpansionState(seedIds).maxDepth));
    try {
      for (const rule of state.rules.filter(r => r.enabled)) await this.runExpansion(state, rule, scope);
      if (state === this.expansions) await this.renderExpansions();
    } catch (error) {
      scope.depth = previous;
      if (state === this.expansions) await this.renderExpansions();
      throw error;
    }
  }

  advanceExpansion(seedIds = null) { return this.setExpansionDepth(this.getExpansionState(seedIds).depth + 1, seedIds); }
  pruneExpansion(seedIds = null) { return this.setExpansionDepth(this.getExpansionState(seedIds).depth - 1, seedIds); }

  runExpansion(state, rule, scope) {
    const valid = () => state === this.expansions && state.rules.includes(rule) && rule.enabled;
    const generation = this.generation;
    const run = async () => {
      if (!valid() || generation !== this.generation) return;
      this.expansionBusy = true;
      this.dispatch('heurist-graph-expansions-changed', {});
      try {
        await state.ensure(rule, scope, scope.depth, (seeds, step) => this.provider.load({
          query: { ids: seeds }, rule: step, limit: seeds.length,
          limits: this.config.limits, signal: this.abortController?.signal,
        }), () => valid() && generation === this.generation);
        if (valid() && generation === this.generation) await this.renderExpansions();
      } finally {
        this.expansionBusy = false;
        this.dispatch('heurist-graph-expansions-changed', {});
      }
    };
    const pending = this.expansionQueue.then(run);
    this.expansionQueue = pending.catch(() => {});
    return pending;
  }

  async renderExpansions() {
    if (!this.expansions) return;
    this.graph = this.expansions.compose();
    const visible = this.#filterGraph(this.graph);
    await (this.engine.syncGraph ? this.engine.syncGraph(visible) : this.engine.setGraph(visible));
    await this.engine.setSelection(this.selection.filter(id => this.graph.recordIds.includes(id)));
    await this.#resolveVocabulary(this.generation);
    this.dispatch('heurist-graph-expansions-changed', {});
  }

  /**
   * Resolved edge vocabulary for the legend renderer: detail-type names keyed
   * by dty_ID, relation-type names keyed by trm_ID, and each relation type's
   * descendant tree (`{ id, label, children }`) keyed by its root trm_ID.
   */
  getVocabulary() {
    return {
      fields: this.edgeLabels.fields,
      relationTypes: this.edgeLabels.relationTypes,
      relationTypeTrees: this.relationTypeTrees,
    };
  }

  /** Best available human label for a legend link group, or null. */
  #linkLabel(entry) {
    const root = /:rt(\d+):/.exec(String(entry.spec || ''));
    if (root && this.edgeLabels.relationTypes.has(Number(root[1]))) {
      return this.edgeLabels.relationTypes.get(Number(root[1]));
    }
    if (entry.relationshipId) {
      const name = this.edgeLabels.relationTypes.get(entry.relationshipId);
      if (name) return name;
    }
    if (entry.fieldId) {
      const name = this.edgeLabels.fields.get(entry.fieldId);
      if (name) return name;
    }
    return null;
  }

  /**
   * Legend model derived from the loaded graph: node counts by record type and
   * edge counts by link group, each with its current visibility flag. Link
   * groups also carry a resolved `label` and the relation-type trees are
   * included for the renderer.
   */
  getLegend() {
    const recordTypes = new Map();
    const links = new Map();
    const typesById = new Map((this.graph?.records || []).map(r => [r.id, r.recordTypeId]));
    for (const record of this.graph?.records || []) {
      const key = record.recordTypeId || 0;
      recordTypes.set(key, (recordTypes.get(key) || 0) + 1);
    }
    for (const edge of this.graph?.edges || []) {
      const key = edgeGroupKey(edge);
      const entry = links.get(key) || {
        key,
        count: 0,
        endpoints: new Set(),
        relationships: new Map(),
        link: edge.link || null,
        path: edge.path || null,
        fieldId: edge.fieldId || null,
        relationshipId: edge.relationshipId || null,
        spec: (edge.link && this.graph?.links?.[edge.link]) || null,
      };
      entry.count += 1;
      const from = typesById.get(edge.from), to = typesById.get(edge.to);
      entry.endpoints.add((this.recordTypeNames.get(from) || from || '?') + (edge.relationshipId ? ' ↔ ' : ' → ') + (this.recordTypeNames.get(to) || to || '?'));
      if (edge.relationshipId) entry.relationships.set(edge.relationshipId, (entry.relationships.get(edge.relationshipId) || 0) + 1);
      links.set(key, entry);
    }
    return {
      total: this.response?.total ?? null,
      offset: this.response?.offset || 0,
      limits: this.graph?.limits || {},
      rules: this.expansions ? this.expansions.rules.map(r => ({ ...r.definition, id:r.id, enabled:r.enabled })) : this.getExpansionRules(),
      rulesOverridden: this.ruleOverrides.has(this.config.datasetId ? `dataset:${this.config.datasetId}` : 'current'),
      recordTypes: [...recordTypes.entries()].map(([recordTypeId, count]) => ({
        recordTypeId,
        color: this.engine.getNodeColor?.(recordTypeId),
        label: this.recordTypeNames.get(recordTypeId) || `Record type ${recordTypeId}`,
        count,
        visible: !this.hiddenRecordTypes.has(recordTypeId),
      })),
      links: [...links.values()].map((entry) => ({
        ...entry,
        label: this.#linkLabel(entry),
        endpoints: [...entry.endpoints],
        relationships: [...entry.relationships].map(([id, count]) => ({ id, count, visible: !this.hiddenRelationships.has(entry.key + ':' + id) })),
        visible: !this.hiddenLinks.has(entry.key),
      })),
      relationTypeTrees: this.relationTypeTrees,
    };
  }

  /** Show or hide every node of one record type without reloading. */
  async setRecordTypeVisibility(recordTypeId, visible) {
    const key = Number(recordTypeId) || 0;
    if (visible === false) this.hiddenRecordTypes.add(key);
    else this.hiddenRecordTypes.delete(key);
    await this.#renderVisible();
    return this.getLegend();
  }

  /** Show or hide every edge of one link group without reloading. */
  async setLinkVisibility(key, visible) {
    const group = String(key);
    if (visible === false) this.hiddenLinks.add(group);
    else {
      this.hiddenLinks.delete(group);
      for (const token of this.hiddenRelationships) {
        if (token.startsWith(group + ':')) this.hiddenRelationships.delete(token);
      }
    }
    await this.#renderVisible();
    return this.getLegend();
  }

  async setRelationshipVisibility(key, ids, visible) {
    for (const id of ids) {
      const token = String(key) + ':' + Number(id);
      if (visible === false) this.hiddenRelationships.add(token);
      else this.hiddenRelationships.delete(token);
    }
    await this.#renderVisible();
    return this.getLegend();
  }

  async #renderVisible() {
    const graph = this.#filterGraph(this.graph || new GraphDocument());
    await (this.engine.syncGraph ? this.engine.syncGraph(graph) : this.engine.setGraph(graph));
    await this.engine.setSelection(this.selection);
    this.dispatch("heurist-graph-visibility-changed", {});
  }

  /** Drop hidden record types, hidden link groups, and now-dangling edges. */
  #filterGraph(graph) {
    if (!this.hiddenRecordTypes.size && !this.hiddenLinks.size && !this.hiddenRelationships.size) return graph;
    const records = graph.records.filter(
      (record) => !this.hiddenRecordTypes.has(record.recordTypeId || 0),
    );
    const visibleIds = new Set(records.map((record) => record.id));
    const edges = graph.edges.filter(
      (edge) =>
        !this.hiddenLinks.has(edgeGroupKey(edge)) &&
        !this.hiddenRelationships.has(edgeGroupKey(edge) + ":" + edge.relationshipId) &&
        visibleIds.has(edge.from) &&
        visibleIds.has(edge.to),
    );
    return new GraphDocument({
      records,
      edges,
      links: graph.links,
      paths: graph.paths,
      limits: graph.limits,
    });
  }

  /** Hide the vis-network canvas and show the configured empty-result message. */
  #setEmptyState(empty) {
    if (this.canvasElement) this.canvasElement.hidden = empty;
    if (!this.messageElement) return;
    this.messageElement.hidden = !empty;
    if (empty) {
      this.messageElement.textContent =
        this.config.persistedSettings?.config?.defaults?.emptyResultMessage ||
        "No records";
    }
  }

  async setSelection(recordIds, { fromEngine = false } = {}) {
    this.selection = normalizeIds(recordIds);
    if (!fromEngine) await this.engine.setSelection(this.selection);
    this.dispatchEvent(
      new CustomEvent("heurist-graph-selection-changed", {
        detail: { recordIds: [...this.selection] },
      }),
    );
    this.host?.publishSelection?.(this.selection);
    return [...this.selection];
  }

  async clearSelection() {
    return this.setSelection([]);
  }

  getState() {
    return {
      query: this.config.query,
      datasetId: this.config.datasetId || null,
      datasetTitle: this.config.datasetTitle || null,
      selection: [...this.selection],
      recordIds: this.graph?.recordIds || [],
      limits: this.graph?.limits || null,
      expansions: this.#expansionState(),
      hidden: {
        recordTypes: [...this.hiddenRecordTypes],
        links: [...this.hiddenLinks],
        relationships: [...this.hiddenRelationships],
      },
    };
  }

  /**
   * Reproducible base-scope expansion state for publication: the effective rule
   * definitions (dataset/config rules plus any "Define expansions" override), a
   * parallel array of which rules are active, and the shared expansion depth.
   * Per-seed (single-node) expansions are intentionally not captured.
   */
  #expansionState() {
    if (!this.expansions) return null;
    const wrapped = this.expansions.rules || [];
    if (!wrapped.length) return null;
    return {
      rules: this.getExpansionRules(),
      enabled: wrapped.map((rule) => rule.enabled === true),
      depth: this.expansions.scope().depth || 0,
    };
  }

  resize() {
    return this.engine.resize();
  }

  dispatch(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail }));
  }

  async destroy() {
    this.generation += 1;
    this.abortController?.abort("Graph destroyed");
    await this.engine.destroy();
    await this.host?.destroy?.();
  }
}

/** Stable key that groups edges by configured link, then field, then relation. */
function edgeGroupKey(edge) {
  if (edge.link) return `link:${edge.link}`;
  if (edge.path) return `path:${edge.path}`;
  if (edge.fieldId) return `field:${edge.fieldId}`;
  if (edge.relationshipId) return `relationship:${edge.relationshipId}`;
  return "other";
}

function normalizeIds(value) {
  const values = Array.isArray(value) ? value : [];
  return [
    ...new Set(
      values.map(Number).filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];
}

function abortError(message) {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}
