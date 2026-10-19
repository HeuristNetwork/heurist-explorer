/**
 * @file HRecordManager.js
 * @brief Record manager (plan 21 §3): HRecordList of some record types with
 *        "Add new <type>" buttons above the list; picks records for a pointer
 *        field (`select`, `select_multi`) or manages them (`manager`).
 *
 * The list is loaded by RecordListLoader on the API domain of the types
 * (recordDomains.js). Adding a record goes through the host (`addRecord`); in
 * the select modes the new record is the selection and the manager finishes
 * with it (Artem 2026-10-19). Double-click selects and finishes in the select
 * modes; in `manager` mode it edits, as in other record lists.
 * `openRecordManager()` shows the manager in a dialog with Select / Cancel.
 *
 * Events on the container: `h-record-manager-selection` (detail `{ids}`),
 * `h-record-manager-finish` (detail `{ids}`).
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

import { HBaseWidget } from '../HBaseWidget.js';
import { HRecordList } from '../record-list/HRecordList.js';
import { RecordListLoader } from '../../data/RecordListLoader.js';
import { recordTypesDomain, userDataRecordTypeIds } from '../../data/recordDomains.js';
import { $HR } from '../../ui/i18n/HResource.js';
import './HRecordManager.css';

/** Modes of the manager. */
export const RECORD_MANAGER_MODES = Object.freeze(['select', 'select_multi', 'manager']);

/** Record types of an unconstrained list (moved to recordDomains.js, Phase 4). */
export { userDataRecordTypeIds };

/**
 * Extra query of a browse filter (`rst_PointerBrowseFilter`): JSON text becomes its
 * conditions (array or object), other text stays keyword syntax; empty = none.
 *
 * @param {*} value Filter: text, conditions, or null.
 * @returns {Array<object>|object|string|null}
 */
export function browseFilterQuery(value) {
  if (value == null) return null;
  if (typeof value !== 'string') return Array.isArray(value) && !value.length ? null : value;
  const text = value.trim();
  if (!text) return null;
  if (text.startsWith('[') || text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text);
      // a saved filter object keeps its query in q / query
      const query = parsed && !Array.isArray(parsed) && (parsed.q ?? parsed.query) ? (parsed.q ?? parsed.query) : parsed;
      return browseFilterQuery(query);
    } catch {
      return text;
    }
  }
  return text;
}

/** Records of some record types: list, Add buttons, selection. */
export class HRecordManager extends HBaseWidget {
  /**
   * @param {HTMLElement} container Manager host.
   * @param {object} options
   * @param {object} options.apiClient HeuristApiClient.
   * @param {object} options.dbdefs HDbDefs (record type names, constants).
   * @param {'select'|'select_multi'|'manager'} [options.selectMode='select'] Mode.
   * @param {Array<number|string>} [options.recordTypes] Types to list and to add; empty = unconstrained
   *        (select modes only: every user-data type; one *Add record* button = `addRecord(null)`, the host's
   *        Add record dialog, Phase 4).
   * @param {boolean} [options.allowAddition=true] Show the Add buttons.
   * @param {Function} [options.addRecord] Host: `(rectypeId) → Promise<{saved, recordId}>` (no Add buttons without it).
   * @param {Function} [options.canAddRecordType] Host: `(rectypeId|null) → boolean`; default: yes.
   * @param {Function} [options.editRecord] Host: `(id) → Promise<{saved}>` (pen button; double-click in `manager` mode).
   * @param {Function} [options.viewRecord] Host: `(id)` ("i" button).
   * @param {*} [options.query] Extra conditions added to the record type query (`rst_PointerBrowseFilter`, Phase 3).
   * @param {object} [options.listOptions] HRecordList options (view mode, page size...).
   * @param {string} [options.baseUrl] Heurist base URL (record type icons).
   * @param {string} [options.database] Database name (record type icons).
   * @returns {HRecordManager} This manager.
   */
  attach(container, options = {}) {
    super.attach(container, options);
    this.mode = RECORD_MANAGER_MODES.includes(options.selectMode) ? options.selectMode : 'select';
    this.dbdefs = options.dbdefs || null;
    this.recordTypes = [...new Set((options.recordTypes || []).map(Number).filter((id) => id > 0))];
    this.unconstrained = this.recordTypes.length === 0;
    if (this.unconstrained && this.mode === 'manager') {
      throw new TypeError('The record manager needs record types in manager mode');
    }
    this.selection = [];
    return this;
  }

  /** @returns {boolean} Whether this is one of the select modes. */
  isSelectMode() {
    return this.mode !== 'manager';
  }

  /**
   * Build the Add bar and the record list and load the first page.
   *
   * @returns {Promise<HRecordManager>} This manager.
   */
  async render() {
    if (!this.container) throw new Error('HRecordManager must be attached before render');
    this.container.classList.add('h-record-manager');
    const listHost = document.createElement('div');
    listHost.className = 'h-record-manager-list';
    this.container.replaceChildren(listHost);
    const types = this.unconstrained ? userDataRecordTypeIds(this.dbdefs) : this.recordTypes;
    let path;
    try {
      path = recordTypesDomain(this.dbdefs, types).path;
    } catch {
      // no mixed domains (Artem 2026-10-19)
      this._showError($HR('These record types can not be listed together'));
      return this;
    }
    this.loader = new RecordListLoader({ apiClient: this.options.apiClient, path, query: this._query(types) });
    this.list = new HRecordList();
    await this.list.initialize({
      container: listHost,
      options: this._listOptions(),
      onDataRequest: (request) => this.loader.load(request),
      onSelectionChange: (ids) => this._selectionChanged(ids),
      onEditRecord: (id) => void this._edit(id),
      onViewRecord: (id) => this.options.viewRecord?.(id),
      // select modes: double-click selects that record and finishes (plan 21 §3.2)
      onRecordActivate: this.isSelectMode() ? (id) => this._finish([id]) : undefined
    });
    const bar = this._renderAddBar();
    if (bar) this.list.setTopBarContent(bar);
    await this.list.reload();
    return this;
  }

  /** @returns {number[]} Selected record ids (single mode: at most one). */
  getSelection() {
    return [...this.selection];
  }

  /**
   * Load the list again from the first page (after records were changed elsewhere).
   *
   * @returns {Promise<void>}
   */
  async reload() {
    this.loader?.setQuery(this.loader.query);
    await this.list?.reload();
  }

  /**
   * Finish with the current selection (the Select button).
   *
   * @returns {number[]} The selected ids.
   */
  select() {
    const ids = this.getSelection();
    if (ids.length) this._finish(ids);
    return ids;
  }

  /** @returns {Promise<void>} Completion after the list is removed. */
  async destroy() {
    this.loader?.abort();
    await this.list?.destroy();
    this.list = null;
    this.container?.classList.remove('h-record-manager');
    await super.destroy();
  }

  /**
   * Query of the record types plus the extra conditions (the browse filter): a JSON
   * query adds its conditions; keyword syntax gives a keyword query (`t:10,11 <filter>`).
   */
  _query(types) {
    const extra = browseFilterQuery(this.options.query);
    if (typeof extra === 'string') return `t:${types.join(',')} ${extra}`;
    const query = [{ t: types.join(',') }];
    if (Array.isArray(extra)) query.push(...extra);
    else if (extra) query.push(extra);
    return query;
  }

  /** HRecordList options of the mode. */
  _listOptions() {
    const given = this.options.listOptions || {};
    return {
      viewMode: 'list',
      pageLength: 50,
      ...given,
      topBar: true,
      selectionMode: this.mode === 'select' ? 'single' : 'multi',
      engineSwitch: false,
      sourceActionsEnabled: false,
      baseUrl: this.options.baseUrl || given.baseUrl,
      database: this.options.database || given.database,
      emptyResultMessage: given.emptyResultMessage || $HR('No records'),
      interaction: {
        editEnabled: typeof this.options.editRecord === 'function',
        popupEnabled: typeof this.options.viewRecord === 'function',
        persistentSelectionEnabled: false,
        ...(given.interaction || {}),
        selectionEnabled: true
      }
    };
  }

  /**
   * "Add new <type>" buttons of the types the user can add; unconstrained: one
   * "Add record" button (the host asks for the type: `addRecord(null)`).
   */
  _renderAddBar() {
    if (this.options.allowAddition === false) return null;
    if (typeof this.options.addRecord !== 'function') return null;
    const can = this.options.canAddRecordType || (() => true);
    const types = this.unconstrained ? (can(null) === true ? [null] : []) : this.recordTypes.filter((id) => can(id) === true);
    if (!types.length) return null;
    const bar = document.createElement('div');
    bar.className = 'h-record-manager-add';
    for (const id of types) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'h-btn h-btn-primary h-btn-small h-record-manager-add-button';
      if (id) button.dataset.rectypeId = String(id);
      const icon = document.createElement('i');
      icon.className = 'fa-solid fa-plus-circle';
      icon.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span');
      label.textContent = id ? `${$HR('Add new')} ${this._typeName(id)}` : $HR('Add record');
      button.append(icon, label);
      this.listen(button, 'click', () => void this._add(id));
      bar.append(button);
    }
    return bar;
  }

  /** Name of a record type (its id when unknown). */
  _typeName(id) {
    return this.dbdefs?.rectypeName?.(id) || `#${id}`;
  }

  /**
   * Add a record of a type through the host. Select modes: the new record is the
   * selection and the manager finishes; manager mode: the list reloads and selects it.
   */
  async _add(rectypeId) {
    let result;
    try {
      result = await this.options.addRecord(rectypeId);
    } catch (error) {
      this._dispatch('h-record-manager-error', { error });
      return;
    }
    const id = Number(result?.recordId ?? result?.record?.rec_ID) || 0;
    if (!result?.saved || !(id > 0)) return;
    if (this.isSelectMode()) {
      this._finish([id]);
      return;
    }
    await this.reload();
    await this.list?.setSelection([id]);
    this._selectionChanged([id]);
  }

  /** Edit through the host; reload the list after a save (titles may change). */
  async _edit(id) {
    const result = await this.options.editRecord?.(id);
    if (result?.saved) await this.reload();
  }

  /** Keep the selection and tell the host (the dialog enables Select). */
  _selectionChanged(ids) {
    const list = (ids || []).map(Number).filter((id) => id > 0);
    this.selection = this.mode === 'select' ? list.slice(-1) : list;
    this._dispatch('h-record-manager-selection', { ids: this.getSelection() });
  }

  /** The manager is done with these records (select modes). */
  _finish(ids) {
    if (!this.isSelectMode()) return;
    const list = (ids || []).map(Number).filter((id) => id > 0);
    this._dispatch('h-record-manager-finish', { ids: this.mode === 'select' ? list.slice(-1) : list });
  }

  /** Show an error instead of the list. */
  _showError(message) {
    const box = document.createElement('div');
    box.className = 'h-record-manager-error';
    box.textContent = message;
    this.container.replaceChildren(box);
  }

  /** Dispatch a manager event on the container. */
  _dispatch(type, detail) {
    this.container?.dispatchEvent(new CustomEvent(type, { bubbles: true, detail }));
  }
}
