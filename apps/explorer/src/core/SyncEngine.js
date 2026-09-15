/**
 * @file SyncEngine.js
 * @brief Synchronizes the active datasource and selection only inside Explorer.
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

import { normalizeIds } from './ExplorerModule.js';
import { cloneDataSource, normalizeDataSource } from './DataSource.js';

/** Synchronizes the active datasource and selection only inside Explorer. */
export class SyncEngine {
  /**
   * @param {object} [options] Engine configuration.
   * @param {Function|null} [options.onDataSourceRequest] Intercepts datasource-change requests before they're applied; defaults to applying immediately.
   */
  constructor({ onDataSourceRequest = null } = {}) {
    this.modules = new Map();
    this.dataSource = null;
    this.selection = [];
    this._handlers = new Map();
    this.onDataSourceRequest = onDataSourceRequest;
  }

  /**
   * Register a module for synchronization, listening for its selection/datasource change events.
   *
   * @param {import('./ExplorerModule.js').ExplorerModule} module Module to register.
   * @returns {import('./ExplorerModule.js').ExplorerModule} The registered module.
   * @throws {Error} When `module` has no `id`.
   */
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

  /**
   * Unregister a module and remove its event listeners.
   *
   * @param {string} id Module id.
   * @returns {void}
   */
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
   *
   * @param {object|null} source Datasource to activate, or `null` to clear it.
   * @param {object} [options] Synchronization options.
   * @param {string|null} [options.origin] Module id that triggered this change; excluded from the update.
   * @param {boolean} [options.preserveDataViews=false] Restrict data-module updates to `dataModuleId`.
   * @param {string|null} [options.dataModuleId] Data module id to update when `preserveDataViews` is set.
   * @returns {Promise<object|null>} Cloned, normalized active datasource.
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

  /**
   * Set the shared record selection and propagate it to every other registered module.
   *
   * @param {Array<number>} ids Selected record IDs.
   * @param {{origin?: string|null}} [options] `origin` excludes the triggering module from the update.
   * @returns {Promise<Array<number>>} The applied selection.
   */
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

  /**
   * Unregister every module.
   *
   * @returns {Promise<void>}
   */
  async destroy() {
    [...this.modules.keys()].forEach((id) => this.unregister(id));
  }
}

/** Whether two selection arrays contain the same set of ids, ignoring order. */
function sameSelection(a, b) {
  if (a.length !== b.length) {
    return false;
  }

  const values = new Set(a);
  return b.every((id) => values.has(id));
}
