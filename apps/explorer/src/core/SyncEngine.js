import { normalizeIds } from './ExplorerModule.js';
import { cloneDataSource, normalizeDataSource } from './DataSource.js';

/** Synchronizes the active datasource and selection only inside Explorer. */
export class SyncEngine {
  constructor({ onDataSourceRequest = null } = {}) {
    this.modules = new Map();
    this.dataSource = null;
    this.selection = [];
    this._handlers = new Map();
    this.onDataSourceRequest = onDataSourceRequest;
  }

  register(module) {
    if (!module?.id) throw new Error('Explorer module requires an id');
    this.unregister(module.id);
    this.modules.set(module.id, module);

    const selectionHandler = (event) => {
      this.setSelection(event.detail?.selection || [], { origin: module.id });
    };
    const sourceHandler = (event) => {
      const dataSource = event.detail?.dataSource ?? event.detail;
      if (dataSource) {
        const options = {
          origin: module.id,
          preserveDataViews: module.type === 'data',
          dataModuleId: module.type === 'data' ? module.id : null
        };
        if (this.onDataSourceRequest) {
          void this.onDataSourceRequest(dataSource, options);
        } else {
          void this.setDataSource(dataSource, options);
        }
      }
    };
    module.addEventListener?.('selectionchange', selectionHandler);
    module.addEventListener?.('datasourcechange', sourceHandler);
    this._handlers.set(module.id, { selectionHandler, sourceHandler });
    return module;
  }

  unregister(id) {
    const module = this.modules.get(id);
    const handlers = this._handlers.get(id);
    if (module && handlers) {
      module.removeEventListener?.('selectionchange', handlers.selectionHandler);
      module.removeEventListener?.('datasourcechange', handlers.sourceHandler);
    }
    this.modules.delete(id);
    this._handlers.delete(id);
  }

  /**
   * Set the active Explorer datasource.
   *
   * With preserveDataViews, only the selected data module plus all non-data
   * followers receive the source. Other data views retain their own sources.
   */
  async setDataSource(source, {
    origin = null,
    preserveDataViews = false,
    dataModuleId = null
  } = {}) {
    this.dataSource = source == null ? null : normalizeDataSource(source);
    const targets = [...this.modules.values()].filter((module) => {
      if (module.id === origin) return false;
      if (!preserveDataViews) return true;
      if (module.type !== 'data') return true;
      return dataModuleId != null && module.id === dataModuleId;
    });
    await Promise.all(targets
      .filter((module) => typeof module.setDataSource === 'function')
      .map((module) => module.setDataSource(
      cloneDataSource(this.dataSource),
      { origin: 'sync' }
      )));
    return cloneDataSource(this.dataSource);
  }

  async setSelection(ids, { origin = null } = {}) {
    const nextSelection = normalizeIds(ids);

    // Selection is shared state, not a command. A module can legitimately
    // echo a programmatic setSelection() through its own public event API.
    // Do not start another synchronization pass when nothing changed.
    if (sameSelection(nextSelection, this.selection)) {
      return this.selection;
    }

    this.selection = nextSelection;
    await Promise.all([...this.modules.values()]
      .filter((module) => module.id !== origin && typeof module.setSelection === 'function')
      .map((module) => module.setSelection(this.selection, { origin: 'sync' })));
    return this.selection;
  }

  async destroy() {
    [...this.modules.keys()].forEach((id) => this.unregister(id));
  }
}

function sameSelection(a, b) {
  if (a.length !== b.length) {
    return false;
  }

  const values = new Set(a);
  return b.every((id) => values.has(id));
}
