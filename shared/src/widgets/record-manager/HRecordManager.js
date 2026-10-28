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
 * Filter form (plan 21 §7.1): the built-in filter of the types (recordManagerFilters.js:
 * files, generic) in a pane beside the list - west for a vertical form, north for a
 * horizontal one; Filter adds its conditions to the type query, Reset removes them. A
 * browse filter of the field (`query`) replaces the built-in filter (no pane).
 *
 * Relations mode (plan 24): the records related to one record through one relmarker
 * field (`relations.store`, relationStores.js); each item has a toolset (relationship
 * icon, relation type, pen, bin) and the top bar a relation type and "Find or Add <type>"
 * (a manager in `select_multi`, `browseRecords`). Every change is written at once.
 *
 * Events on the container: `h-record-manager-selection` (detail `{ids}`),
 * `h-record-manager-finish` (detail `{ids}`), `h-record-manager-error` (detail `{error}`).
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
import { HFilterForm } from '../filter/HFilterForm.js';
import { HCardinalLayout } from '../layout/HCardinalLayout.js';
import { builtinRecordFilter } from '../../data/recordManagerFilters.js';
import { RECORD_LIST_FIELDS, RecordListLoader } from '../../data/RecordListLoader.js';
import { recordTypesDomain, userDataRecordTypeIds } from '../../data/recordDomains.js';
import { recordTypeIconUrl } from '../record-list/recordAdminInfo.js';
import { confirmRelationshipDelete } from '../relationship/relationshipDialog.js';
import { openProgressDialog } from '../../ui/progressDialog.js';
import { $HR } from '../../ui/i18n/HResource.js';
import './HRecordManager.css';

/** Modes of the manager. */
export const RECORD_MANAGER_MODES = Object.freeze(['select', 'select_multi', 'manager', 'relations']);

/** localStorage key prefix of the list settings (view mode, sort), per database and domain. */
const SETTINGS_KEY = 'heurist.recordManager.list';

/** localStorage key prefix of the relation type of new relationships, per database and field (plan 24). */
const RELATION_TYPE_KEY = 'heurist.recordManager.relationType';

/** From this number of new relationships "Find or Add" shows a progress dialog with Cancel (plan 24). */
export const RELATION_PROGRESS_FROM = 5;

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
   * @param {'select'|'select_multi'|'manager'|'relations'} [options.selectMode='select'] Mode.
   * @param {Array<number|string>} [options.recordTypes] Types to list and to add; empty = unconstrained
   *        (select modes only: every user-data type; one *Add record* button = `addRecord(null)`, the host's
   *        Add record dialog, Phase 4).
   * @param {boolean} [options.allowAddition=true] Show the Add buttons.
   * @param {Function} [options.addRecord] Host: `(rectypeId) → Promise<{saved, recordId}>` (no Add buttons without it).
   * @param {Function} [options.canAddRecordType] Host: `(rectypeId|null) → boolean`; default: yes.
   * @param {Array<{id: string, icon: string, label: string, run: Function}>} [options.addActions] Add buttons of
   *        the host instead of "Add new <type>" (registered files: Upload, Register URL); `run()` →
   *        `Promise<{saved, recordId}>` as `addRecord`; in `manager` mode the new record is then opened
   *        with `editRecord`, in select modes it is the selection.
   * @param {Function} [options.editRecord] Host: `(id) → Promise<{saved}>` (pen button; double-click in `manager` mode).
   * @param {Function} [options.viewRecord] Host: `(id)` ("i" button).
   * @param {{store: object}} [options.relations] `relations` mode: the relation store of the field
   *        (relationStores.js); the record types are the store's `otherTypes`.
   * @param {Function} [options.browseRecords] `relations` mode: `(options) → Promise<number[]|null>`, the
   *        manager of "Find or Add" (openRecordManager gives it).
   * @param {*} [options.query] Extra conditions added to the record type query (`rst_PointerBrowseFilter`, Phase 3);
   *        it replaces the built-in filter form.
   * @param {object|false|null} [options.filter] Filter `{query, filterForm}`; default the built-in filter of the
   *        types (recordManagerFilters.js), `false` = no filter form.
   * @param {object} [options.listOptions] HRecordList options (view mode, page size...).
   * @param {Array<number|string>} [options.listFields] Extra fields loaded with the list records (detail ids),
   *        e.g. for `recordTools`.
   * @param {(record: object) => HTMLElement|null} [options.recordTools] Tools of a record in `manager` and the
   *        select modes (the Website manager, plan 27b); the relations mode has its own.
   * @param {string} [options.baseUrl] Heurist base URL (record type icons).
   * @param {string} [options.database] Database name (record type icons).
   * @returns {HRecordManager} This manager.
   */
  attach(container, options = {}) {
    super.attach(container, options);
    this.mode = RECORD_MANAGER_MODES.includes(options.selectMode) ? options.selectMode : 'select';
    this.dbdefs = options.dbdefs || null;
    this.store = this.mode === 'relations' ? options.relations?.store || null : null;
    if (this.mode === 'relations' && !this.store) throw new TypeError('The record manager needs a relation store in relations mode');
    this.relations = [];
    this.changed = false;
    const types = this.store ? this.store.otherTypes : options.recordTypes;
    this.recordTypes = [...new Set((types || []).map(Number).filter((id) => id > 0))];
    this.unconstrained = this.recordTypes.length === 0;
    if (this.unconstrained && this.mode === 'manager') {
      throw new TypeError('The record manager needs record types in manager mode');
    }
    this.selection = [];
    return this;
  }

  /** @returns {boolean} Whether this is one of the select modes. */
  isSelectMode() {
    return this.mode === 'select' || this.mode === 'select_multi';
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
    this.types = types;
    let path;
    try {
      path = recordTypesDomain(this.dbdefs, types).path;
    } catch {
      // no mixed domains (Artem 2026-10-19)
      this._showError($HR('These record types can not be listed together'));
      return this;
    }
    // the last view mode and sort of this domain (review 2026-10-20)
    this._settingsKey = `${SETTINGS_KEY}.${this.options.database || ''}.${path}`;
    const saved = readSettings(this._settingsKey);
    if (this.store) {
      try {
        this.relations = await this.store.list();
      } catch (error) {
        this._showError(error?.message || String(error));
        return this;
      }
    }
    this.loader = new RecordListLoader({ apiClient: this.options.apiClient, path, query: this._listQuery(types), sort: saved.sort,
      fields: [...RECORD_LIST_FIELDS, ...(this.options.listFields || []).map(String)] });
    this._renderFilter(listHost);
    this.list = new HRecordList();
    const listOptions = this._listOptions();
    // no remembered view mode when the host hides the view mode control
    if (saved.viewMode && listOptions.controls?.viewMode !== false) listOptions.viewMode = saved.viewMode;
    await this.list.initialize({
      container: listHost,
      options: { ...listOptions, sortExclude: path === '/records' ? [] : ['type'] },
      // Sort of the list (listTools): the loader asks the server with it
      getListSort: () => this.loader?.sort || null,
      onListSortChange: (value) => {
        this.loader?.setSort(value);
        this._saveSettings();
      },
      onViewModeChange: () => this._saveSettings(),
      onDataRequest: (request) => this.loader.load(request),
      onSelectionChange: (ids) => this._selectionChanged(ids),
      onEditRecord: (id) => void this._edit(id),
      onViewRecord: (id) => this.options.viewRecord?.(id),
      // the Extended view: the built-in record renderer (the records of the list's domain)
      onRecordContentRequest: (request) => this._recordContent(request, path),
      // select modes: double-click selects that record and finishes (plan 21 §3.2)
      onRecordActivate: this.isSelectMode() ? (id) => this._finish([id]) : undefined,
      recordTools: this.store ? (record) => this._relationTools(record)
        : (typeof this.options.recordTools === 'function' ? this.options.recordTools : undefined)
    });
    const bar = this.store ? this._renderRelationsBar() : this._renderAddBar();
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
    await this.filterForm?.destroy();
    this.filterForm = null;
    this.layout?.destroy();
    this.layout = null;
    await this.list?.destroy();
    this.list = null;
    this.container?.classList.remove('h-record-manager');
    await super.destroy();
  }

  /**
   * The filter of this manager: none with a browse filter or `filter: false`, else the
   * given one or the built-in filter of the types.
   *
   * @returns {{query: Array<object>, filterForm: object}|null}
   */
  filterDefinition() {
    if (this.store || this.options.filter === false || browseFilterQuery(this.options.query) != null) return null;
    return this.options.filter || builtinRecordFilter(this.dbdefs, this.types || this.recordTypes);
  }

  /**
   * The list query with the conditions of the filter form (null: none).
   *
   * @param {Array<object>|null} conditions Resolved conditions of the filter form.
   * @returns {Promise<void>}
   */
  async applyFilter(conditions) {
    const extra = Array.isArray(conditions) ? conditions.filter(Boolean) : [];
    this.filterConditions = extra;
    this.loader?.setQuery([...this._query(this.types || this.recordTypes), ...extra]);
    await this.list?.reload();
  }

  /** Filter form pane beside the list (west for a vertical form, north for a horizontal one). */
  _renderFilter(listHost) {
    const definition = this.filterDefinition();
    if (!definition) return;
    const pane = document.createElement('div');
    pane.className = 'h-record-manager-filter';
    // HFilterForm sets the class of its own container
    const formHost = document.createElement('div');
    pane.append(formHost);
    const north = definition.filterForm?.settings?.orientation === 'horizontal';
    const layoutHost = document.createElement('div');
    layoutHost.className = 'h-record-manager-layout';
    this.container.replaceChildren(layoutHost);
    this.layout = new HCardinalLayout(layoutHost, { westSize: 240, minWest: 180, northSize: 120, minCenterWidth: 320 });
    this.layout.setContent('center', listHost);
    this.layout.setContent(north ? 'north' : 'west', pane);
    this.layout.show(north ? 'north' : 'west');
    this.layout.hide(north ? 'west' : 'north');
    this.filterForm = new HFilterForm().attach(formHost, {
      definition: { query: definition.query, filterForm: definition.filterForm },
      dbdefs: this.dbdefs,
      // no value lists or counts from the server: the lists are terms and tags (plan 21 §7.1)
      apiClient: null,
      onSubmit: ({ query }) => this.applyFilter(query?.q || [])
    }).render();
    this.listen(pane, 'h-filter-form-reset', () => void this.applyFilter([]));
  }

  /** The list query: the types and the browse filter; relations mode: only the related records. */
  _listQuery(types) {
    const query = this._query(types);
    if (!this.store) return query;
    const extra = this.store.targetQuery(this.relations);
    return typeof query === 'string' ? query : [...query, ...extra];
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
      // Sort and Show owners after the search (plan 21 review)
      listTools: true,
      selectionMode: this.mode === 'select' ? 'single' : 'multi',
      // one record: no selection menu (Select all, Show selected); a filter form replaces the search box
      controls: {
        ...(given.controls || {}),
        ...(this.mode === 'select' ? { selectionActions: false } : {}),
        ...(this.filterDefinition() ? { search: false } : {})
      },
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
    if (Array.isArray(this.options.addActions) && this.options.addActions.length) return this._renderAddActions();
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

  /** The host's Add buttons (`addActions`). */
  _renderAddActions() {
    const bar = document.createElement('div');
    bar.className = 'h-record-manager-add';
    for (const action of this.options.addActions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'h-btn h-btn-primary h-btn-small h-record-manager-add-button';
      button.dataset.action = String(action.id || '');
      const icon = document.createElement('i');
      icon.className = `fa-solid ${action.icon || 'fa-plus-circle'}`;
      icon.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span');
      label.textContent = $HR(action.label);
      button.append(icon, label);
      if (action.title) button.title = $HR(action.title);
      this.listen(button, 'click', () => void this._add(null, action.run));
      bar.append(button);
    }
    return bar;
  }

  // --------------------------------------------------------------- relations mode ---

  /**
   * Top bar of the relations mode: the relation type of new relationships (remembered per
   * field) and "Find or Add <type>" (a manager of the other types in `select_multi`).
   */
  _renderRelationsBar() {
    const bar = document.createElement('div');
    bar.className = 'h-record-manager-add h-record-manager-relations-bar';
    if (this.options.readOnly) return bar;
    const label = document.createElement('span');
    label.className = 'h-record-manager-relations-label h-i18n';
    label.textContent = $HR('Relation type');
    const remembered = this._rememberedTerm();
    this.termSelect = this._termSelect(this.store.terms().some((term) => term.id === remembered) ? remembered : 0);
    this.termSelect.title = $HR('The relation type of new relationships');
    this.termSelect.addEventListener('change', () => this._rememberTerm(Number(this.termSelect.value)));
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'h-btn h-btn-primary h-btn-small h-record-manager-add-button h-record-manager-find';
    const icon = document.createElement('i');
    icon.className = 'fa-solid fa-magnifying-glass-plus';
    icon.setAttribute('aria-hidden', 'true');
    const caption = document.createElement('span');
    const names = this.recordTypes.map((id) => this._typeName(id)).join(', ');
    caption.textContent = names ? `${$HR('Find or Add')} ${names}` : $HR('Find or Add records');
    button.append(icon, caption);
    button.disabled = typeof this.options.browseRecords !== 'function';
    this.listen(button, 'click', () => void this._findOrAdd());
    bar.append(label, this.termSelect, button);
    return bar;
  }

  /** A relation type picker (the store's terms, indented by depth). */
  _termSelect(selected) {
    const select = document.createElement('select');
    select.className = 'h-select h-compact h-record-manager-term';
    const terms = this.store.terms();
    for (const term of terms) {
      const option = document.createElement('option');
      option.value = String(term.id);
      option.textContent = `${'  '.repeat(Math.max(0, term.depth || 0))}${term.label}`;
      select.append(option);
    }
    if (!selected) {
      // the first relation type by default
      if (terms.length) select.value = String(terms[0].id);
    } else if (terms.some((term) => term.id === Number(selected))) {
      select.value = String(selected);
    } else {
      // a stored type outside the vocabulary: shown, not offered for new ones
      const option = document.createElement('option');
      option.value = String(selected);
      option.textContent = this.store.termLabel(selected) || `#${selected}`;
      select.append(option);
      select.value = String(selected);
    }
    return select;
  }

  /** The toolset of a record: one line per relationship to it. */
  _relationTools(record) {
    const id = Number(record?.rec_ID) || 0;
    const relations = this.relations.filter((relation) => relation.other.id === id);
    if (!relations.length) return null;
    const tools = document.createElement('div');
    for (const relation of relations) tools.append(this._relationLine(relation));
    return tools;
  }

  /** Relationship icon | relation type | pen (relationship record) | bin. */
  _relationLine(relation) {
    const line = document.createElement('div');
    line.className = 'h-record-manager-relation';
    line.dataset.relId = String(relation.relId);
    // the icon of the relationship record type; memberships (and without icons): a font icon
    const relRty = Number(this.dbdefs?.dbconst?.('RT_RELATION')) || 1;
    const url = this.store.kind === 'members' ? '' : recordTypeIconUrl({ rec_RecTypeID: relRty }, this.options);
    const icon = document.createElement(url ? 'img' : 'i');
    if (url) {
      icon.className = 'h-record-manager-relation-icon';
      icon.src = url;
      icon.alt = '';
    } else {
      icon.className = `fa-solid ${this.store.kind === 'members' ? 'fa-user-group' : 'fa-diagram-project'} h-record-manager-relation-icon`;
      icon.setAttribute('aria-hidden', 'true');
    }
    icon.title = $HR(this.store.kind === 'members' ? 'Membership' : 'Relationship record');
    line.append(icon);
    const select = this._termSelect(relation.term);
    select.title = $HR('Relation type');
    select.disabled = this.options.readOnly === true;
    select.addEventListener('change', () => void this._write(line, () => this.store.setType(relation, Number(select.value))));
    line.append(select);
    const button = (icon, title, run) => {
      const element = document.createElement('button');
      element.type = 'button';
      element.className = 'heurist-icon-button';
      element.title = $HR(title);
      element.setAttribute('aria-label', element.title);
      const glyph = document.createElement('i');
      glyph.className = `fa-solid ${icon}`;
      glyph.setAttribute('aria-hidden', 'true');
      element.append(glyph);
      element.addEventListener('click', (event) => {
        event.stopPropagation();
        void run();
      });
      line.append(element);
    };
    if (this.store.canEditRelationship && typeof this.options.editRecord === 'function' && !this.options.readOnly) {
      button('fa-pen', 'Edit relationship record', () => this._editRelationship(relation));
    }
    if (!this.options.readOnly) {
      button('fa-trash-can', 'Remove the relationship', async () => {
        if (!(await confirmRelationshipDelete())) return;
        await this._write(line, () => this.store.remove(relation));
      });
    }
    return line;
  }

  /** "Find or Add": the picked records get relationships of the chosen type. */
  async _findOrAdd() {
    const term = Number(this.termSelect?.value) || 0;
    if (!term) {
      this._dispatch('h-record-manager-error', { error: new Error($HR('The field has no relation types')) });
      return;
    }
    const names = this.recordTypes.map((id) => this._typeName(id)).join(', ');
    const ids = await this.options.browseRecords({
      selectMode: 'select_multi',
      recordTypes: this.recordTypes,
      title: names ? `${$HR('Find or Add')} ${names}` : $HR('Find or Add records')
    });
    if (!ids?.length) return;
    // one write per relationship: a progress dialog with Cancel for many (review 2026-10-24)
    const progress = ids.length >= RELATION_PROGRESS_FROM
      ? openProgressDialog({ title: $HR('Relationships'), text: $HR('Creating relationships'), counter: true })
      : null;
    try {
      await this._write(null, () => this.store.add(ids, term, this.relations, {
        signal: progress?.signal || null,
        onProgress: progress ? (done, total) => progress.update(done, total) : null
      }));
    } finally {
      progress?.close();
    }
  }

  /** Edit a relationship record (its field's constraints, as HInputRelmarker), then the relations again. */
  async _editRelationship(relation) {
    const field = this.store.field;
    await this.options.editRecord(relation.relId, {
      relation: { vocabulary: Number(field.vocabulary) || null, targetTypes: this.recordTypes, reverse: this.store.reverse }
    });
    this.changed = true;
    await this.reloadRelations();
  }

  /** One write of the store (at once, plan 24): the line is busy meanwhile; then the relations again. */
  async _write(line, run) {
    line?.classList.add('is-busy');
    try {
      await run();
      this.changed = true;
    } catch (error) {
      this._dispatch('h-record-manager-error', { error });
    } finally {
      line?.classList.remove('is-busy');
    }
    await this.reloadRelations();
  }

  /**
   * Load the relations again and the list with them (relations mode).
   *
   * @returns {Promise<void>}
   */
  async reloadRelations() {
    if (!this.store) return;
    try {
      this.relations = await this.store.list();
    } catch (error) {
      this._dispatch('h-record-manager-error', { error });
    }
    this.loader?.setQuery(this._listQuery(this.types || this.recordTypes));
    await this.list?.reload();
  }

  /** @returns {number} The remembered relation type of new relationships of the field (0: none). */
  _rememberedTerm() {
    try {
      return Number(globalThis.localStorage?.getItem(this._termKey())) || 0;
    } catch {
      return 0;
    }
  }

  /** Remember the relation type of new relationships. */
  _rememberTerm(term) {
    try { globalThis.localStorage?.setItem(this._termKey(), String(term)); } catch { /* storage may be unavailable */ }
  }

  /** localStorage key of the relation type: database, store kind, field. */
  _termKey() {
    const field = this.store.field;
    return `${RELATION_TYPE_KEY}.${this.options.database || ''}.${this.store.kind}.${field.dty ?? field.name}.${this.store.reverse ? 'r' : 'f'}`;
  }

  /** Name of a record type (its id when unknown). */
  _typeName(id) {
    return this.dbdefs?.rectypeName?.(id) || `#${id}`;
  }

  /**
   * Add a record of a type through the host. Select modes: the new record is the
   * selection and the manager finishes; manager mode: the list reloads and selects it
   * (and a record added by a host action is opened in the editor).
   */
  async _add(rectypeId, run = null) {
    let result;
    try {
      result = run ? await run() : await this.options.addRecord(rectypeId);
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
    // a host action registers the record without an editor (files: Upload, URL): edit it now
    if (run) await this._edit(id);
  }

  /**
   * Content of the Extended view (HRecordList `onRecordContentRequest`): the built-in
   * record renderer of Record View (as the Data module), loaded on first use. Other
   * templates: none (the list shows its fallback).
   *
   * @returns {Promise<Map<number, HTMLElement>|null>}
   */
  async _recordContent({ records = [], template, signal } = {}, path = '/records') {
    if (template !== 'builtin') return null;
    const [{ RecordViewLoader }, { RecordViewRenderer }] = await Promise.all([
      import('../../recordview/RecordViewLoader.js'),
      import('../../recordview/RecordViewRenderer.js')
    ]);
    this._recordViewLoader ??= RecordViewLoader.create({ apiClient: this.options.apiClient, limits: this.options.limits || null });
    const loaded = await this._recordViewLoader.loadMany(records.map((record) => record?.rec_ID), { signal, path });
    const result = new Map();
    for (const [id, data] of loaded) {
      const container = document.createElement('div');
      container.className = 'h-record-manager-record-view';
      // a system record (user, group, file): its own image, as in its editor, apart from the field images
      const image = path !== '/records' ? String(data.record?.rec_ThumbnailURL || '') : '';
      new RecordViewRenderer({
        container, baseUrl: this.options.baseUrl || null, database: this.options.database || null, limits: this.options.limits || null
      }).showBuiltin(data.record, {
        sections: data.sections,
        recordTypeName: data.recordTypeName,
        onNavigate: (recordId) => this.options.viewRecord?.(recordId)
      });
      if (image) {
        const thumb = document.createElement('img');
        thumb.className = 'h-record-manager-entity-image';
        thumb.src = image;
        thumb.alt = '';
        container.prepend(thumb);
      }
      result.set(id, container);
    }
    return result;
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

  /** Remember the view mode and sort of the list. */
  _saveSettings() {
    if (!this._settingsKey) return;
    writeSettings(this._settingsKey, { viewMode: this.list?.options?.viewMode || null, sort: this.loader?.sort || null });
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

/** @returns {{viewMode?: string, sort?: string}} Remembered list settings (none when storage is unavailable). */
function readSettings(key) {
  try {
    const value = JSON.parse(globalThis.localStorage?.getItem(key) || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

/** Remember list settings. */
function writeSettings(key, value) {
  try { globalThis.localStorage?.setItem(key, JSON.stringify(value)); } catch { /* storage may be unavailable */ }
}
