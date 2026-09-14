import { ExplorerModule, clone, normalizeIds } from '../core/ExplorerModule.js';
import { dataSourcePresentation, dataSourceRequest } from '../core/DataSource.js';

const TYPE_META = {
  data: { bridge: 'heuristDataHost', api: 'heuristData' },
  map: { bridge: 'heuristMapHost', api: 'heuristMap' },
  timeline: { bridge: 'heuristTimelineHost', api: 'heuristTimeline' },
  graph: { bridge: 'heuristGraphHost', api: 'heuristGraph' }
};

/** Same-origin child-module adapter used by Explorer. */
export class IframeModuleAdapter extends ExplorerModule {
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

  _installBridge() {
    if (!this.frame) return;
    const meta = TYPE_META[this.type];
    this.frame[meta.bridge] = this._createChildHostBridge();
  }

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
      selectFieldset: (value, options) => outer.selectFieldset?.(value, options),
      addDataSourceToWorkspace: (source, options) => outer.addDataSourceToWorkspace?.(source, options),
      removeDataSourceFromWorkspace: (sourceOrKey) => outer.removeDataSourceFromWorkspace?.(sourceOrKey),
      isDataSourceInWorkspace: (source) => outer.isDataSourceInWorkspace?.(source),
      updateDataSourceInWorkspace: (source) => outer.updateDataSourceInWorkspace?.(source),
      getWorkspaceDataSources: () => outer.getWorkspaceDataSources?.() || [],
      showDatasource: (source) => outer.showDatasource?.(source),
      saveDatasourceAsFilter: (source) => outer.saveDatasourceAsFilter?.(source),
      saveDatasourceAsSource: (source, options) => outer.saveDatasourceAsSource?.(source, options)
    };
  }

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
      data: ['heurist-data-selection-changed']
    }[this.type] || [];
    this._eventBindings = names.map((name) => {
      this.api.addEventListener(name, forwardSelection);
      return [name, forwardSelection];
    });
  }

  async setDataSource(source) {
    await super.setDataSource(source);
    const api = await this._readyApi();
    const query = executableQuery(source);

    // Every DataSource is resolved before synchronization. Its persistent
    // identity and profiles remain metadata; this adapter applies its request.
    if (this.type === 'timeline') return api.setQuery?.(query, { title: source?.title || 'Current result' });
    if (this.type === 'graph') return api.load?.({ query });
    if (this.type === 'data') {
      return typeof api.setDataSource === 'function'
        ? api.setDataSource(source, { reload: true })
        : api.setQuery?.(query, { reload: true, dataSource: source, title: source?.title || null });
    }
    if (this.type === 'map') {
      const workspaceDataSources = await this.hostActions.getWorkspaceDataSources?.() || [];
      return typeof api.setDynamicDataSources === 'function'
        ? api.setDynamicDataSources({ currentDataSource: source, workspaceDataSources })
        : api.setQuery?.(query, { reload: true, title: source?.title || 'Current result' });
    }
    return false;
  }

  async setWorkspaceDataSources(workspaceDataSources = []) {
    if (this.type !== 'map') return false;
    const api = await this._readyApi();
    if (typeof api.setDynamicDataSources !== 'function') return false;
    return api.setDynamicDataSources({
      currentDataSource: this.dataSource,
      workspaceDataSources: clone(workspaceDataSources)
    });
  }

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

  async resize() { return (await this._readyApi()).resize?.() ?? true; }

  async getState() {
    const api = await this._readyApi();
    return { ...(await super.getState()), moduleState: clone(api.getState?.() || null) };
  }

  async destroy() {
    if (this.api && this._eventBindings) {
      this._eventBindings.forEach(([name, handler]) => this.api.removeEventListener?.(name, handler));
    }
    await this.api?.destroy?.();
    this.frame?.remove();
    this.frame = null;
    this.api = null;
  }

  async _readyApi() {
    if (this.api) return this.api;
    if (!this.readyPromise) throw new Error(`${this.type} module is not mounted`);
    return this.readyPromise;
  }
}

function executableQuery(source) {
  return dataSourceRequest(source)?.q ?? null;
}
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function sameSelection(a, b) {
  if (a.length !== b.length) {
    return false;
  }

  const values = new Set(a);
  return b.every((id) => values.has(id));
}
