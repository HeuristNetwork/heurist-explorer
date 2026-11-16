/**
 * @file ModuleHandle.js
 * @brief One record module (Data, Map, Timeline, Graph, Record View) for synchronization (plan 27l §2.1).
 *
 * The knowledge per module type, apart from where the module runs: how it takes a DataSource, a selection and a map
 * document through its public API, and which events of the API mean "the visitor changed the selection / the map
 * document". Explorer's module adapters (iframe and direct) and the page sync of a website use it.
 *
 * The handle is an EventTarget: `selectionchange` ({selection}) and `mapdocumentchange` ({documentId}) are sent only
 * for changes of the visitor, not for the echo of a value given to the module.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { dataSourceRequest } from '../data/DataSource.js';
import { normalizeIds, sameSelection } from './selection.js';

/** Module types a handle knows. */
export const SYNC_MODULE_TYPES = Object.freeze(['data', 'map', 'timeline', 'graph', 'recordview']);

/** Public selection events of the modules. */
const SELECTION_EVENTS = Object.freeze({
  map: ['heurist-map-selection-changed'],
  timeline: ['heurist-timeline-selection-changed'],
  graph: ['heurist-graph-selection-changed'],
  data: ['heurist-data-selection-changed'],
  // RecordView only ever emits this from an explicit "navigate to a linked record" action (see
  // RecordViewApplication#navigateToRecord), never from passively displaying a pushed selection - one-way sync by
  // default.
  recordview: ['heurist-recordview-selection-changed']
});

/** A record module seen through its public API. */
export class ModuleHandle extends EventTarget {
  /**
   * @param {object} options
   * @param {string} options.type Module type (SYNC_MODULE_TYPES).
   * @param {object|null} [options.api] The public API of the module (it may be given later: `handle.api = api`).
   */
  constructor({ type, api = null }) {
    super();
    this.type = type;
    this.api = api;
    this.selection = [];
    this._bindings = [];
    this._applyingSelection = false;
    this._applyingDocument = null;
    this._activeDocument = null;
  }

  /** @returns {boolean} Whether the module has map documents (Map, Timeline). */
  get hasDocuments() {
    return this.type === 'map' || this.type === 'timeline';
  }

  /**
   * Listen to the public events of the API (again: the earlier listeners are removed).
   *
   * @returns {ModuleHandle}
   */
  bind() {
    this.unbind();
    const api = this.api;
    if (!api?.addEventListener) return this;
    for (const name of SELECTION_EVENTS[this.type] || []) this._listen(name, (event) => this._onSelection(event));
    if (this.hasDocuments) {
      const forward = (event) => this._onDocument(event);
      for (const suffix of ['document-activated', 'document-state-changed']) this._listen(`heurist-${this.type}-${suffix}`, forward);
    }
    return this;
  }

  /** Remove the listeners of bind(). */
  unbind() {
    for (const [name, handler] of this._bindings) this.api?.removeEventListener?.(name, handler);
    this._bindings = [];
  }

  /**
   * Give a DataSource to the module (its records are loaded). The loading state of the module is set around the
   * call; a request replaced by a newer one (AbortError) is not an error.
   *
   * @param {object} source A resolved DataSource (`request.q`).
   * @param {object} [options]
   * @param {boolean} [options.showDynamic=false] Map / Timeline: show the document of the current result first (a
   *        website page; Explorer synchronizes the map document apart).
   * @returns {Promise<*>} What the module returned, null for a replaced request, false for a module without records.
   */
  async setDataSource(source, { showDynamic = false } = {}) {
    const api = this.api;
    if (!api) return false;
    // a page DataSource (Saved filter, plan 27j) may have no reference: its request is used as it is
    const query = dataSourceRequest(source)?.q ?? source?.request?.q ?? null;
    await this.setLoading(true);
    try {
      // Every DataSource is resolved before synchronization. Its persistent identity and profiles remain metadata;
      // the module applies its request.
      if (this.type === 'timeline' && typeof api.setDynamicDataSources !== 'function') {
        return await api.setQuery?.(query, { title: source?.title || 'Current result' });
      }
      if (this.type === 'graph') {
        return await (typeof api.setDataSource === 'function'
          ? api.setDataSource(source)
          : api.load?.({ query }));
      }
      if (this.type === 'data') {
        return await (typeof api.setDataSource === 'function'
          ? api.setDataSource(source, { reload: true })
          : api.setQuery?.(query, { reload: true, dataSource: source, title: source?.title || null }));
      }
      if (this.hasDocuments) {
        if (showDynamic) await api.activateMapDocument?.(api.getDynamicDocument?.()?.id || 'dynamic');
        // Workspace is independent Explorer state and is synchronized only when membership/state changes. A normal
        // current-datasource change must not replace or rebuild Workspace layers/bands.
        if (typeof api.setDynamicDataSources === 'function') {
          const result = await api.setDynamicDataSources({ currentDataSource: source });
          // false: the module is not in Explorer (Map on a website page): the query of its Filtered Result layer
          if (result !== false) return result;
        }
        return await api.setQuery?.(query, { reload: true, title: source?.title || 'Current result' });
      }
      return false;
    } catch (error) {
      // A newer setDataSource() call already superseded this one; the module's own generation guard aborted it.
      if (error?.name === 'AbortError') {
        console.debug(`${this.type} datasource request superseded: ${error.message}`);
        return null;
      }
      throw error;
    } finally {
      await this.setLoading(false);
    }
  }

  /**
   * Show or hide the loading state of the module.
   *
   * @param {boolean} loading
   * @returns {Promise<*>}
   */
  async setLoading(loading) {
    return this.api?.setLoading?.(Boolean(loading));
  }

  /**
   * New expansion rules of the current DataSource without a reload (Graph, Data).
   *
   * @param {Array<object>} rules
   * @returns {Promise<*>} The module's result, null for a module without rules.
   */
  async setRules(rules) {
    if (!['graph', 'data'].includes(this.type)) return null;
    return this.api?.setDataSourceRules?.(rules) ?? null;
  }

  /**
   * Give a selection to the module. Its own selection event sent meanwhile is not a change of the visitor.
   *
   * @param {Array<number>} ids Record ids.
   * @returns {Promise<Array<number>>} The applied selection.
   */
  async setSelection(ids) {
    this.selection = normalizeIds(ids);
    const api = this.api;
    if (!api) return this.selection;
    this._applyingSelection = true;
    try {
      if (this.type === 'map' && typeof api.setSelection !== 'function') {
        if (!this.selection.length) {
          return await (api.clearSelection?.() ?? this.selection);
        }

        return await (api.selectRecords?.('current-results', this.selection, { replace: true, zoom: false }) ?? this.selection);
      }

      return await (api.setSelection?.(this.selection, { replace: true, zoom: false }) ?? this.selection);
    } finally {
      this._applyingSelection = false;
    }
  }

  /**
   * Show a map document (Map, Timeline): `dynamic` = the document of the current result.
   *
   * @param {string|number} documentId
   * @returns {Promise<boolean>} False for a module without documents.
   */
  async setActiveMapDocument(documentId) {
    if (!this.hasDocuments || !this.api) return false;
    const id = String(documentId);
    this._applyingDocument = id;
    try {
      const localId = id === 'dynamic' ? (this.api.getDynamicDocument?.()?.id || 'dynamic') : documentId;
      await this.api.activateMapDocument(localId);
      this._activeDocument = id;
    } finally {
      if (this._applyingDocument === id) this._applyingDocument = null;
    }
    return true;
  }

  /** Listen to one event of the API. */
  _listen(name, handler) {
    this.api.addEventListener(name, handler);
    this._bindings.push([name, handler]);
  }

  /** A selection event of the module: sent on as `selectionchange` when the visitor changed it. */
  _onSelection(event) {
    const detail = event?.detail || {};
    const hasSelection = Object.prototype.hasOwnProperty.call(detail, 'selection')
      || Object.prototype.hasOwnProperty.call(detail, 'recordIds')
      || Object.prototype.hasOwnProperty.call(detail, 'ids');
    if (!hasSelection) return;
    let selection = detail.selection ?? detail.recordIds ?? detail.ids ?? [];

    if (this.type === 'map' && selection && !Array.isArray(selection)) {
      selection = Array.isArray(selection.features)
        ? selection.features.map((feature) => feature?.recordId)
        : [];
    }

    // A module may be unable to display some synchronized ids (for example, Map has no visible feature for a Graph
    // selection) and report an empty local selection. That is presentation feedback, not a new user choice.
    if (this._applyingSelection) return;

    // Modules may emit their normal selection-changed event in response to an applied selection. If the effective
    // selection has not changed, this is an echo rather than a new user action.
    const next = normalizeIds(selection);
    if (sameSelection(next, this.selection)) return;

    this.selection = next;
    this.dispatchEvent(new CustomEvent('selectionchange', { detail: { selection: [...this.selection] } }));
  }

  /** A document event of Map / Timeline: sent on as `mapdocumentchange` when the visitor showed another document. */
  _onDocument(event) {
    const detail = event?.detail || {};
    const document = detail.document;
    if (!document || detail.loading || document.activating || document.loadState === 'error'
      || document.active === false) return;
    const id = document.persistent === false ? 'dynamic' : String(document.id);
    if (this._applyingDocument === id || this._activeDocument === id) return;
    this._activeDocument = id;
    this.dispatchEvent(new CustomEvent('mapdocumentchange', { detail: { documentId: id } }));
  }
}
