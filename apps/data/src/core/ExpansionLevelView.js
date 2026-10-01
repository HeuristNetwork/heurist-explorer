/**
 * @file ExpansionLevelView.js
 * @brief Expansion-level pane of the Data module: records reached by the rules at level n.
 *
 * Each level is one ordinary paged query (`expansionLevelQuery`, plan 09 §7). The
 * view holds a list of level panes (one HRecordList + its own load state each);
 * there is one pane now, several levels at once only add panes (U5).
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-data
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { expansionLevelQuery, rulesDepth } from "#shared/data/expansionRules.js";
import { $HR } from "#shared/ui";

/** Delay before a changed selection reloads the filtered level. */
const SELECTION_DELAY = 250;

/** Width of the module below which the level pane goes under the main list. */
const NARROW_WIDTH = 700;

/** Owns the level pane(s) beside the main record list and their level queries. */
export class ExpansionLevelView {
  /**
   * @param {object} options View dependencies.
   * @param {import('./DataApplication.js').DataApplication} options.application Data application (loaders, providers, callbacks).
   * @param {HTMLElement} options.frame Module frame holding the main list and the level panes.
   */
  constructor({ application, frame }) {
    this.application = application;
    this.frame = frame;
    this.rules = [];
    this.enabled = [];
    this.level = 1;
    this.cumulative = false;
    this.filterBySelection = true;
    this.active = false;
    this.panes = [];
    this.selectionTimer = null;
    this.resizeObserver = typeof ResizeObserver === "function"
      ? new ResizeObserver(() => this._applyLayout())
      : null;
    this.resizeObserver?.observe(frame);
  }

  /**
   * Replace the rules (`request.rules` of the active DataSource). Rules keep their
   * enabled state by position; new rules start enabled. The level is kept while
   * the rules still reach it.
   *
   * @param {Array<object>} rules Expansion rules.
   * @param {{reset?: boolean, reload?: boolean}} [options] `reset` enables all rules and
   *   returns to level 1; `reload: false` when a new main result follows (it reloads then).
   * @returns {Promise<void>}
   */
  async setRules(rules, { reset = false, reload = true } = {}) {
    const next = Array.isArray(rules) ? structuredClone(rules) : [];
    const previous = reset ? [] : this.enabled;
    this.rules = next;
    this.enabled = next.map((rule, index) => previous[index] ?? true);
    if (reset) this.level = 1;
    this.level = Math.max(1, Math.min(this.level, this.maxDepth() || 1));
    if (!this.rules.length && this.active) await this.setActive(false);
    else if (reload) await this.reload();
    else this._changed();
  }

  /** @returns {Array<object>} Enabled rules. */
  enabledRules() {
    return this.rules.filter((rule, index) => this.enabled[index]);
  }

  /** @returns {number} Deepest level of the enabled rules (0 when none). */
  maxDepth() {
    return rulesDepth(this.enabledRules());
  }

  /**
   * Show or hide the level pane. Showing loads the current level.
   *
   * @param {boolean} active Whether the pane is shown.
   * @returns {Promise<void>}
   */
  async setActive(active) {
    this.active = Boolean(active) && this.rules.length > 0;
    if (this.active && !this.panes.length) await this._createPane();
    for (const pane of this.panes) pane.element.hidden = !this.active;
    this.frame.classList.toggle("heurist-data-expanded", this.active);
    this._applyLayout();
    if (this.active) await this.reload();
    else for (const pane of this.panes) this._abort(pane);
    this._changed();
  }

  /**
   * Show another level (1 to the deepest level of the enabled rules).
   *
   * @param {number} level Level to show.
   * @returns {Promise<void>}
   */
  async setLevel(level) {
    const value = Math.max(1, Math.min(Number(level) || 1, this.maxDepth() || 1));
    if (value === this.level) return;
    this.level = value;
    await this.reload();
  }

  /**
   * Enable or disable one rule.
   *
   * @param {number} index Rule position.
   * @param {boolean} enabled Whether the rule is used.
   * @returns {Promise<void>}
   */
  async setRuleEnabled(index, enabled) {
    if (!this.rules[index]) return;
    this.enabled[index] = Boolean(enabled);
    this.level = Math.max(1, Math.min(this.level, this.maxDepth() || 1));
    await this.reload();
  }

  /**
   * Show exactly level n, or all levels 1..n (legacy `rulesonly` 2 / 1).
   *
   * @param {boolean} cumulative Whether the lower levels are included.
   * @returns {Promise<void>}
   */
  async setCumulative(cumulative) {
    this.cumulative = Boolean(cumulative);
    await this.reload();
  }

  /**
   * Filter the level by the main list's selection (D7), or show it for the whole result.
   *
   * @param {boolean} value Whether the selection filters the level.
   * @returns {Promise<void>}
   */
  async setFilterBySelection(value) {
    this.filterBySelection = Boolean(value);
    await this.reload();
  }

  /**
   * The main list's selection changed: reload the level when it filters it.
   *
   * @returns {void}
   */
  selectionChanged() {
    if (!this.active || !this.filterBySelection) return;
    clearTimeout(this.selectionTimer);
    this.selectionTimer = setTimeout(() => void this.reload(), SELECTION_DELAY);
  }

  /**
   * The level query of the current state.
   *
   * @param {number} [level] Level; defaults to the shown one.
   * @returns {object|null} Query, or `null` when there is nothing to show.
   */
  levelQuery(level = this.level) {
    const base = this.application.getState().query;
    const selection = this.application.selection;
    return expansionLevelQuery(base, this.enabledRules(), level, {
      parentIds: this.filterBySelection && selection.length ? selection : null,
      cumulative: this.cumulative,
    });
  }

  /**
   * Reload the first page of every shown level pane.
   *
   * @returns {Promise<void>}
   */
  async reload() {
    clearTimeout(this.selectionTimer);
    if (!this.active) return this._changed();
    await Promise.all(this.panes.map(async (pane) => {
      pane.query = this.levelQuery(pane.level ?? this.level);
      pane.total = null;
      if (pane.query) await pane.list.reload();
      else {
        this._abort(pane);
        await pane.list.setData({ querySource: null, records: [], pagination: { total: 0, offset: 0 } });
      }
    }));
    this._changed();
  }

  /**
   * Apply the main list's configuration to the level lists (view mode, templates, font size).
   *
   * @returns {Promise<void>}
   */
  async applyConfiguration() {
    for (const pane of this.panes) await pane.list.applyConfiguration(this._listOptions());
  }

  /**
   * Current state for the header controls.
   *
   * @returns {{available: boolean, active: boolean, level: number, maxDepth: number, cumulative: boolean, filterBySelection: boolean, loading: boolean, total: number|null, rules: Array<object>}}
   */
  getState() {
    const pane = this.panes[0];
    return {
      available: this.rules.length > 0,
      active: this.active,
      level: this.level,
      maxDepth: this.maxDepth(),
      cumulative: this.cumulative,
      filterBySelection: this.filterBySelection,
      loading: Boolean(pane?.loading),
      total: pane?.total ?? null,
      rules: this.rules.map((rule, index) => ({
        index,
        name: rule.name || rule.title || null,
        description: rule.description || "",
        enabled: Boolean(this.enabled[index]),
      })),
    };
  }

  /**
   * Stop loading, remove the panes and the resize observer.
   *
   * @returns {Promise<void>}
   */
  async destroy() {
    clearTimeout(this.selectionTimer);
    this.resizeObserver?.disconnect();
    for (const pane of this.panes) {
      this._abort(pane);
      await pane.list.destroy();
      pane.element.remove();
    }
    this.panes = [];
    this.frame.classList.remove("heurist-data-expanded", "heurist-data-narrow");
  }

  /** Create one level pane: a container with its own HRecordList and load state. */
  async _createPane() {
    const element = document.createElement("div");
    element.className = "heurist-data-level-pane";
    const caption = document.createElement("div");
    caption.className = "heurist-source-header";
    const host = document.createElement("div");
    host.className = "heurist-data-level-list";
    element.append(caption, host);
    this.frame.append(element);
    const app = this.application;
    // the record-list engine comes from the application's engine factory
    const list = await app.engineFactory("recordlist");
    const pane = { element, caption, list, level: null, query: null, total: null,
      generation: 0, abortController: null, loading: false, selection: [] };
    await pane.list.initialize({
      container: host,
      options: this._listOptions(),
      // local selection only (U4): never sent to the host, so it cannot replace
      // the main selection that filters this list
      onSelectionChange: (ids) => { pane.selection = ids; },
      onEditRecord: (id) => app.requestEditRecord(id),
      onViewRecord: (id, anchor) => app.requestViewRecord(id, anchor),
      onCollectionToggle: (id, collected) => app.setRecordCollected(id, collected),
      onCollectionAction: (action, ids) => (action === "show" ? false : app.applyCollectionAction(action, ids)),
      onRecordContentRequest: (request) => app.requestRecordContent(request),
      onDataRequest: (request) => this._loadPage(pane, request),
    });
    await pane.list.setCollection(app.collection);
    this.panes.push(pane);
  }

  /** Options of a level list: the main list's, without search, view-mode switch and source actions. */
  _listOptions() {
    const options = this.application._engineOptions();
    const viewMode = this.application.getState().viewMode;
    return {
      ...options,
      viewMode: viewMode && viewMode !== "datatable" ? viewMode : "list",
      controls: { ...options.controls, search: false, viewMode: false },
      sourceActionsEnabled: false,
      engineSwitch: false,
      emptyResultMessage: "No linked records",
    };
  }

  /** Load one page of a pane's level query; superseded requests are aborted. */
  async _loadPage(pane, { offset, limit, sort } = {}) {
    if (!pane.query) return { records: [], recordsTotal: 0, recordsFiltered: 0 };
    this._abort(pane);
    const controller = new AbortController();
    const generation = ++pane.generation;
    pane.abortController = controller;
    pane.loading = true;
    this._changed();
    try {
      const result = await this.application.loaders.load("query", {
        query: pane.query,
        limit,
        offset,
        sort,
        includeQuerySourceFields: false,
        additionalFields: this.application._presentationFields(),
        signal: controller.signal,
      });
      if (generation !== pane.generation) throw abortError();
      const total = Number(result.response.pagination?.total) || 0;
      pane.total = total;
      return { querySource: result.querySource, records: result.response.records || [],
        meta: result.response.meta || {}, recordsTotal: total, recordsFiltered: total };
    } catch (error) {
      if (!controller.signal.aborted && error?.name !== "AbortError") {
        this.application.dispatch("heurist-data-error", { error, operation: "expansion-level" });
      }
      throw error;
    } finally {
      if (generation === pane.generation) {
        pane.loading = false;
        pane.abortController = null;
        this._changed();
      }
    }
  }

  /** Abort a pane's request in flight. */
  _abort(pane) {
    pane.abortController?.abort(abortError());
    pane.abortController = null;
    pane.loading = false;
  }

  /** Put the level pane under the main list when the module is narrow. */
  _applyLayout() {
    const width = this.frame.getBoundingClientRect?.().width || 0;
    this.frame.classList.toggle("heurist-data-narrow", this.active && width > 0 && width < NARROW_WIDTH);
  }

  /** Refresh the pane captions and tell the header controls that the state changed. */
  _changed() {
    for (const pane of this.panes) {
      const level = pane.level ?? this.level;
      const levels = this.cumulative && level > 1 ? `1–${level}` : String(level);
      const selection = this.filterBySelection && this.application.selection.length
        ? `, ${$HR("linked to selection")}` : "";
      pane.caption.textContent = `${$HR("Expansion level")} ${levels}${selection}`;
    }
    this.application.dispatch("heurist-data-expansion-changed", this.getState());
  }
}

/** An `AbortError` for superseded level requests. */
function abortError() {
  const error = new Error("Superseded data request");
  error.name = "AbortError";
  return error;
}
