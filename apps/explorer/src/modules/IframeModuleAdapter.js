/**
 * @file IframeModuleAdapter.js
 * @brief Same-origin child-module adapter used by Explorer.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-explorer
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { ExplorerModule, clone, normalizeIds } from '../core/ExplorerModule.js';
import { dataSourcePresentation, dataSourceRequest } from '../core/DataSource.js';

const TYPE_META = {
  data: { bridge: 'heuristDataHost', api: 'heuristData' },
  map: { bridge: 'heuristMapHost', api: 'heuristMap' },
  timeline: { bridge: 'heuristTimelineHost', api: 'heuristTimeline' },
  graph: { bridge: 'heuristGraphHost', api: 'heuristGraph' },
  recordview: { bridge: 'heuristRecordviewHost', api: 'heuristRecordview' }
};

/** Same-origin child-module adapter used by Explorer. */
export class IframeModuleAdapter extends ExplorerModule {
  /**
   * @param {object} options Adapter configuration.
   * @param {string} options.id Unique module instance id.
   * @param {'data'|'map'|'timeline'|'graph'|'recordview'} options.type Module type.
   * @param {HTMLElement} options.container Element the module's iframe will mount into.
   * @param {string} options.url Module document URL to load in the iframe.
   * @param {object} [options.runtime] Runtime bootstrap fields forwarded to the child module.
   * @param {object} [options.settings] Persisted settings forwarded to the child module.
   * @param {*} [options.state] Persisted state forwarded to the child module.
   * @param {object|null} [options.context] Module-specific context.
   * @param {object} [options.hostActions] Host action callbacks exposed to the child module.
   * @param {Function|null} [options.onSettingsChange] Called with the child module's updated settings.
   */
  constructor({ id, type, container, url, runtime, settings = {}, state = null, context = null, hostActions = {}, onSettingsChange = null }) {
    super({ id, type, container, context });
    this.url = url;
    this.runtime = runtime || {};
    this.settings = settings || {};
    this.state = state;
    this.hostActions = hostActions;
    this.onSettingsChange = typeof onSettingsChange === 'function' ? onSettingsChange : null;
    this.frame = null;
    this.api = null;
    this.readyPromise = null;
  }

  /**
   * Create the iframe, install the host bridge, load the module, and wait for its public API.
   *
   * @returns {Promise<IframeModuleAdapter>} This adapter, once the module is ready.
   * @throws {Error} When the module type is unsupported, no URL is configured, or loading times out.
   */
  async mount() {
    if (!TYPE_META[this.type]) throw new Error(`Unsupported Explorer module type: ${this.type}`);
    if (!this.url) throw new Error(`No URL configured for ${this.type}`);
    this.frame = document.createElement('iframe');
    this.frame.className = 'h-explorer-module-frame';
    this.frame.title = `Heurist ${this.type}`;
    this.frame.setAttribute('frameborder', '0');
    this.container.replaceChildren(this.frame);
    this._installBridge();
    this.readyPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out loading ${this.type}`)), 20000);
      this.frame.addEventListener('load', () => {
        this._installBridge();
        this._waitForApi().then((api) => { clearTimeout(timer); resolve(api); }, reject);
      }, { once: true });
    });
    this.frame.src = this.url;
    await this.readyPromise;
    this._bindChildEvents();
    return this;
  }

  /**
   * Install (or reinstall) the same-origin host bridge on the iframe element.
   *
   * @private
   * @returns {void}
   */
  _installBridge() {
    if (!this.frame) return;
    const meta = TYPE_META[this.type];
    this.frame[meta.bridge] = this._createChildHostBridge();
  }

  /**
   * Build the host bridge object exposed to the child module via `window.frameElement`.
   *
   * @private
   * @returns {object} Host bridge with configuration, settings/state, and delegated host actions.
   */
  _createChildHostBridge() {
    const outer = this.hostActions;
    return {
      getConfiguration: () => this._bootstrap(),
      updateSettings: (settings) => {
        this.settings = clone(settings || {});
        this.onSettingsChange?.(clone(this.settings));
        return clone(this.settings);
      },
      updateState: (state) => { this.state = clone(state); },
      getHostContext: () => outer.getHostContext?.() || { name: 'heurist-explorer', runtimeMode: 'main' },
      editRecord: (id) => outer.editRecord?.(id),
      viewRecord: (id) => outer.viewRecord?.(id),
      addRecord: (recordTypeId) => outer.addRecord?.(recordTypeId),
      editSymbology: (value, options) => outer.editSymbology?.(value, options),
      editExtent: (value, options) => outer.editExtent?.(value, options),
      editRules: (value, options) => outer.editRules?.(value, options),
      describeRules: (rules) => outer.describeRules?.(rules),
      editFieldset: (value, options) => outer.editFieldset?.(value, options),
      showDatasource: (source) => {
        if (['map', 'timeline'].includes(this.type)) this.dataSource = clone(source);
        return outer.showDatasource?.(source, ['map', 'timeline'].includes(this.type) ? { origin: this.id } : {});
      }
    };
  }

  /**
   * Build the bootstrap envelope returned to the child module via `getConfiguration`.
   *
   * @private
   * @returns {object} Bootstrap envelope: runtime, settings, state, and the active source.
   */
  _bootstrap() {
    return {
      runtime: {
        ...this.runtime,
        runtimeMode: 'main',
        source: this.id
      },
      settings: clone(this.settings),
      state: clone(this.state),
      source: this._sourceBootstrap()
    };
  }

  /**
   * Build the active-source portion of the bootstrap envelope, shaped per module type.
   *
   * @private
   * @returns {object} Source bootstrap: a `contexts` list for timeline, or a query/request/presentation shape otherwise.
   */
  _sourceBootstrap() {
    const source = this.dataSource || {};
    const query = executableQuery(source);
    const request = dataSourceRequest(source);
    const presentation = dataSourcePresentation(source, this.type);
    if (this.type === 'timeline') {
      return { contexts: query ? [{ id: 'current', title: source.title || 'Current result', query, request, presentation }] : [], selection: [...this.selection] };
    }
    return {
      query,
      request,
      presentation,
      dataSource: clone(this.dataSource),
      title: source.title || null,
      selection: [...this.selection]
    };
  }

  /**
   * Poll the iframe's `contentWindow` until the child module's public API appears.
   *
   * @private
   * @returns {Promise<object>} The child module's public API.
   * @throws {Error} When the public API is not exposed within the polling window.
   */
  async _waitForApi() {
    const meta = TYPE_META[this.type];
    for (let i = 0; i < 200; i += 1) {
      const api = this.frame?.contentWindow?.[meta.api];
      if (api) {
        this.api = api;
        if (typeof api.ready === 'function') await api.ready();
        return api;
      }
      await delay(50);
    }
    throw new Error(`${this.type} public API was not exposed`);
  }

  /**
   * Subscribe to the child module's public selection-changed event and forward genuine changes to Explorer.
   *
   * @private
   * @returns {void}
   */
  _bindChildEvents() {
    if (!this.api?.addEventListener) return;
    const forwardSelection = (event) => {
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

      const nextSelection = normalizeIds(selection);

      // Child modules may emit their normal selection-changed event in
      // response to Explorer applying a synchronized selection. If the
      // effective selection has not changed, this is an echo rather than a
      // new user action and must not be forwarded back into SyncEngine.
      if (sameSelection(nextSelection, this.selection)) {
        return;
      }

      this.selection = nextSelection;
      this.dispatchEvent(new CustomEvent('selectionchange', { detail: { selection: this.selection } }));
    };
    const names = {
      map: ['heurist-map-selection-changed'],
      timeline: ['heurist-timeline-selection-changed'],
      graph: ['heurist-graph-selection-changed'],
      data: ['heurist-data-selection-changed'],
      // RecordView only ever emits this from an explicit "navigate to a
      // linked record" action (see RecordViewApplication#navigateToRecord),
      // never from passively displaying a pushed selection - one-way sync
      // by default.
      recordview: ['heurist-recordview-selection-changed']
    }[this.type] || [];
    this._eventBindings = names.map((name) => {
      this.api.addEventListener(name, forwardSelection);
      return [name, forwardSelection];
    });
    if (['map', 'timeline'].includes(this.type)) {
      const forwardDocument = (event) => {
        const detail = event.detail || {};
        const document = detail.document;
        if (!document || detail.loading || document.activating || document.loadState === 'error'
          || document.active === false) return;
        const id = document.persistent === false ? 'dynamic' : String(document.id);
        if (this._applyingDocument === id || this._activeDocument === id) return;
        this._activeDocument = id;
        this.dispatchEvent(new CustomEvent('mapdocumentchange', { detail: { documentId: id } }));
      };
      for (const suffix of ['document-activated', 'document-state-changed']) {
        const name = `heurist-${this.type}-${suffix}`;
        this.api.addEventListener(name, forwardDocument);
        this._eventBindings.push([name, forwardDocument]);
      }
    }
  }

  async setActiveMapDocument(documentId) {
    if (!['map', 'timeline'].includes(this.type)) return false;
    const api = await this._readyApi();
    const id = String(documentId);
    this._applyingDocument = id;
    try {
      const localId = id === 'dynamic' ? (api.getDynamicDocument?.()?.id || 'dynamic') : documentId;
      await api.activateMapDocument(localId);
      this._activeDocument = id;
    } finally {
      if (this._applyingDocument === id) this._applyingDocument = null;
    }
  }

  /**
   * Apply a new active datasource to the child module, using its module-specific API.
   *
   * @param {object} source Datasource to apply.
   * @returns {Promise<*>} Result of the child module's datasource/query call.
   */
  async setDataSource(source) {
    await super.setDataSource(source);
    const api = await this._readyApi();
    const query = executableQuery(source);

    // Every DataSource is resolved before synchronization. Its persistent
    // identity and profiles remain metadata; this adapter applies its request.
    if (this.type === 'timeline' && typeof api.setDynamicDataSources !== 'function') return api.setQuery?.(query, { title: source?.title || 'Current result' });
    if (this.type === 'graph') {
      return typeof api.setDataSource === 'function'
        ? api.setDataSource(source)
        : api.load?.({ query });
    }
    if (this.type === 'data') {
      return typeof api.setDataSource === 'function'
        ? api.setDataSource(source, { reload: true })
        : api.setQuery?.(query, { reload: true, dataSource: source, title: source?.title || null });
    }
    if (['map', 'timeline'].includes(this.type)) {
      // Workspace is independent Explorer state and is synchronized only when
      // membership/state changes. A normal current-datasource change must not
      // replace or rebuild Workspace layers/bands.
      return typeof api.setDynamicDataSources === 'function'
        ? api.setDynamicDataSources({ currentDataSource: source })
        : api.setQuery?.(query, { reload: true, title: source?.title || 'Current result' });
    }
    return false;
  }

  /**
   * Push the current workspace datasource list to the map module.
   *
   * @param {Array<object>} [workspaceDataSources] Workspace datasources to forward.
   * @returns {Promise<*>} Result of the map module's call, or `false` for non-map modules or an unsupported API.
   */
  async setWorkspaceDataSources(workspaceDataSources = []) {
    if (!['map', 'timeline'].includes(this.type)) return false;
    const api = await this._readyApi();
    if (typeof api.setDynamicDataSources !== 'function') return false;
    return api.setDynamicDataSources({
      workspaceDataSources: clone(workspaceDataSources)
    });
  }

  /**
   * Apply a new record selection to the child module.
   *
   * @param {Array<number>} ids Selected record IDs.
   * @returns {Promise<Array<number>>} The applied selection.
   */
  async setSelection(ids) {
    await super.setSelection(ids);
    const api = await this._readyApi();

    if (this.type === 'map' && typeof api.setSelection !== 'function') {
      if (!this.selection.length) {
        return api.clearSelection?.() ?? this.selection;
      }

      return api.selectRecords?.('current-results', this.selection, {
        replace: true,
        zoom: false
      }) ?? this.selection;
    }

    return api.setSelection?.(this.selection, {
      replace: true,
      zoom: false
    }) ?? this.selection;
  }

  /**
   * Resize the child module.
   *
   * @returns {Promise<*>} Result of the child module's resize call.
   */
  async resize() { return (await this._readyApi()).resize?.() ?? true; }

  /**
   * Return this module's serialized state, including the child module's own state.
   *
   * @returns {Promise<object>} Current module state with an added `moduleState` field.
   */
  async getState() {
    const api = await this._readyApi();
    return { ...(await super.getState()), moduleState: clone(api.getState?.() || null) };
  }

  /**
   * Detach event listeners, destroy the child module, and remove the iframe.
   *
   * @returns {Promise<void>}
   */
  async destroy() {
    if (this.api && this._eventBindings) {
      this._eventBindings.forEach(([name, handler]) => this.api.removeEventListener?.(name, handler));
    }
    await this.api?.destroy?.();
    this.frame?.remove();
    this.frame = null;
    this.api = null;
  }

  /**
   * Resolve once the child module's public API is available.
   *
   * @private
   * @returns {Promise<object>} The child module's public API.
   * @throws {Error} When the adapter has not been mounted yet.
   */
  async _readyApi() {
    if (this.api) return this.api;
    if (!this.readyPromise) throw new Error(`${this.type} module is not mounted`);
    return this.readyPromise;
  }
}

/** Extract the executable query (`request.q`) from a datasource, or `null`. */
function executableQuery(source) {
  return dataSourceRequest(source)?.q ?? null;
}

/** Resolve after `ms` milliseconds. */
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

/** Whether two selection arrays contain the same set of ids, ignoring order. */
function sameSelection(a, b) {
  if (a.length !== b.length) {
    return false;
  }

  const values = new Set(a);
  return b.every((id) => values.has(id));
}
