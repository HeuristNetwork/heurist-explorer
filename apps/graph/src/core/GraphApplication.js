/**
 * @file GraphApplication.js
 * @brief Coordinates graph loading, merging, selection, and rendering.
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

import { GraphDocument } from "./GraphDocument.js";
import { GraphExpansions } from './GraphExpansions.js';
import { QuerySource } from "#shared/data/QuerySource.js";
import { normalizeGraphConfigurationSettings } from "../ui/config/graphConfigurationSchema.js";

/** Coordinates graph loading, merging, selection, expansions, legend state, and rendering. */
export class GraphApplication extends EventTarget {
  /**
   * @param {object} options Application configuration.
   * @param {object} options.config Normalized Graph configuration; see `graphConfig.js`.
   * @param {object} options.provider Graph data provider (loads/merges query results into a `GraphDocument`).
   * @param {object} options.engine Rendering engine adapter.
   * @param {object} options.host Host adapter.
   * @param {object|null} [options.querySourceProvider] Loads persisted Query Source records.
   * @param {object|null} [options.recordContentProvider] Loads per-record popup content.
   * @param {object|null} [options.vocabularyProvider] Resolves field/relation-type/record-type display names.
   */
  constructor({
    config,
    provider,
    engine,
    host,
    querySourceProvider = null,
    recordContentProvider = null,
    vocabularyProvider = null,
  }) {
    super();
    this.config = config;
    this.provider = provider;
    this.engine = engine;
    this.host = host;
    this.querySourceProvider = querySourceProvider;
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
    this.querySource = null;
    this.response = null;
    this.recordTypeNames = new Map();
    // Active load tracking, mirroring heurist-data's DataApplication: a
    // persisted Query Source "wins" against inbound Filtered Result queries until
    // the viewer explicitly reactivates Filtered Result.
    this.activeLoad = null;
    // The host-pushed DataSource currently active (main runtime only), and
    // whether the viewer has "stuck" it so a new inbound push is ignored.
    this.dataSource = null;
    this.pinned = false;
    this.currentResultsQuery =
      config.query == null || config.query === "" ? null : config.query;
    // DOM handles for the empty-result presentation. Set by initialize().
    this.canvasElement = null;
    this.messageElement = null;
  }

  /**
   * Initialize the host, load persisted preferences, initialize the rendering engine, and restore the initial view.
   *
   * @param {HTMLElement} container Element the rendering engine renders into.
   * @param {{messageElement?: HTMLElement|null}} [options] `messageElement` shown when the graph is empty.
   * @returns {Promise<GraphApplication>} This instance, once initialization completes.
   */
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
   * Reproduce a published (or host-seeded) view: activate the persisted Query Source
   * by id, or run the persisted query, then re-apply the saved base-scope
   * expansions and legend visibility. Matches heurist-data's publish/open cycle.
   */
  async #restoreInitialView() {
    let loaded = false;
    if (this.config.querySourceId) {
      try {
        await this.setQuerySource(this.config.querySourceId);
        loaded = true;
      } catch (error) {
        this.dispatch("heurist-graph-error", {
          error,
          operation: "restore-query-source",
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
    const key = this.config.querySourceId
      ? `querySource:${this.config.querySourceId}`
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
   * A plain (non-merge) call is ignored while a persisted Query Source is the
   * active source - matching heurist-data's `DataApplication.setQuery()` -
   * so a Filtered Result query the host pushes (a global search event, once
   * applied after the widget becomes visible) never clobbers a Query Source the
   * viewer deliberately selected. Internal callers that manage `this.activeLoad`
   * themselves (`setQuerySource`, `setDataSource`) pass `internal: true` to
   * bypass that guard.
   *
   * Whatever the outcome, the *remembered* Filtered Result query
   * (`this.currentResultsQuery`) is still updated first (matching
   * heurist-data's "host search events keep Current Results up to date"
   * comment), even one that arrived while a Query Source was on screen - not
   * a stale query from before the Query Source was selected. Pass
   * `remember: false` to skip that (restoring/loading a Query Source's own query
   * must never be remembered as a Filtered Result query).
   *
   * An explicit `null`/empty query always wins, even over an active Query Source -
   * it deactivates any Query Source and shows the empty-result message.
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
      this.activeLoad = null;
      this.config.querySourceId = null;
      this.config.querySourceTitle = null;
      this.config.query = null;
      this.graph = new GraphDocument();
      this.expansions = null;
      this.querySource = null;
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
      if (this.activeLoad?.type === "source" && !internal) return this.getState();
      if (!internal) {
        this.activeLoad = { type: "query", query: normalizedQuery };
        this.querySource = null;
      }
    }

    const generation = ++this.generation;
    this.abortController?.abort("Superseded graph request");
    this.abortController = new AbortController();

    // An incremental expansion never re-runs internal-edge discovery; the
    // initial graph and a Saved Filter default to discovering every edge
    // unless the caller (or the configured default) narrows it.
    const linkSelection = merge
      ? undefined
      : links ?? this.config.links ?? "all";
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
    // Reframing is requested via `setGraph()` itself (never for an incremental
    // node expansion/merge - an unprompted re-center while expanding, or on an
    // unrelated resize/rejected update, is disorienting) and applied by the
    // engine once its layout has actually settled; fitting synchronously here,
    // before physics stabilizes, would frame the pre-stabilization positions
    // and leave the settled graph off-center.
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

  /**
   * Load a persisted Query Source by id and activate it as the graph's source.
   *
   * Internal: fetches the persisted definition by id, needed for website/
   * publication mode (no host to pre-resolve it) and to restore a published
   * view. Not exposed on the public API.
   *
   * @param {number|string} id Query Source record id.
   * @returns {Promise<object>} Updated application state.
   * @throws {Error} When the Query Source has no executable query.
   */
  async setQuerySource(id) {
    const payload = await this.querySourceProvider?.load?.(id);
    const querySource = new QuerySource(payload);
    this.querySource = querySource;
    this.dataSource = null;
    this.config.querySourceId = Number(id);
    this.config.querySourceTitle = querySource.title || null;
    this.activeLoad = { type: "source", querySourceId: Number(id) };
    return this.load({ query: querySource.source.query, internal: true, remember: false });
  }

  /**
   * Apply a DataSource pushed by the host (main runtime only), unless the viewer has
   * "stuck" the current one - matching heurist-data's `DataApplication.setDataSource()`,
   * plus the pin guard described on `setPinned()`.
   *
   * @param {object} dataSource DataSource to activate.
   * @returns {Promise<object>} Updated application state; unchanged when pinned.
   */
  async setDataSource(dataSource) {
    if (this.pinned) return this.getState();
    const query = dataSource?.request?.q ?? dataSource?.query ?? null;
    this.querySource = null;
    this.dataSource = dataSource || null;
    // A restored/current rule override belongs to the previous datasource.
    // Keeping it here would mask request.rules supplied by the new Query Source.
    this.ruleOverrides.delete('current');
    this.config.querySourceId = null;
    this.config.querySourceTitle = dataSource?.title || null;
    this.activeLoad = { type: "datasource", dataSource };
    return this.load({ query, links: dataSource?.links ?? "all", internal: true, remember: false });
  }

  /**
   * Stick (or unstick) the active DataSource: while pinned, `setDataSource()` ignores
   * every inbound host push instead of replacing the current graph.
   *
   * @param {boolean} pinned New pinned state.
   * @returns {boolean} The applied pinned state.
   */
  setPinned(pinned) {
    this.pinned = pinned === true;
    this.dispatch("heurist-graph-pin-changed", { pinned: this.pinned });
    return this.pinned;
  }

  /**
   * Toggle the pinned state; see `setPinned()`.
   *
   * @returns {boolean} The applied pinned state.
   */
  togglePinned() {
    return this.setPinned(!this.pinned);
  }

  /**
   * Ask the host to activate and display the active DataSource.
   *
   * @returns {Promise<boolean|*>} `false` when there is no active DataSource or the host can't show it, otherwise the host's result.
   */
  async showDataSource() {
    if (!this.dataSource || typeof this.host?.showDatasource !== "function") return false;
    return this.host.showDatasource(this.dataSource);
  }

  /**
   * Return the host's optional capability flags.
   *
   * @returns {object} Capability flags, or `{}` when the host declares none.
   */
  getHostCapabilities() {
    return this.host?.getCapabilities?.() || {};
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
   *
   * @param {object} value Raw settings value from the configuration dialog.
   * @returns {Promise<object>} Updated application state.
   */
  async applyConfiguration(value) {
    const normalized = normalizeGraphConfigurationSettings(value);
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

  /**
   * Serialize and download the current graph as Gephi-compatible JSON.
   *
   * @returns {string} The serialized JSON payload (also returned in non-browser environments, without triggering a download).
   */
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

  /**
   * Expand one node by one additional depth level.
   *
   * @param {number|string} recordId Record id to expand from.
   * @returns {Promise<boolean>} True when the id was valid and expansion was requested.
   */
  async expandNode(recordId) {
    const id = Number(recordId);
    if (!Number.isInteger(id) || id < 1) return false;
    await this.advanceExpansion([id]);
    return true;
  }

  /**
   * Return the effective expansion rules: a restored rule override (from a published view), else
   * the Query Source's or config's rules.
   *
   * @returns {Array<object>} Expansion rule definitions.
   */
  getExpansionRules() {
    const value = this.ruleOverrides.get(this.config.querySourceId ? `querySource:${this.config.querySourceId}` : 'current')
      ?? this.querySource?.rules
      ?? this.dataSource?.request?.rules
      ?? this.config.rules
      ?? [];
    return typeof value === 'string' ? JSON.parse(value || '[]') : value;
  }

  /**
   * Discard a restored rule override, reverting to the Query Source's or config's saved rules.
   *
   * @returns {Promise<void>}
   */
  async resetExpansionRules() {
    this.ruleOverrides.delete(this.config.querySourceId ? `querySource:${this.config.querySourceId}` : 'current');
    this.expansions?.setRules(this.getExpansionRules());
    await this.renderExpansions();
  }

  /**
   * Current expansion depth/max-depth/busy state, for one seed set or the whole graph.
   *
   * @param {Array<number>|null} [seedIds] Seed record ids to scope the state to; omit for the base scope.
   * @returns {{depth: number, maxDepth: number, busy: boolean}}
   */
  getExpansionState(seedIds = null) {
    const state = this.expansions;
    const scopes = state ? (seedIds?.length ? seedIds.map(id => state.scope([id])) : [state.scope()]) : [];
    const maxDepth = Math.max(0, ...(state?.rules || []).filter(r => r.enabled).map(r => r.maxDepth));
    return { depth: scopes.length ? Math.min(maxDepth, ...scopes.map(s => s.depth)) : 0,
      maxDepth,
      busy: !!this.expansionBusy };
  }

  /**
   * Enable or disable one expansion rule, running it immediately when enabled.
   *
   * @param {number|string} id Expansion rule id.
   * @param {boolean} enabled New enabled state.
   * @returns {Promise<void>}
   */
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

  /**
   * Set the expansion depth for one or more seeds (or the base scope), running enabled rules to that depth.
   *
   * @param {number} depth Target depth, clamped to `[0, maxDepth]`.
   * @param {Array<number>|null} [seedIds] Seed record ids to scope the change to; omit for the base scope.
   * @returns {Promise<void>}
   */
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

  /**
   * Expand one additional depth level for one or more seeds (or the base scope).
   *
   * @param {Array<number>|null} [seedIds] Seed record ids; omit for the base scope.
   * @returns {Promise<void>}
   */
  advanceExpansion(seedIds = null) { return this.setExpansionDepth(this.getExpansionState(seedIds).depth + 1, seedIds); }

  /**
   * Retreat one depth level for one or more seeds (or the base scope).
   *
   * @param {Array<number>|null} [seedIds] Seed record ids; omit for the base scope.
   * @returns {Promise<void>}
   */
  pruneExpansion(seedIds = null) { return this.setExpansionDepth(this.getExpansionState(seedIds).depth - 1, seedIds); }

  /**
   * Queue and run one expansion rule to its scope's current depth, serialized against other expansions.
   *
   * @param {import('./GraphExpansions.js').GraphExpansions} state Expansion state this rule belongs to.
   * @param {object} rule Expansion rule to run.
   * @param {object} scope Expansion scope (seeds and depth) to run the rule against.
   * @returns {Promise<void>}
   */
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

  /**
   * Recompose the graph from the current expansion state and push it to the engine.
   *
   * @returns {Promise<void>}
   */
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
      rulesOverridden: this.ruleOverrides.has(this.config.querySourceId ? `querySource:${this.config.querySourceId}` : 'current'),
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

  /**
   * Show or hide specific relationship types within a link group without reloading.
   *
   * @param {string} key Link group key; see `getLegend`.
   * @param {Array<number|string>} ids Relation-type (trm_ID) ids to toggle.
   * @param {boolean} visible New visibility state.
   * @returns {Promise<object>} Updated legend model; see `getLegend`.
   */
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

  /**
   * Set the selected record IDs, syncing the engine and notifying the host and public API listeners.
   *
   * @param {Array<number>} recordIds Selected record IDs.
   * @param {{fromEngine?: boolean}} [options] Pass `fromEngine: true` when the selection originated from the engine, to avoid echoing it back.
   * @returns {Promise<Array<number>>} The applied selection.
   */
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

  /**
   * Clear the current selection.
   *
   * @returns {Promise<Array<number>>} The applied (empty) selection.
   */
  async clearSelection() {
    return this.setSelection([]);
  }

  /**
   * Return the current serialized application state.
   *
   * @returns {object} Current application state.
   */
  getState() {
    return {
      query: this.config.query,
      querySourceId: this.config.querySourceId || null,
      querySourceTitle: this.config.querySourceTitle || null,
      pinned: this.pinned,
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
   * definitions (Query Source/config rules plus any restored override), a
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

  /**
   * Resize the rendering engine.
   *
   * @returns {*} Result of the engine's resize call.
   */
  resize() {
    return this.engine.resize();
  }

  /**
   * Dispatch a CustomEvent carrying `detail`.
   *
   * @param {string} name Event name.
   * @param {object} detail Event detail payload.
   * @returns {void}
   */
  dispatch(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail }));
  }

  /**
   * Abort in-flight requests and tear down the engine and host.
   *
   * @returns {Promise<void>}
   */
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

/** Normalize a value into a de-duplicated array of positive integer IDs. */
function normalizeIds(value) {
  const values = Array.isArray(value) ? value : [];
  return [
    ...new Set(
      values.map(Number).filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];
}

/** Build an `AbortError`-named Error, for cancellation paths that mimic `AbortController` semantics. */
function abortError(message) {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}
