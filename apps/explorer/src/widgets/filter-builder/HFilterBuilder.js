/**
 * @file HFilterBuilder.js
 * @brief Visual Heurist query builder with linked criteria and runtime placeholders.
 *
 * Framework-free re-implementation of legacy `hclient/widgets/search/searchBuilder.js`,
 * matching its workflow and layout (record type · language · field rows with
 * operator/value · any|all conjunction · sorted-by section · live JSON preview)
 * but NOT its Ruleset/Expansion section (D3). Query <-> model mapping lives in
 * `src/utils/queryModel.js`; this class owns only the DOM. Emits
 * `onChange(jsonQuery, textQuery)` - `textQuery` stays null until M4 (describe()).
 *
 * Blank criteria become named placeholders in the Heurist query array.
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

import { HBaseWidget } from '#shared/widgets/HBaseWidget.js';
import { $HR, HMsg } from '#shared/ui';
import { composeQuery, parseQuery, emptyFieldRow, resolveQueryNames, reconcileModel } from '../../utils/queryModel.js';
import { describeGeoValue } from '#shared/widgets/form/inputs/HInputGeo.js';
import { queryDescribe } from '../../utils/queryDescribe.js';
import { HFilterBuilderItem } from './HFilterBuilderItem.js';
import { HFilterBuilderSort } from './HFilterBuilderSort.js';
import { HFieldTree } from './HFieldTree.js';
import { HFilterFormDesigner } from './HFilterFormDesigner.js';
import { HFilterForm } from '#shared/widgets/filter/HFilterForm.js';
import { describeQueryParameters, hasQueryParameters, resolveQueryParameters } from '#shared/data/queryParameters.js';
import { parseTextQuery } from '../../utils/parseTextQuery.js';
import { str, kindFor, operatorByKey } from '../../utils/vocabHelpers.js';
import './HFilterBuilder.css';

/** Visual Heurist query builder: record type, field/link rows, sort, and a live JSON preview. */
export class HFilterBuilder extends HBaseWidget {
  /**
   * @param {{dbdefs:object, vocabulary:object, lang?:string, onChange?:Function, hideUnusedRectypes?:boolean}} deps
   *        `hideUnusedRectypes` is the initial state of the "hide record types without records" checkbox.
   */
  constructor({ dbdefs, vocabulary, lang = 'eng', onChange, selectExtent, hideUnusedRectypes = true } = {}) {
    super();
    if (!dbdefs) throw new TypeError('HFilterBuilder requires dbdefs (HDbDefs)');
    if (!vocabulary) throw new TypeError('HFilterBuilder requires vocabulary (queryVocabulary.json)');
    this.dbdefs = dbdefs;
    this.vocab = vocabulary;
    this.lang = lang;
    this.selectExtent = selectExtent;
    this._onChange = onChange || (() => {});
    this.tree = new HFieldTree({ dbdefs });

    this.model = { rtyId: '', conjunction: 'all', lang, rows: [], sort: [], unsupported: null };
    this._entries = []; // { kind:'field'|'link', item?:HFilterBuilderItem, panel?:LinkPanel, el:HTMLElement }
    this._sorts = [];   // HFilterBuilderSort
    this.form = null;
    this._fixedRecordTypeId = null;
    this._allowParameters = true;
    this._hideUnused = hideUnusedRectypes !== false; // hide record types without records from selectors and the field tree
  }

  /**
   * Attach the widget to its container.
   *
   * @param {HTMLElement} container Container element.
   * @param {object} [options] Widget options.
   * @returns {HFilterBuilder} This instance, for chaining.
   */
  attach(container, options = {}) {
    super.attach(container, options);
    return this;
  }

  /**
   * Render the header (record type/language), criteria rows, sort section, and preview.
   *
   * @returns {HFilterBuilder} This instance, for chaining.
   * @throws {Error} When the widget has not been attached yet.
   */
  render() {
    if (!this.container) throw new Error('HFilterBuilder must be attached before render');
    this.container.className = 'h-fb';
    this.container.replaceChildren();

    // ---- header: record type + language ----
    const header = el('div', 'h-fb-header');

    this._rtySel = document.createElement('select');
    this._rtySel.className = 'h-select h-fb-rectype';
    this._populateRectypes();
    this._rtySel.addEventListener('change', () => {
      this.model.rtyId = coerceRty(this._rtySel.value);
      this._onScopeChanged();
      this._recompose();
    });

    header.append(labelled($HR('Record type'), this._rtySel));
    if (this.dbdefs.hasRectypeCounts?.()) {
      header.append(hideUnusedToggle(this._hideUnused, (on) => {
        this._hideUnused = on;
        this._populateRectypes();
        this._rtySel.value = this.model.rtyId === '' || this.model.rtyId == null ? '' : String(this.model.rtyId);
      }));
    }

    const langs = this.dbdefs.languages?.() || [];
    if (langs.length > 1) {
      this._langSel = document.createElement('select');
      this._langSel.className = 'h-select h-fb-lang';
      for (const code of ['', ...langs]) {
        const o = document.createElement('option');
        o.value = code;
        o.textContent = code || $HR('Default');
        this._langSel.append(o);
      }
      this._langSel.value = '';
      this._langSel.addEventListener('change', () => { /* reserved: term label language */ });
      header.append(labelled($HR('Language'), this._langSel));
    }

    const clearBtn = btn($HR('Clear all'), 'h-btn h-btn-small h-fb-clear', () => this.setQuery([]));
    header.append(clearBtn);
    this.container.append(header);

    const guidance = el('p', 'h-fb-guidance h-i18n');
    guidance.textContent = this._allowParameters
      ? 'Select fields, comparison operators and values. Leave a value blank to let the user enter it in the Filter Form when the Query Source runs.'
      : 'Select fields, comparison operators and values.';
    this._guidance = guidance;
    this.container.append(guidance);

    // ---- criteria ----
    const crit = el('div', 'h-fb-criteria');

    // The single AND/OR selector between top-level criteria. It is re-parented
    // into the 2nd row's conjunction slot; rows 3+ show a static label instead.
    this._conjSel = document.createElement('select');
    this._conjSel.className = 'h-select h-fb-conj';
    for (const [val, key] of [['all', 'phrase.and'], ['any', 'phrase.or']]) {
      const o = document.createElement('option');
      o.value = val;
      o.textContent = (str(this.vocab, this.lang, key).trim() || val).toUpperCase();
      this._conjSel.append(o);
    }
    this._conjSel.addEventListener('change', () => {
      this.model.conjunction = this._conjSel.value;
      this._refreshRowConjunctions();
      this._recompose();
    });

    this._rowsHost = el('div', 'h-fb-rows');
    crit.append(this._rowsHost);

    const addRow = el('div', 'h-fb-addrow');
    const addBtn = btn('+', 'h-btn h-fb-addbig', () => {
      const entry = this._addFieldEntry();
      this._recompose();
      entry.item.openFieldPicker();
    });
    addBtn.title = $HR('add field');
    addRow.append(addBtn);
    crit.append(addRow);
    this.container.append(crit);

    // ---- sort ----
    const sortSec = el('details', 'h-fb-sort');
    const sortSum = document.createElement('summary');
    sortSum.textContent = $HR('Sorted by');
    sortSec.append(sortSum);
    this._sortHost = el('div', 'h-fb-sort-rows');
    sortSec.append(this._sortHost);
    const addSortBtn = btn('+', 'h-btn h-fb-addbig', () => { this._addSort(); this._recompose(); });
    addSortBtn.title = $HR('add sort');
    sortSec.append(addSortBtn);
    this.container.append(sortSec);

    const formActions = el('div', 'h-fb-form-actions');
    formActions.append(
      btn($HR('Design Filter Form…'), 'h-btn', () => void this.openFormDesigner()),
      btn($HR('Preview Filter Form'), 'h-btn', () => void this.previewFilterForm())
    );
    this._criteriaInfo = el('span', 'h-fb-criteria-info h-i18n');
    formActions.append(this._criteriaInfo);
    this._formActions = formActions;
    this.container.append(formActions);

    // ---- preview ----
    const preview = makeQueryPreview();
    this._sentence = preview.sentence;
    this._preview = preview.json;
    this.container.append(preview.element);

    this._unsupportedNote = el('div', 'h-fb-unsupported');
    this._unsupportedNote.hidden = true;
    this._unsupportedNote.textContent = $HR('Part of this query is too complex to edit visually and will be kept unchanged.');
    preview.element.append(this._unsupportedNote);

    this.state = 'rendered';
    this._syncFromModel();
    return this;
  }

  // ------------------------------------------------------------- public API ---

  /**
   * Predefine the query record type. When locked, the selector is disabled and
   * the record type acts as builder scope rather than an editable criterion.
   *
   * @param {number|string|null} rtyId Record type id.
   * @param {{locked?:boolean,allowParameters?:boolean}} [options]
   * @returns {HFilterBuilder} This instance.
   */
  setRecordType(rtyId, options = {}) {
    const { locked = false, allowParameters = this._allowParameters } = options;
    const value = coerceRty(rtyId);
    this._allowParameters = allowParameters !== false;
    if (!this._allowParameters) this.form = null;
    this._fixedRecordTypeId = locked && value !== '' ? value : null;
    this.model.rtyId = value;
    if (this.isRendered) {
      this._populateRectypes();
      this._rtySel.value = value === '' || value == null ? '' : String(value);
      this._rtySel.disabled = Boolean(this._fixedRecordTypeId);
      if (this._guidance) {
        this._guidance.textContent = this._allowParameters
          ? 'Select fields, comparison operators and values. Leave a value blank to let the user enter it in the Filter Form when the Query Source runs.'
          : 'Select fields, comparison operators and values.';
      }
      this._onScopeChanged();
      this._recompose();
    }
    return this;
  }

  /** @returns {Array<object>} the composed Heurist q-array */
  getQuery() {
    return this.getDefinition().query;
  }

  /**
   * Return the query with parameter bindings and optional form layout.
   *
   * @returns {{query:Array<object>,filterForm:object|null}} Query and separate layout.
   */
  getDefinition() {
    const model = this._readModel();
    const used = new Set();
    const visitIds = (rows) => {
      for (const row of rows || []) {
        if (row.type === 'link') visitIds(row.rows);
        else for (const id of row.placeholderIds || []) {
          if (id) used.add(id);
        }
      }
    };
    visitIds(model.rows);
    let index = 1;
    const nextId = () => {
      while (used.has(`X${index}`)) index++;
      const id = `X${index++}`;
      used.add(id);
      return id;
    };
    const visit = (rows) => {
      for (const row of rows || []) {
        if (row.type === 'link') { visit(row.rows); continue; }
        const range = operatorByKey(this.vocab, row.kind, row.op)?.input === 'range';
        if (operatorByKey(this.vocab, row.kind, row.op)?.whole) continue;
        if (isImplicitParameter(row, this.vocab)) {
          const count = range ? 2 : 1;
          for (let i = 0; i < count; i++) {
            if (!String(row.values?.[i] ?? '').trim()) {
              const id = row.placeholderIds?.[i] || nextId();
              row.values[i] = `$${id}$`;
            }
          }
        }
      }
    };
    if (this._allowParameters) visit(model.rows);
    const query = composeQuery(model, this.vocab);
    const parameters = this._allowParameters ? describeQueryParameters(query, this.dbdefs) : {};
    const filterForm = this._allowParameters && this.form && Object.keys(parameters).length
      ? structuredClone(this.form) : null;
    if (filterForm) {
      for (const group of filterForm.groups || []) {
        group.children = (group.children || []).filter((child) => parameters[child.input]);
      }
    }
    return { query, filterForm };
  }

  /** @param {Array|string|object} query */
  setQuery(query) {
    // JSON or plain Heurist text (`t:10 lt240(t:48 …)`), either as the whole
    // argument or inside a `{query|q, filterForm}` definition
    const fromText = (value) => {
      if (typeof value !== 'string') return value;
      const text = value.trim();
      if (text.startsWith('{') || text.startsWith('[')) {
        try { return JSON.parse(text); }
        catch { /* not JSON - fall through to the text syntax */ }
      }
      return parseTextQuery(text, { dbdefs: this.dbdefs });
    };
    const definition = fromText(query);
    const queryArray = fromText(definition?.query || definition?.q || definition);
    // record-type / field names (`{"t":"Life event"}`, `f:Date of event`) -> ids
    this.model = reconcileModel(parseQuery(resolveQueryNames(queryArray, this.dbdefs), this.vocab), this.vocab, {
      fieldType: (dty) => this.dbdefs.fieldType?.(null, dty) || this.dbdefs.fieldGlobal?.(dty)?.type
    });
    if (this._fixedRecordTypeId != null) this.model.rtyId = this._fixedRecordTypeId;
    this.form = definition?.filterForm || null;
    const restore = (rows) => {
      for (const row of rows || []) {
        if (row.type === 'link') { restore(row.rows); continue; }
        const first = /^\$([A-Za-z][A-Za-z0-9_]*)\$$/.exec(row.values?.[0] || '');
        const second = /^\$([A-Za-z][A-Za-z0-9_]*)\$$/.exec(row.values?.[1] || '');
        row.placeholderIds = [];
        if (first) { row.placeholderIds[0] = first[1]; row.values[0] = ''; }
        if (second) { row.placeholderIds[1] = second[1]; row.values[1] = ''; }
      }
    };
    if (this._allowParameters) restore(this.model.rows);
    // text queries carry enum values as labels (`f:237:"Lived at"`); the term
    // picker selects by id
    const resolveTerms = (rows) => {
      for (const row of rows || []) {
        if (row.type === 'link') { resolveTerms(row.rows); continue; }
        const root = /^\d+$/.test(String(row.dty)) && !row.enumField
          ? this.dbdefs?.vocabRoot?.(row.dty) || 0 : 0;
        if (!root) continue;
        row.values = (row.values || []).map((v) => {
          if (!v || /^\d+$/.test(v) || /^\$\w+\$$/.test(v)) return v;
          const id = this.dbdefs.termIdByLabel?.(root, v);
          return id ? String(id) : v;
        });
      }
    };
    resolveTerms(this.model.rows);
    if (!this.model.lang) this.model.lang = this.lang;
    if (this.isRendered) this._syncFromModel();
    this._recompose();
    return this;
  }

  /**
   * Open the filter-only layout designer for the current parameters.
   *
   * @returns {Promise<void>} Completion after the dialog opens.
   */
  async openFormDesigner() {
    if (!this._allowParameters) return;
    let definition;
    try { definition = this.getDefinition(); }
    catch (error) { HMsg.showMsgFlash?.(error.message); return; }
    if (!hasQueryParameters(definition.query)) {
      HMsg.showMsgFlash?.($HR('Create a parameter first'));
      return;
    }

    const host = document.createElement('div');
    const designer = new HFilterFormDesigner();
    designer.attach(host, {
      parameters: describeQueryParameters(definition.query, this.dbdefs),
      query: definition.query,
      layout: this.form,
      dbdefs: this.dbdefs,
      selectExtent: this.selectExtent
    }).render();
    const id = 'h-filter-form-designer-dialog';
    const close = async (apply) => {
      if (apply) {
        try { this.form = designer.getLayout(); }
        catch (error) {
          HMsg.showMsgFlash?.(error.message, { dialogId: 'h-filter-form-designer-warning' });
          return;
        }
      }
      HMsg.closeMsgDlg(id);
      await designer.destroy();
    };
    HMsg.showMsgDlg(host, {
      dialogId: id,
      title: 'Filter form designer',
      preventClose: true,
      buttons: [
        { label: 'Apply', class: 'h-btn h-btn-primary', onClick: () => void close(true) },
        { label: 'Cancel', class: 'h-btn', onClick: () => void close(false) }
      ]
    });
  }

  /**
   * Preview the current parameter form in a nested dialog.
   *
   * @returns {Promise<void>} Completion after the dialog opens.
   */
  async previewFilterForm() {
    if (!this._allowParameters) return;
    let definition;
    try { definition = this.getDefinition(); }
    catch (error) { HMsg.showMsgFlash?.(error.message); return; }
    if (!hasQueryParameters(definition.query)) {
      HMsg.showMsgFlash?.($HR('Create a parameter first'));
      return;
    }

    const host = document.createElement('div');
    const formHost = document.createElement('div');
    const preview = makeQueryPreview();
    host.append(formHost, preview.element);
    const form = new HFilterForm();
    form.attach(formHost, {
      definition,
      dbdefs: this.dbdefs,
      selectExtent: this.selectExtent,
      preview: true,
      composeQuery: (source, values) => resolveQueryParameters(source.query, values),
    }).render();
    const update = () => {
      const request = resolveQueryParameters(definition.query, form.getValues());
      updateQueryPreview(preview, request.q, this.dbdefs, this.vocab, this.lang, request.extent);
    };
    host.addEventListener('h-input-change', update);
    host.addEventListener('change', update);
    host.addEventListener('h-filter-form-reset', update);
    update();
    const id = 'h-filter-form-preview-dialog';
    const dialog = HMsg.showMsgDlg(host, {
      dialogId: id,
      title: 'Filter form preview',
      preventClose: true,
      buttons: [{ label: 'Close', class: 'h-btn', onClick: () => HMsg.closeMsgDlg(id) }]
    });
    dialog.addEventListener('close', () => void form.destroy(), { once: true });
  }

  // --------------------------------------------------------------- internal ---

  /**
   * Rebuild the record-type select's options, grouped by rectype group.
   *
   * @private
   * @returns {void}
   */
  _populateRectypes() {
    this._rtySel.replaceChildren();
    for (const [val, label] of [['', $HR('any record type')]]) {
      const o = document.createElement('option');
      o.value = val; o.textContent = label; this._rtySel.append(o);
    }
    const groups = new Map();
    const current = String(this.model.rtyId ?? '');
    for (const rt of this.dbdefs.rectypes()) {
      // the selected type stays listed even when it has no records
      if (this._hideUnused && String(rt.id) !== current && this.dbdefs.isRectypeUsed?.(rt.id) === false) continue;
      const gid = rt.group ?? 0;
      if (!groups.has(gid)) groups.set(gid, []);
      groups.get(gid).push(rt);
    }
    const groupMeta = new Map((this.dbdefs.rectypeGroups?.() || []).map((g) => [g.id, g]));
    for (const [gid, list] of groups) {
      const og = document.createElement('optgroup');
      og.label = groupMeta.get(gid)?.name || $HR('Other');
      for (const rt of list) {
        const o = document.createElement('option');
        o.value = String(rt.id);
        o.textContent = rt.name;
        og.append(o);
      }
      this._rtySel.append(og);
    }
  }

  /**
   * Rebuild every row, link panel, and sort widget from `this.model`.
   *
   * @private
   * @returns {void}
   */
  _syncFromModel() {
    this._populateRectypes();
    this._rtySel.value = this.model.rtyId === '' || this.model.rtyId == null ? '' : String(this.model.rtyId);
    this._rtySel.disabled = Boolean(this._fixedRecordTypeId);
    this._conjSel.value = this.model.conjunction === 'any' ? 'any' : 'all';

    for (const entry of this._entries) {
      if (entry.item) entry.item.destroy?.();
      else entry.panel?.destroy?.();
    }
    this._entries = [];
    this._rowsHost.replaceChildren();
    if (!this.model.rows.length) this.model.rows = [emptyFieldRow()];
    for (const row of this.model.rows) {
      if (row.type === 'link') this._addLinkEntry(row);
      else this._addFieldEntry(row);
    }

    for (const s of this._sorts) s.destroy?.();
    this._sorts = [];
    this._sortHost.replaceChildren();
    for (const entry of this.model.sort) this._addSort(entry);

    this._onScopeChanged();
    this._recompose();
  }

  /**
   * Propagate the current scope record type to every row/sort widget and refresh conjunction labels.
   *
   * @private
   * @returns {void}
   */
  _onScopeChanged() {
    const rtyId = this.model.rtyId;
    for (const entry of this._entries) {
      if (entry.kind === 'field') entry.item.setScope(rtyId);
      else entry.panel.setScope(rtyId);
    }
    for (const s of this._sorts) s.setScope(rtyId);
    this._refreshRowConjunctions();
  }

  /**
   * Row 0: nothing. Row 1: the shared AND/OR selector. Row 2+: a static label
   * matching the selector's value. Mirrors legacy `.search_conjunction`.
   */
  _refreshRowConjunctions() {
    const word = (this._conjSel.value === 'any'
      ? str(this.vocab, this.lang, 'phrase.or')
      : str(this.vocab, this.lang, 'phrase.and')).trim().toUpperCase();
    this._entries.forEach((entry, index) => {
      if (!entry.conj) return;
      entry.conj.replaceChildren();
      if (index === 1) {
        entry.conj.append(this._conjSel);
      } else if (index >= 2) {
        const lbl = document.createElement('span');
        lbl.className = 'h-fb-conjlabel';
        lbl.textContent = word;
        entry.conj.append(lbl);
      }
    });
  }

  /**
   * Build a criteria row's host structure: outer row, conjunction slot, and item host.
   *
   * @private
   * @param {string} [extraClass=''] Extra class name appended to the row element.
   * @returns {{host: HTMLElement, conj: HTMLElement, itemHost: HTMLElement}}
   */
  _makeEntryHost(extraClass = '') {
    const host = el('div', 'h-fb-row' + (extraClass ? ' ' + extraClass : ''));
    const conj = el('span', 'h-fb-rowconj');
    const itemHost = el('div', 'h-fb-itemhost');
    host.append(conj, itemHost);
    return { host, conj, itemHost };
  }

  /**
   * Add a new flat field criterion row.
   *
   * @private
   * @param {import('../../utils/queryModel.js').FieldRow|null} [rowModel] Initial row model; blank when omitted.
   * @returns {object} The created entry record (`{kind: 'field', item, el, conj}`).
   */
  _addFieldEntry(rowModel = null) {
    const { host, conj, itemHost } = this._makeEntryHost();
    const item = new HFilterBuilderItem({
      dbdefs: this.dbdefs,
      vocabulary: this.vocab,
      lang: this.lang,
      scopeRtyId: this.model.rtyId,
      selectExtent: this.selectExtent,
      onRequestFieldPick: (it, anchor) => this._pickField(it, anchor),
      onChange: (evt) => {
        if (evt?.removed) this._removeEntry(entry);
        this._recompose();
      }
    });
    item.attach(itemHost).render();
    if (rowModel) item.setRowModel(rowModel);
    this._rowsHost.append(host);
    const entry = { kind: 'field', item, el: host, conj };
    this._entries.push(entry);
    this._onScopeChanged();
    return entry;
  }

  /**
   * Add a new "linked to/from" sub-query row.
   *
   * @private
   * @param {import('../../utils/queryModel.js').LinkRow|null} [rowModel] Initial row model; blank when omitted.
   * @returns {object} The created entry record (`{kind: 'link', panel, el, conj}`).
   */
  _addLinkEntry(rowModel = null) {
    const { host, conj, itemHost } = this._makeEntryHost('h-fb-linkrow');
    const panel = new LinkPanel({
      builder: this,
      depth: 1,
      scopeRtyId: this.model.rtyId,
      onChange: (evt) => {
        if (evt?.removed) this._removeEntry(entry);
        this._recompose();
      }
    });
    panel.attach(itemHost).render();
    if (rowModel) panel.setRowModel(rowModel);
    this._rowsHost.append(host);
    const entry = { kind: 'link', panel, el: host, conj };
    this._entries.push(entry);
    this._onScopeChanged();
    return entry;
  }

  /**
   * Remove a criteria row entry's DOM and bookkeeping.
   *
   * @private
   * @param {object} entry Entry record returned by `_addFieldEntry`/`_addLinkEntry`.
   * @returns {void}
   */
  _removeEntry(entry) {
    const i = this._entries.indexOf(entry);
    if (i >= 0) this._entries.splice(i, 1);
    entry.el.remove();
    this._onScopeChanged();
  }

  /**
   * Add a new "sort by" row.
   *
   * @private
   * @param {{field?: number|string, dir?: string}|null} [entryModel] Initial sort entry; blank when omitted.
   * @returns {void}
   */
  _addSort(entryModel = null) {
    const host = el('div', 'h-fb-sort-row');
    const sort = new HFilterBuilderSort({
      dbdefs: this.dbdefs,
      lang: this.lang,
      scopeRtyId: this.model.rtyId,
      onChange: (evt) => {
        if (evt?.removed) {
          const i = this._sorts.indexOf(sort);
          if (i >= 0) this._sorts.splice(i, 1);
          host.remove();
        }
        this._recompose();
      }
    });
    sort.attach(host).render();
    if (entryModel) sort.setEntry(entryModel);
    this._sortHost.append(host);
    this._sorts.push(sort);
  }

  /** Field-tree picker for a top-level field row. */
  _pickField(item, anchor) {
    const excludedFields = this._entries.filter((entry) => entry.kind === 'field' && entry.item !== item)
      .map((entry) => entry.item.row)
      .filter((row) => row.selected || row.dty !== 'anyfield')
      .map((row) => row.dty);
    this.tree.open(anchor, {
      rtyId: this.model.rtyId,
      maxDepth: 3,
      builderMode: true,
      hideUnusedRectypes: this._hideUnused,
      excludedLinks: selectedLinkBranches(this._entries),
      excludedFields
    }, (path) => {
      if (!path?.length) return;
      if (path.length === 1) {
        if (this._entries.some((entry) => entry.kind === 'field' && entry.item !== item
          && String(entry.item.row.dty) === String(path[0].dty)
          && (entry.item.row.selected || entry.item.row.dty !== 'anyfield'))) return;
        item.setField(path[0]);
        this._recompose();
        return;
      }
      // one pointer hop -> convert this field row into a link entry
      const entry = this._entries.find((e) => e.item === item);
      const rowModel = rowForPath(path, this.vocab);
      const link = this._addLinkEntry();
      // move new link entry to the old row's position, drop the old row
      if (entry) {
        this._rowsHost.insertBefore(link.el, entry.el);
        this._removeEntry(entry);
      }
      link.panel.setRowModel(rowModel);
      this._recompose();
    });
  }

  /**
   * Read the live model from the current row/sort widgets (or the stored model, before render).
   *
   * @private
   * @returns {object} Current builder model (`BuilderModel` shape).
   */
  _readModel() {
    // before render() the DOM entry lists are empty - the parsed model is authoritative
    if (!this.isRendered) return this.model;
    const rows = this._entries.map((entry) => (
      entry.kind === 'link' ? entry.panel.getRowModel() : entry.item.getRowModel()
    ));
    const sort = this._sorts.map((s) => s.getEntry()).filter((e) => e.field !== '' && e.field != null);
    return { ...this.model, rows, sort };
  }

  /**
   * Recompose the model into a `q`-array, refresh the preview/sentence/unsupported note, and notify `onChange`.
   *
   * @private
   * @returns {void}
   */
  _recompose() {
    this.model = this._readModel();
    const q = this.getDefinition().query;
    const hasParameters = this._allowParameters && hasParameterRows(this.model.rows, this.vocab);
    if (this._formActions) this._formActions.hidden = !this._allowParameters || !hasParameters;
    if (this._criteriaInfo) {
      const count = countCriteria(this.model.rows);
      const criteria = count === 1 ? $HR('criterion') : $HR('criteria');
      if (this._allowParameters) {
        const blank = countBlankCriteria(this.model.rows, this.vocab);
        const blanks = blank === 1 ? $HR('has a blank value') : $HR('have blank values');
        this._criteriaInfo.textContent = `${count} ${criteria} ${$HR('defined')}. `
          + `${blank} ${blanks}; ${$HR('users can supply them in the Filter Form')}.`;
      } else {
        this._criteriaInfo.textContent = `${count} ${criteria} ${$HR('defined')}.`;
      }
    }
    const sentence = q.length
      ? queryDescribe(q, { dbdefs: this.dbdefs, vocabulary: this.vocab, lang: this.lang })
      : '';
    if (this._sentence && this._preview) {
      updateQueryPreview({ sentence: this._sentence, json: this._preview }, q, this.dbdefs, this.vocab, this.lang);
    }
    if (this._unsupportedNote) {
      this._unsupportedNote.hidden = !(this.model.unsupported && this.model.unsupported.length);
    }
    this._onChange(q, sentence || null);
  }

  /**
   * Destroy the field-tree popover and every row/sort widget.
   *
   * @returns {Promise<void>}
   */
  async destroy() {
    this.tree?.destroy();
    for (const entry of this._entries) { entry.item?.destroy?.(); entry.panel?.destroy?.(); }
    for (const s of this._sorts) s.destroy?.();
    this._entries = [];
    this._sorts = [];
    await super.destroy();
  }
}

/* ------------------------------------------------------------------ LinkPanel --- */
/** One linked subquery block; it may contain field rows or deeper linked blocks. */
class LinkPanel {
  /**
   * @param {{builder: HFilterBuilder, onChange?: Function, depth:number, scopeRtyId:number|string}} options Panel configuration.
   */
  constructor({ builder, onChange, depth = 1, scopeRtyId = '' }) {
    this.builder = builder;
    this.dbdefs = builder.dbdefs;
    this.vocab = builder.vocab;
    this._onChange = onChange || (() => {});
    this.depth = depth;
    this.scopeRtyId = scopeRtyId;
    this.row = { type: 'link', link: 'lt', dty: '', targetRty: '', conjunction: 'all', rows: [] };
    this.items = [];
    this.container = null;
  }

  /**
   * Attach the panel to its container.
   *
   * @param {HTMLElement} container Container element.
   * @returns {LinkPanel} This instance, for chaining.
   */
  attach(container) { this.container = container; return this; }

  /**
   * Render the link-type/target/pointer selects and the sub-criteria list.
   *
   * @returns {LinkPanel} This instance, for chaining.
   */
  render() {
    this.container.replaceChildren();
    this.container.classList.add('h-fb-linkpanel');

    const head = el('div', 'h-fb-linkhead');

    const remove = btn('×', 'heurist-icon-button h-fbitem-remove', () => { this.destroy(); this._onChange({ removed: true }); });

    this._linkSel = document.createElement('select');
    this._linkSel.className = 'h-select';
    for (const [v, label] of [['lt', $HR('linked to')], ['lf', $HR('linked from')]]) {
      const o = document.createElement('option'); o.value = v; o.textContent = label; this._linkSel.append(o);
    }
    this._linkSel.value = this.row.link;
    this._linkSel.addEventListener('change', () => {
      this.row.link = this._linkSel.value;
      this.row.dty = '';
      this._populateTargets();
      this._populatePointers();
      this._emit();
    });

    this._targetSel = document.createElement('select');
    this._targetSel.className = 'h-select';
    this._targetSel.addEventListener('change', () => {
      this.row.targetRty = coerceRty(this._targetSel.value);
      this._populatePointers();
      for (const it of this.items) it.setScope(this.row.targetRty);
      this._emit();
    });

    this._pointerSel = document.createElement('select');
    this._pointerSel.className = 'h-select';
    this._pointerSel.addEventListener('change', () => {
      this.row.dty = this._pointerSel.value === '' ? '' : Number(this._pointerSel.value);
      this._emit();
    });

    this._linkText = el('span', 'h-fb-linktext');
    this._targetText = el('span', 'h-fb-linktext');
    this._pointerText = el('span', 'h-fb-linktext');
    head.append(remove, this._linkText, this._targetText, this._pointerText);
    this.container.append(head);

    this._subHost = el('div', 'h-fb-sublist');
    this.container.append(this._subHost);

    this._subConj = document.createElement('select');
    for (const [v, key] of [['all', 'phrase.and'], ['any', 'phrase.or']]) {
      const o = document.createElement('option');
      o.value = v; o.textContent = (str(this.vocab, this.builder.lang, key).trim() || v).toUpperCase();
      this._subConj.append(o);
    }
    this._subConj.value = this.row.conjunction;
    this._subConj.addEventListener('change', () => {
      this.row.conjunction = this._subConj.value;
      this._refreshSubConjunctions();
      this._emit();
    });

    const addCond = btn('+ ' + $HR('add condition'), 'h-btn h-btn-small', () => {
      const item = this._addItem();
      this._emit();
      item.openFieldPicker();
    });
    const foot = el('div', 'h-fb-subfoot');
    this._subFoot = foot;
    foot.append(addCond, this._subConj);
    this.container.append(foot);

    this._populateTargets();
    this._populatePointers();
    this._syncHead();
    if (!this.items.length) this._addItem();
    this._refreshSubConjunctions();
    return this;
  }

  /**
   * Rebuild the target-rectype select's options from the scope rectype's link graph.
   *
   * @private
   * @returns {void}
   */
  _populateTargets() {
    const scope = Number(this.scopeRtyId) > 0 ? Number(this.scopeRtyId) : null;
    this._targetSel.replaceChildren();
    const anyOpt = document.createElement('option');
    anyOpt.value = ''; anyOpt.textContent = $HR('any');
    this._targetSel.append(anyOpt);
    const dir = this.row.link === 'lf' ? 'from' : 'to';
    const ids = scope ? this.dbdefs.linkedRectypes(scope, { direction: dir }) : [];
    for (const id of ids) {
      const o = document.createElement('option');
      o.value = String(id); o.textContent = this.dbdefs.rectypeName(id);
      this._targetSel.append(o);
    }
    this._targetSel.value = this.row.targetRty === '' ? '' : String(this.row.targetRty);
  }

  /**
   * Rebuild the pointer-field select's options for the current scope/target rectype pair.
   *
   * @private
   * @returns {void}
   */
  _populatePointers() {
    const scope = Number(this.scopeRtyId) > 0 ? Number(this.scopeRtyId) : null;
    const target = Number(this.row.targetRty) > 0 ? Number(this.row.targetRty) : null;
    this._pointerSel.replaceChildren();
    const any = document.createElement('option');
    any.value = ''; any.textContent = $HR('any link');
    this._pointerSel.append(any);
    if (scope && target) {
      const [from, to] = this.row.link === 'lf' ? [target, scope] : [scope, target];
      for (const dty of this.dbdefs.pointerFieldsBetween(from, to)) {
        const o = document.createElement('option');
        o.value = String(dty);
        o.textContent = this.dbdefs.fieldGlobal(dty)?.name || `field ${dty}`;
        this._pointerSel.append(o);
      }
    }
    this._pointerSel.value = this.row.dty === '' ? '' : String(this.row.dty);
  }

  /** Refresh the read-only linked-query header from its selected path. */
  _syncHead() {
    if (!this._linkText) return;
    this._linkText.textContent = {
      lf: $HR('linked from'), related: $HR('related to'), rt: $HR('related to'), rf: $HR('related from')
    }[this.row.link] || $HR('linked to');
    this._targetText.textContent = this.row.targetRty
      ? this.dbdefs.rectypeName(this.row.targetRty) : $HR('any record type');
    this._pointerText.textContent = this.row.dty
      ? `${$HR('via')} ${this.dbdefs.fieldGlobal(this.row.dty)?.name || this.row.dty}` : '';
  }

  /** Whether this block is a relationship (`related` / `rt` / `rf`) sub-query. */
  _isRelation() {
    return ['related', 'rt', 'rf'].includes(this.row.link);
  }

  /**
   * Vocabulary roots for the relation-type picker: the branch's relmarker vocabulary;
   * when the relmarker is not known (a loaded query), the vocabularies of the scope
   * record type's relmarkers that reach the target, else of every relmarker.
   *
   * @private
   * @returns {number[]}
   */
  _relationVocabRoots() {
    const own = Number(this.row.dty) > 0 ? this.dbdefs.vocabRoot?.(this.row.dty) : 0;
    if (own) return [own];
    const scope = Number(this.scopeRtyId) > 0 ? [Number(this.scopeRtyId)]
      : (this.dbdefs.rectypes?.() || []).map((rt) => rt.id);
    const target = Number(this.row.targetRty) > 0 ? Number(this.row.targetRty) : null;
    const roots = new Set();
    for (const rty of scope) {
      for (const field of this.dbdefs.fields(rty) || []) {
        if (field.type !== 'relmarker') continue;
        const targets = this.dbdefs.fieldGlobal(field.id)?.targetTypes || [];
        if (target && targets.length && !targets.map(Number).includes(target)) continue;
        const root = this.dbdefs.vocabRoot?.(field.id);
        if (root) roots.add(root);
      }
    }
    return [...roots];
  }

  /**
   * Add a new sub-criteria field row inside this link panel.
   *
   * @private
   * @param {import('../../utils/queryModel.js').FieldRow|null} [rowModel] Initial row model; blank when omitted.
   * @returns {HFilterBuilderItem} The created item widget.
   */
  _addItem(rowModel = null) {
    const host = el('div', 'h-fb-subrow');
    const conj = el('span', 'h-fb-rowconj');
    const itemHost = el('div', 'h-fb-itemhost');
    host.append(conj, itemHost);
    const item = new HFilterBuilderItem({
      dbdefs: this.dbdefs,
      vocabulary: this.vocab,
      lang: this.builder.lang,
      scopeRtyId: this.row.targetRty,
      selectExtent: this.builder.selectExtent,
      relationVocabRoots: () => this._relationVocabRoots(),
      onRequestFieldPick: (it, anchor) => this._pickField(it, anchor),
      onChange: (evt) => {
        if (evt?.removed) {
          const i = this.items.indexOf(item);
          if (i >= 0) this.items.splice(i, 1);
          host.remove();
          this._refreshSubConjunctions();
        }
        this._emit();
      }
    });
    item.attach(itemHost).render();
    if (rowModel) item.setRowModel(rowModel);
    this._subHost.append(host);
    this.items.push(item);
    this._refreshSubConjunctions();
    return item;
  }

  /** Replace a field item with a linked block selected from the field tree. */
  _pickField(item, anchor) {
    const excludedFields = this.items.filter((entry) => entry instanceof HFilterBuilderItem && entry !== item)
      .map((entry) => entry.row)
      .filter((row) => row.selected || row.dty !== 'anyfield')
      .map(fieldIdentity);
    this.builder.tree.open(anchor, {
      rtyId: this.row.targetRty,
      linkedContext: true,
      relationContext: this._isRelation(),
      builderMode: true,
      hideUnusedRectypes: this.builder._hideUnused,
      excludedLinks: selectedLinkBranches(this.items),
      excludedFields,
      maxDepth: Math.max(0, 3 - this.depth)
    }, async (path) => {
      if (!path?.length) return;
      if (path.length === 1) {
        if (this.items.some((entry) => entry instanceof HFilterBuilderItem && entry !== item
          && fieldIdentity(entry.row) === fieldIdentity(path[0])
          && (entry.row.selected || entry.row.dty !== 'anyfield'))) return;
        item.setField(path[0]);
        this._emit();
        return;
      }

      const index = this.items.indexOf(item);
      if (index < 0) return;
      const host = item.container;
      await item.destroy();
      host.classList.add('h-fb-nested');
      const panel = this._makeNestedPanel(host, rowForPath(path, this.vocab));
      this.items[index] = panel;
      this._emit();
    });
  }

  /** Create a child linked block within this linked record type. */
  _makeNestedPanel(host, rowModel) {
    const panel = new LinkPanel({
      builder: this.builder,
      depth: this.depth + 1,
      scopeRtyId: this.row.targetRty,
      onChange: (event) => {
        if (event?.removed) {
          const index = this.items.indexOf(panel);
          if (index >= 0) this.items.splice(index, 1);
          (host.parentElement?.classList.contains('h-fb-subrow') ? host.parentElement : host).remove();
          this._refreshSubConjunctions();
        }
        this._emit();
      }
    });
    panel.attach(host).render().setRowModel(rowModel);
    return panel;
  }

  /** Update this link's source record type. */
  setScope(rtyId) {
    this.scopeRtyId = rtyId;
    if (this._targetSel) {
      this._populateTargets();
      this._populatePointers();
      this._syncHead();
    }
  }

  /** Align linked-row conjunctions with the top-level criterion grid. */
  _refreshSubConjunctions() {
    if (!this._subHost || !this._subConj) return;
    const rows = [...this._subHost.children];
    this._subConj.hidden = rows.length < 2;
    if (rows.length < 2) this._subFoot?.append(this._subConj);
    rows.forEach((row, index) => {
      const conj = row.querySelector(':scope > .h-fb-rowconj');
      if (!conj) return;
      conj.replaceChildren();
      if (index === 1) conj.append(this._subConj);
      else if (index > 1) {
        const label = el('span', 'h-fb-conjlabel');
        label.textContent = this.row.conjunction === 'any' ? 'OR' : 'AND';
        conj.append(label);
      }
    });
  }

  /**
   * Read the panel's current `LinkRow` model.
   *
   * @returns {import('../../utils/queryModel.js').LinkRow}
   */
  getRowModel() {
    return {
      type: 'link',
      link: this.row.link,
      dty: this.row.dty,
      targetRty: this.row.targetRty,
      conjunction: this.row.conjunction,
      rows: this.items.map((it) => it.getRowModel())
    };
  }

  /**
   * Replace the panel's link row model, rebuilding its selects and sub-criteria.
   *
   * @param {import('../../utils/queryModel.js').LinkRow} row New link row model.
   * @returns {LinkPanel} This instance, for chaining.
   */
  setRowModel(row) {
    this.row = {
      type: 'link',
      link: ['lf', 'related', 'rt', 'rf'].includes(row.link) ? row.link : 'lt',
      dty: row.dty ?? '',
      targetRty: row.targetRty ?? '',
      conjunction: row.conjunction === 'any' ? 'any' : 'all',
      rows: []
    };
    if (this._linkSel) {
      this._linkSel.value = this.row.link;
      this._populateTargets();
      this._targetSel.value = this.row.targetRty === '' ? '' : String(this.row.targetRty);
      this._populatePointers();
      this._syncHead();
      this._subConj.value = this.row.conjunction;
      for (const it of this.items) it.destroy?.();
      this.items = [];
      this._subHost.replaceChildren();
      for (const sub of row.rows || []) {
        if (sub.type === 'link') {
          const host = el('div', 'h-fb-subrow h-fb-nested');
          const conj = el('span', 'h-fb-rowconj');
          const panelHost = el('div', 'h-fb-itemhost');
          host.append(conj, panelHost);
          this._subHost.append(host);
          this.items.push(this._makeNestedPanel(panelHost, sub));
        } else {
          this._addItem(sub);
        }
      }
      if (!this.items.length) this._addItem();
      this._refreshSubConjunctions();
    }
    return this;
  }

  /**
   * Notify the owning builder of the panel's current row model.
   *
   * @private
   * @returns {void}
   */
  _emit() { this._onChange({ row: this.getRowModel() }); }

  /**
   * Destroy every sub-criteria item and clear the panel's DOM.
   *
   * @returns {void}
   */
  destroy() {
    for (const it of this.items) it.destroy?.();
    this.items = [];
    this.container?.replaceChildren();
  }
}

/* --------------------------------------------------------------------- utils --- */

/** Create an element, optionally with a class name. */
function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

/** Build a labeled button with an optional click handler. */
function btn(text, className, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.textContent = text;
  if (onClick) b.addEventListener('click', onClick);
  return b;
}

/** Wrap a control in a `<label>` with a leading text span. */
/** Checkbox toggling whether record types without records are offered. */
export function hideUnusedToggle(checked, onChange) {
  const wrap = el('label', 'h-fb-hide-unused');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.className = 'h-checkbox';
  input.checked = Boolean(checked);
  input.addEventListener('change', () => onChange(input.checked));
  wrap.title = $HR('Record types without records are not offered in selectors and field lists');
  wrap.append(input, document.createTextNode(` ${$HR('Hide record types without records')}`));
  return wrap;
}

function labelled(text, control) {
  const wrap = el('label', 'h-fb-labelled');
  const span = document.createElement('span');
  span.textContent = text;
  wrap.append(span, control);
  return wrap;
}

/**
 * Identity of a field row / tree pick for duplicate checks: a Relationship-record
 * field (`rel`) is distinct from an endpoint field with the same id.
 */
function fieldIdentity(row) {
  return row?.rel && /^\d+$/.test(String(row.dty)) ? `rel:${row.dty}` : String(row?.dty);
}

/** Coerce a rectype select value to a number, or `''` when empty/absent. */
function coerceRty(value) {
  return value === '' || value == null ? '' : Number(value);
}

/** Turn a field-tree path into nested linked rows ending in one field row. */
export function rowForPath(path, vocabulary) {
  const field = path[path.length - 1];
  let row = emptyFieldRow({
    dty: field.dty,
    selected: true,
    kind: field.dty === 'exists' ? 'exists'
      : kindFor(vocabulary, field.fieldType || 'freetext'),
    op: field.dty === 'exists' ? 'op.exists' : field.dty === 'reltype' ? 'op.is' : null
  });
  if (field.rel) row.rel = true;   // condition on the Relationship record of a related branch
  for (let index = path.length - 2; index >= 0; index--) {
    const via = path[index].via;
    row = {
      type: 'link',
      link: via.link,
      dty: via.dty,
      targetRty: via.targetRty || '',
      conjunction: 'all',
      rows: [row]
    };
  }
  return row;
}

/** Create the common translated and JSON query preview used by both dialogs. */
function makeQueryPreview() {
  const element = el('div', 'h-fb-preview');
  const sentence = el('div', 'h-fb-sentence');
  sentence.hidden = true;
  const label = el('div', 'h-fb-preview-label');
  label.textContent = $HR('Query');
  const json = document.createElement('pre');
  json.className = 'h-fb-preview-json';
  element.append(sentence, label, json);
  return { element, sentence, json };
}

/** Refresh a query preview without opening a second dialog. */
function updateQueryPreview(preview, query, dbdefs, vocabulary, lang, extent = null) {
  const sentence = query.length ? queryDescribe(query, { dbdefs, vocabulary, lang }) : '';
  const extentText = extent ? `${$HR('Map extent')}: ${describeGeoValue(extent)}` : '';
  preview.sentence.textContent = [sentence, extentText].filter(Boolean).join('. ');
  preview.sentence.hidden = !sentence && !extentText;
  preview.json.textContent = query.length || extent
    ? JSON.stringify(extent ? { q: query, extent } : query, null, 1) : $HR('(empty)');
}

/** Count chosen field criteria at every linked depth. */
function countCriteria(rows) {
  return (rows || []).reduce((count, row) => count + (row.type === 'link'
    ? countCriteria(row.rows)
    : row.selected || row.dty !== 'anyfield' ? 1 : 0), 0);
}

/** Count criteria whose values will be supplied by the runtime form. */
function countBlankCriteria(rows, vocabulary) {
  return (rows || []).reduce((count, row) => count + (row.type === 'link'
    ? countBlankCriteria(row.rows, vocabulary)
    : isImplicitParameter(row, vocabulary) ? 1 : 0), 0);
}

/** True when a selected field has no literal and needs a runtime form value. */
function isImplicitParameter(row, vocabulary) {
  if (!row || row.type === 'link') return false;
  if (row.dty === '' || row.dty == null || (row.dty === 'anyfield' && !row.selected)) return false;
  if (!['text', 'number', 'date', 'enum', 'geo'].includes(row.kind)) return false;
  if (operatorByKey(vocabulary, row.kind, row.op)?.whole) return false;
  const values = row.values || [];
  const required = operatorByKey(vocabulary, row.kind, row.op)?.input === 'range' ? 2 : 1;
  return Array.from({ length: required }, (_, index) => values[index])
    .some((value) => String(value ?? '').trim() === '');
}

/** Detect explicit and implicit parameter rows at every linked depth. */
function hasParameterRows(rows, vocabulary) {
  return (rows || []).some((row) => row.type === 'link'
    ? hasParameterRows(row.rows, vocabulary)
    : isImplicitParameter(row, vocabulary));
}

/** Return immediate linked branches already represented at one builder level. */
function selectedLinkBranches(entries) {
  return (entries || []).map((entry) => {
    const row = entry?.kind === 'link' ? entry.panel?.getRowModel?.()
      : entry instanceof LinkPanel ? entry.getRowModel() : null;
    return row?.dty == null || row.dty === '' ? null : String(row.dty);
  }).filter(Boolean);
}
