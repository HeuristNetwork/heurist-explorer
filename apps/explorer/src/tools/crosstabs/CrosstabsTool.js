/**
 * @file CrosstabsTool.js
 * @brief Crosstabs tool of Explorer (a pane module, plan 27q2 §8): the viewer and the editor of crosstabs.
 *
 * A crosstab is a Presentation set (2-1112) of kind Crosstab: its name, the query used on a website (2-12) and the
 * settings (Configuration 2-1187, crosstabModel.js). The toolbar is the one of the Story map tool: New | selector |
 * editor (the form) | Record editor | Save | Delete | Records (result or selection) | Help. The form (HEditForm,
 * crosstabsForm.js) is applied at once to the crosstab (HCrosstab) of the current result of Explorer (or of the
 * selection). Opened by the CMS designer with `?tool=crosstabs&preset=<id>` (ExplorerApplication.openCrosstabs).
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
import { askChoice, askSaveDiscard } from '#shared/ui/askChoice.js';
import { HEditForm } from '#shared/widgets/edit-form/HEditForm.js';
import { showPopover, closePopover } from '#shared/widgets/popover/popover.js';
import { HFieldTree } from '#shared/widgets/field-tree/HFieldTree.js';
import { HRangeList } from '#shared/widgets/symbology/HRangeList.js';
import { openRangeGenerator } from '#shared/widgets/symbology/HRangeGenerator.js';
import { HCrosstab } from '#shared/widgets/crosstabs/HCrosstab.js';
import { CrosstabService } from '#shared/widgets/crosstabs/crosstabService.js';
import { normalizeCrosstabSettings } from '#shared/widgets/crosstabs/crosstabModel.js';
import { fieldCodeLabel, fieldPathCode } from '#shared/data/fieldPathCodes.js';
import { isIntervalType } from '#shared/data/ranges/rangeDefinitions.js';
import { fieldCodeDty, fieldCodeType } from '#shared/symbology/thematicFields.js';
import { crosstabsForm, formValues, valuesSettings } from './crosstabsForm.js';
import './CrosstabsTool.css';

/** Field types of the dimensions (the field tree). */
const DIMENSION_TYPES = Object.freeze(['enum', 'relationtype', 'integer', 'float', 'year', 'date', 'freetext', 'boolean', 'resource', 'relmarker']);

/** Delay of the instant apply after a change of the form (ms). */
const APPLY_DELAY = 400;

/** Crosstabs tool widget. */
export class CrosstabsTool extends HBaseWidget {
  /**
   * @param {object} options Tool options.
   * @param {object} options.apiClient API client of Explorer (writes).
   * @param {function(): Promise<object>} options.getDbDefs Database definitions (HDbDefs).
   * @param {function(): object|null} options.getDataSource Current DataSource.
   * @param {function(): number[]} options.getSelection Selected record ids.
   * @param {function(number): Promise<{saved: boolean}>} [options.editRecord] Explorer's record editor.
   * @param {function(object): Object<number, object>} [options.specialEditors] Special editors of the record editor (the query).
   * @param {function(): Promise<object>} [options.formServices] Services of the form (RecordEditorHost.formServices).
   * @param {function(string): void} [options.openManual] Explorer manual at a section (Help: `crosstabs`).
   * @param {object} options.runtime `{apiBaseUrl, database, requestHeaders, accessToken, language}`.
   */
  constructor(options) {
    super();
    this.tool = options;
    this.language = options.runtime?.language || 'eng';
    const headers = { ...(options.runtime?.requestHeaders || {}) };
    if (options.runtime?.accessToken) headers.Authorization = `Bearer ${options.runtime.accessToken}`;
    this.service = new CrosstabService({ apiBaseUrl: options.runtime?.apiBaseUrl, database: options.runtime?.database, headers });
    this.preset = null;
    this.presets = [];
    this.values = this._valuesOf(null);
    this.scope = 'result';
    this._dirty = false;
  }

  /**
   * Toolbar, form (closed) and the crosstab.
   *
   * @returns {Promise<CrosstabsTool>}
   */
  async render() {
    this.dbdefs = await this.tool.getDbDefs().catch(() => null);
    this.container.classList.add('h-crosstabs-tool');
    this.toolbar = element('div', 'h-toolbar h-crosstabs-tool-toolbar');
    this.toolbar.setAttribute('role', 'toolbar');
    this.main = element('div', 'h-crosstabs-tool-main');
    this.formPane = element('div', 'h-crosstabs-tool-form');
    this.formHost = element('div', 'h-crosstabs-tool-form-body');
    this.formPane.append(this.formHost);
    this.formPane.hidden = true;
    this.view = element('div', 'h-crosstabs-tool-view');
    this.main.append(this.formPane, this.view);
    this.container.replaceChildren(this.toolbar, this.main);
    await this._loadPresets();
    this._renderToolbar();
    this.crosstab = new HCrosstab().attach(this.view, {
      service: this.service,
      settings: this.values.settings,
      level: 'display',
      language: this.language,
      database: this.tool.runtime?.database || '',
      labels: this._labels(),
      fieldLabel: (code) => this._fieldLabel(code),
      emptyText: 'Search for records: the crosstab counts the current result'
    }).render();
    await this._applyRecords();
    this.state = 'rendered';
    return this;
  }

  /**
   * Open a crosstab.
   *
   * @param {number} id Presentation set id.
   * @returns {Promise<boolean>} False when it was not found.
   */
  async openPreset(id) {
    const preset = await this.service.loadPreset(id).catch(() => null);
    if (!preset) {
      HMsg.showMsgErr?.($HR('The crosstab was not found'));
      return false;
    }
    this.preset = preset;
    this.values = this._valuesOf(preset);
    this._dirty = false;
    if (!this.presets.some((item) => item.id === preset.id)) this.presets.push({ id: preset.id, title: preset.title });
    this._renderToolbar();
    if (!this.formPane.hidden) await this._renderForm({ read: false });
    await this.crosstab?.setSettings(this.values.settings);
    return true;
  }

  /**
   * A new crosstab with the form open (the CMS designer: Edit in new window without a crosstab).
   *
   * @returns {Promise<void>}
   */
  newCrosstab() {
    return this._new({ ask: false });
  }

  /** Explorer's result changed. */
  async setDataSource(source) {
    this.source = source;
    if (this.scope === 'result') await this._applyRecords();
  }

  /** Explorer's selection changed. */
  async setSelection(ids) {
    this.selection = [...(ids || [])];
    if (this.scope === 'selection') await this._applyRecords();
  }

  /** @returns {boolean} Changes of the form that are not saved. */
  hasUnsavedChanges() {
    return this._dirty === true;
  }

  /** @returns {Promise<void>} */
  async destroy() {
    clearTimeout(this._applyTimer);
    await this.form?.destroy();
    await this.crosstab?.destroy();
    this.crosstab = null;
    await super.destroy();
  }

  // ------------------------------------------------------------------ data

  /** @private Field, type and term ids of the database. */
  _ids() {
    const id = (code) => Number(this.dbdefs?.dbconst?.(code)) || 0;
    return {
      rectype: id('RT_PRESENTATION_SET'), name: id('DT_NAME'), query: id('DT_QUERY_STRING'),
      configuration: id('DT_CONFIGURATION'), type: id('DT_PRESENTATION_TYPE'), crosstabs: id('TRM_PRESENTATION_CROSSTABS')
    };
  }

  /** @private The crosstabs of the database (Presentation sets of kind Crosstab). */
  async _loadPresets() {
    const ids = this._ids();
    if (!ids.rectype) {
      this.presets = [];
      return;
    }
    const answer = await this.tool.apiClient.get('/records', {
      query: { q: JSON.stringify([{ t: String(ids.rectype) }]), fields: `rec_ID,rec_Title,${ids.type}`, limit: 1000 }
    }).catch(() => null);
    this.presets = ((answer?.data ?? answer)?.records || [])
      .filter((record) => Number([record.details?.[ids.type]].flat()[0]) === ids.crosstabs)
      .map((record) => ({ id: Number(record.rec_ID), title: String(record.rec_Title || `#${record.rec_ID}`) }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }

  /** @private Name, query text and settings of a preset (or a new crosstab). */
  _valuesOf(preset) {
    return {
      title: preset?.title || '',
      query: preset?.query == null ? '' : (typeof preset.query === 'string' ? preset.query : JSON.stringify(preset.query)),
      settings: normalizeCrosstabSettings(preset?.configuration || null)
    };
  }

  /** @private The query counted now: the result of Explorer, or the selection. */
  _query() {
    if (this.scope === 'selection') {
      const ids = this.selection ?? this.tool.getSelection?.() ?? [];
      return ids.length ? [{ ids: ids.join(',') }] : null;
    }
    const source = this.source ?? this.tool.getDataSource?.();
    return source?.request?.q ?? null;
  }

  /** @private The crosstab of the records of the scope. */
  async _applyRecords() {
    await this.crosstab?.setQuery(this._query());
  }

  /** @private Labels of the buckets (terms, record types, users). */
  _labels() {
    const dbdefs = this.dbdefs;
    return {
      termLabel: (id) => dbdefs?.termLabel?.(id) || '',
      rectypeName: (id) => dbdefs?.rectypeName?.(id) || '',
      userGroupName: (id) => dbdefs?.userGroupName?.(id) || ''
    };
  }

  /** @private Caption of a field path code (or a field id). */
  _fieldLabel(code) {
    const text = String(code ?? '');
    if (/^\d+$/.test(text)) return this.dbdefs?.fieldGlobal?.(Number(text))?.name || text;
    return fieldCodeLabel(text, this.dbdefs) || text;
  }

  // ------------------------------------------------------------------ save, delete

  /** @private Save the crosstab (a new one gets a name first). @returns {Promise<boolean>} Saved. */
  async _save() {
    const ids = this._ids();
    if (!ids.rectype || !ids.configuration || !ids.type || !ids.crosstabs) {
      HMsg.showMsgErr?.($HR('This database has no record type Presentation set (2-1112)'));
      return false;
    }
    if (!(await this._checkForm())) return false;
    const details = {
      [ids.name]: [this.values.title.trim()],
      [ids.type]: [ids.crosstabs],
      [ids.configuration]: [JSON.stringify(this.values.settings)],
      [ids.query]: this.values.query.trim() ? [this.values.query.trim()] : []
    };
    try {
      const id = this.preset?.id || 0;
      const answer = id
        ? await this.tool.apiClient.request(`/presentation/${id}`, { method: 'PATCH', body: { details } })
        : await this.tool.apiClient.post('/presentation/0', { body: { rec_RecTypeID: ids.rectype, details } });
      const saved = Number((answer?.data ?? answer)?.records?.[0]?.rec_ID ?? (answer?.data ?? answer)?.recordId ?? id) || 0;
      this._dirty = false;
      await this._loadPresets();
      if (saved) await this.openPreset(saved);
      HMsg.showMsgFlash?.($HR('Saved'), { showDelay: 1500 });
      return true;
    } catch (error) {
      HMsg.showMsgErr?.(errorText(error));
      return false;
    }
  }

  /** @private The check of the form before Save (a closed form is opened for it). */
  async _checkForm() {
    if (this.formPane.hidden) await this._toggleForm();
    if (!this.form) return false;
    const problems = this.form.validate();
    this._readForm();
    if (!problems.length) return true;
    HMsg.showMsgFlash?.($HR('Fill in the required fields of the configuration'), { showDelay: 2500 });
    return false;
  }

  /** @private Unsaved changes: Save | Discard | Cancel. @returns {Promise<boolean>} The caller may go on. */
  async _confirmLeave() {
    if (!this._dirty) return true;
    const answer = await askSaveDiscard('The crosstab has been changed. Save changes?');
    if (answer === 'save') return this._save();
    return answer === 'discard';
  }

  /** @private Delete the crosstab (refused while website pages use it). */
  async _delete() {
    const id = this.preset?.id;
    if (!id) return;
    const answer = await askChoice(`${$HR('Delete the crosstab')} "${this.preset.title}"?`, $HR('Delete'), [['delete', $HR('Delete')]]);
    if (answer !== 'delete') return;
    try {
      await this.tool.apiClient.request(`/presentation/${id}`, { method: 'DELETE' });
    } catch (error) {
      HMsg.showMsgErr?.(errorText(error));
      return;
    }
    this.presets = this.presets.filter((item) => item.id !== id);
    this._dirty = false;
    await this._new({ ask: false, open: false });
    HMsg.showMsgFlash?.($HR('Deleted'), { showDelay: 1500 });
  }

  /** @private The Presentation set in the record editor (name, owner, visibility). */
  async _editRecord() {
    const id = this.preset?.id;
    if (!id || !this.tool.editRecord || !(await this._confirmLeave())) return;
    const result = await this.tool.editRecord(id);
    if (result?.saved === false) return;
    await this._loadPresets();
    await this.openPreset(id);
  }

  // ------------------------------------------------------------------ toolbar

  /** @private Toolbar as in the Story map tool. */
  _renderToolbar() {
    const bar = this.toolbar;
    bar.replaceChildren();
    tool(bar, 'fa-plus', 'New crosstab', 'New crosstab', () => void this._new());
    separator(bar);
    const select = element('button', 'h-btn h-crosstabs-tool-select');
    select.type = 'button';
    select.title = $HR('Crosstab');
    select.setAttribute('aria-haspopup', 'listbox');
    const icon = element('i', 'fa-solid fa-table-cells');
    icon.setAttribute('aria-hidden', 'true');
    const label = element('span', 'h-crosstabs-tool-select-label');
    label.textContent = this.preset?.title || (this.preset ? '' : $HR('Select crosstab'));
    select.append(icon, label, element('span', 'h-caret'));
    select.addEventListener('click', () => this._toggleList(select));
    select.disabled = !this.presets.length;
    bar.append(select);
    const active = Boolean(this.preset) || this.editing === true;
    this.editorButton = tool(bar, 'fa-pen-ruler', 'Crosstab editor', 'Show or hide the configuration of the crosstab', () => void this._toggleForm());
    this.editorButton.classList.toggle('is-active', !this.formPane.hidden);
    this.editorButton.disabled = !active;
    const record = tool(bar, 'fa-pen', 'Record editor', 'Name, owner and visibility of the crosstab', () => void this._editRecord(), false);
    record.disabled = !this.preset?.id || !this.tool.editRecord;
    const save = tool(bar, 'fa-floppy-disk', 'Save', 'Save the crosstab', () => void this._save(), false);
    save.disabled = !active;
    const remove = tool(bar, 'fa-trash-can', 'Delete', 'Delete the crosstab', () => void this._delete(), false);
    remove.disabled = !this.preset?.id;
    separator(bar);
    // the records counted: the result of Explorer or the selection
    const scope = element('select', 'h-select h-compact h-crosstabs-tool-scope');
    scope.title = $HR('Records counted');
    for (const [value, text] of [['result', 'Current result'], ['selection', 'Selected records']]) {
      const option = element('option');
      option.value = value;
      option.textContent = $HR(text);
      scope.append(option);
    }
    scope.value = this.scope;
    scope.addEventListener('change', () => {
      this.scope = scope.value;
      void this._applyRecords();
    });
    bar.append(scope);
    const help = tool(bar, 'fa-circle-question', 'Help', 'Help of the crosstabs', () => this.tool.openManual?.('crosstabs'), false);
    help.classList.add('h-crosstabs-tool-help');
    help.hidden = !this.tool.openManual;
  }

  /** @private The list of crosstabs in a popover under the selector. */
  _toggleList(anchor) {
    if (anchor.getAttribute('aria-expanded') === 'true') {
      closePopover();
      return;
    }
    const list = element('div', 'h-crosstabs-tool-list');
    list.setAttribute('role', 'listbox');
    for (const item of this.presets) {
      const row = element('button', 'h-crosstabs-tool-list-item');
      row.type = 'button';
      row.textContent = item.title;
      row.classList.toggle('is-active', item.id === this.preset?.id);
      row.addEventListener('click', async () => {
        closePopover();
        if (item.id !== this.preset?.id && (await this._confirmLeave())) await this.openPreset(item.id);
      });
      list.append(row);
    }
    showPopover(anchor, list, { className: 'h-crosstabs-tool-popover' });
  }

  /** @private A new crosstab: the form opens. */
  async _new({ ask = true, open = true } = {}) {
    if (ask && !(await this._confirmLeave())) return;
    this.preset = null;
    this.editing = open;
    this.values = this._valuesOf(null);
    // the record type of the result: its fields are offered
    this.values.settings.fields.rectype = this._resultRectype();
    this._dirty = false;
    clearTimeout(this._applyTimer);
    await this.form?.destroy();
    this.form = null;
    this.formHost.replaceChildren();
    this.formPane.hidden = true;
    this._renderToolbar();
    if (open) await this._toggleForm();
    await this.crosstab?.setSettings(this.values.settings);
  }

  /** @private The first record type of the result query (`t`), else null. */
  _resultRectype() {
    const query = this._query();
    const parts = Array.isArray(query) ? query : [query];
    for (const part of parts) {
      const type = part && typeof part === 'object' ? Number(String(part.t ?? '').split(',')[0]) : 0;
      if (type > 0) return type;
    }
    return null;
  }

  /** @private Show / hide the form. */
  async _toggleForm() {
    if (this.formPane.hidden && !this.preset && !this.editing) return;
    if (this.formPane.hidden) {
      this.formPane.hidden = false;
      await this._renderForm();
    } else {
      this._readForm();
      this.formPane.hidden = true;
    }
    this.editorButton?.classList.toggle('is-active', !this.formPane.hidden);
  }

  // ------------------------------------------------------------------ form

  /** @private The form (HEditForm) with the values of the crosstab. */
  async _renderForm({ read = true } = {}) {
    if (read) this._readForm();
    await this.form?.destroy();
    this.form = null;
    const ids = this._ids();
    const services = (await this.tool.formServices?.().catch(() => null)) || { apiClient: this.tool.apiClient, dbdefs: this.dbdefs };
    this.form = new HEditForm().attach(this.formHost, {
      ...services,
      form: crosstabsForm({ ids, rectypes: this._rectypes(), numericFields: this._numericFields(this.values.settings.fields.rectype) }),
      values: formValues(this.values, ids),
      keepHidden: true,
      labelPos: 'above',
      specialEditors: this._specialEditors(ids),
      onChange: (form, change) => this._changed(change.name)
    });
    this.form.render();
  }

  /** @private The values of the form into `this.values`. */
  _readForm() {
    if (!this.form || this.formPane?.hidden) return;
    this.values = valuesSettings(this.form.getValues(), this._ids());
  }

  /** @private A value changed: the crosstab at once (after a short delay). */
  _changed(name) {
    if (name == null) return;
    this._dirty = true;
    if (name === 'fieldsOf') void this._rectypeChanged();
    clearTimeout(this._applyTimer);
    this._applyTimer = setTimeout(() => {
      this._readForm();
      void this.crosstab?.setSettings(this.values.settings);
    }, APPLY_DELAY);
  }

  /** @private Another record type of the fields: the numeric fields of the measure. */
  async _rectypeChanged() {
    await new Promise((resolve) => setTimeout(resolve, 0));
    const rectype = Number([this.form?.getValue('fieldsOf')].flat()[0]) || 0;
    const fields = this._numericFields(rectype);
    await this.form?.updateField('measureField', { terms: fields.map((item) => ({ id: String(item.id), label: item.label })) });
  }

  /** @private Record types of *Fields of*. */
  _rectypes() {
    return (this.dbdefs?.rectypes?.() || []).map((type) => ({ id: type.id, label: type.name }));
  }

  /** @private Numeric fields of a record type (the measure). */
  _numericFields(rectype) {
    if (!rectype) return [];
    return (this.dbdefs?.fields?.(rectype) || []).filter((field) => ['integer', 'float', 'year'].includes(field.type))
      .map((field) => ({ id: Number(field.id), label: field.name }));
  }

  /** @private Special editors: the query of the record editor, a field path, a list of fields, the ranges. */
  _specialEditors(ids) {
    const record = this.tool.specialEditors?.(this.dbdefs) || {};
    const parse = (value) => {
      try {
        return value ? JSON.parse(value) : null;
      } catch {
        return null;
      }
    };
    return {
      query: record[ids.query] || null,
      fieldCode: {
        icon: 'fa-list-check',
        title: 'Choose the field',
        describe: (value) => (value ? this._fieldLabel(value) : ''),
        edit: () => this._pickField()
      },
      fieldCodes: {
        json: true,
        icon: 'fa-plus',
        title: 'Add a field',
        describe: (value) => (parse(value) || []).map((code) => this._fieldLabel(code)).join(', '),
        edit: async (value) => {
          const code = await this._pickField();
          if (code === undefined) return undefined;
          return JSON.stringify([...new Set([...(parse(value) || []), code])]);
        }
      },
      ranges: {
        json: true,
        icon: 'fa-sliders',
        title: 'Edit the ranges',
        describe: (value) => {
          const ranges = parse(value) || [];
          return ranges.length ? `${ranges.length} ${$HR('ranges')}` : '';
        },
        edit: (value, context) => {
          const name = String(context?.field?.name || '').replace(/Ranges$/, '');
          const code = String([context?.getValue?.(`${name}Code`)].flat()[0] || '');
          return this._editRanges(parse(value) || [], code);
        }
      }
    };
  }

  /** @private A field of *Fields of* or of linked records (the field tree of the thematic maps). */
  async _pickField() {
    this._readForm();
    const rectype = this.values.settings.fields.rectype;
    if (!rectype) {
      HMsg.showMsgFlash?.($HR('Choose the record type of the fields first'), { showDelay: 2000 });
      return undefined;
    }
    const host = element('div', 'h-crosstabs-tool-tree');
    const tree = new HFieldTree({ dbdefs: this.dbdefs });
    return new Promise((resolve) => {
      const dialogId = 'h-crosstabs-field-dialog';
      let done = false;
      const finish = (value) => {
        if (done) return;
        done = true;
        tree.destroy?.();
        HMsg.closeMsgDlg(dialogId);
        resolve(value);
      };
      tree.mount(host, {
        rtyId: rectype, selectableTypes: DIMENSION_TYPES, hideUnselectable: true, includeHeaders: false, showSort: false, maxDepth: 2
      }, (path) => {
        const code = fieldPathCode(path, rectype);
        if (code) finish(code);
      });
      HMsg.showMsgDlg(host, {
        dialogId,
        title: $HR('Choose the field'),
        buttons: [{ label: $HR('Cancel'), class: 'h-btn', onClick: () => finish(undefined) }],
        onClose: () => finish(undefined)
      });
    });
  }

  /** @private The ranges of a field: HRangeList with a label column, Add, Generate ranges (HRangeGenerator), Remove all. */
  async _editRanges(stored, code) {
    if (!code) {
      HMsg.showMsgFlash?.($HR('Choose the field first'), { showDelay: 2000 });
      return undefined;
    }
    const ranges = stored.map((range) => (typeof range === 'string' ? { value: range, label: '' } : { value: range.value, label: range.label || '' }));
    const enumField = !isIntervalType(fieldCodeType(code, this.dbdefs));
    const vocabulary = enumField ? this.dbdefs?.vocabRoot?.(fieldCodeDty(code)) : 0;
    const host = element('div', 'h-crosstabs-tool-ranges');
    const listHost = element('div');
    const extras = (row, range) => {
      const label = element('input', 'h-input h-crosstabs-tool-range-label');
      label.type = 'text';
      label.placeholder = $HR('Label');
      label.value = range.label || '';
      label.addEventListener('input', () => { range.label = label.value; });
      return [label];
    };
    const list = new HRangeList().attach(listHost, { ranges, enumField, vocabulary, dbdefs: this.dbdefs, extras }).render();
    const bar = element('div', 'h-crosstabs-tool-ranges-bar');
    const action = (text, run) => {
      const button = element('button', 'h-btn h-compact');
      button.type = 'button';
      button.textContent = $HR(text);
      button.addEventListener('click', run);
      bar.append(button);
    };
    action('Add range', () => {
      ranges.push({ value: '', label: '' });
      list.render();
    });
    action('Generate ranges...', async () => {
      const generated = await openRangeGenerator({ code, api: this.tool.apiClient, dbdefs: this.dbdefs, query: this._query() || [] });
      if (!generated) return;
      ranges.splice(0, ranges.length, ...generated.map((range) => ({ value: range.value, label: '' })));
      list.render();
    });
    action('Remove all ranges', () => {
      ranges.splice(0, ranges.length);
      list.render();
    });
    host.append(bar, listHost);
    const result = await new Promise((resolve) => {
      const dialogId = 'h-crosstabs-ranges-dialog';
      HMsg.showMsgDlg(host, {
        dialogId,
        title: `${$HR('Ranges')}: ${this._fieldLabel(code)}`,
        buttons: [
          { label: $HR('Apply'), class: 'h-btn h-btn-primary', onClick: () => { HMsg.closeMsgDlg(dialogId); resolve(true); } },
          { label: $HR('Cancel'), class: 'h-btn', onClick: () => { HMsg.closeMsgDlg(dialogId); resolve(false); } }
        ],
        onClose: () => resolve(false)
      });
    });
    await list.destroy();
    if (!result) return undefined;
    const kept = ranges.filter((range) => String(range.value || '').trim())
      .map((range) => (range.label?.trim() ? { value: range.value.trim(), label: range.label.trim() } : range.value.trim()));
    return kept.length ? JSON.stringify(kept) : '';
  }
}

function element(tag, className = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

/** A toolbar button: icon and label (hidden in a narrow pane); `caption: false`: the icon only. */
function tool(parent, icon, label, title, onClick, caption = true) {
  const node = element('button', 'h-btn h-crosstabs-tool-btn');
  node.type = 'button';
  node.title = $HR(title);
  node.setAttribute('aria-label', $HR(label));
  const glyph = element('i', `fa-solid ${icon}`);
  glyph.setAttribute('aria-hidden', 'true');
  node.append(glyph);
  if (caption) {
    const text = element('span', 'h-crosstabs-tool-label');
    text.textContent = $HR(label);
    node.append(text);
  }
  node.addEventListener('click', onClick);
  parent.append(node);
  return node;
}

/** A separator of the toolbar. */
function separator(parent) {
  const node = element('span', 'h-crosstabs-tool-separator');
  node.setAttribute('aria-hidden', 'true');
  parent.append(node);
}

/** Text of an error of the API. */
function errorText(error) {
  const pages = error?.payload?.details?.pages ?? error?.payload?.pages;
  if (Number(pages) > 0) return `${$HR('The crosstab is used by website pages and can not be deleted')} (${pages})`;
  return error?.payload?.message || error?.message || String(error);
}
