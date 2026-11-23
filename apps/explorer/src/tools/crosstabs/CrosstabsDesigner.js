/**
 * @file CrosstabsDesigner.js
 * @brief The crosstab designer of Explorer (plan 27q2 §17, presentation-sources.md §5): full screen, the settings form
 *        beside a preview. Opened by Edit / New of the Crosstabs pane and by the CMS designer (`?tool=crosstabs&preset=`).
 *
 * A crosstab is a Presentation set (2-1112) of kind Crosstab: its name, its query (2-12, may have parameters; their
 * Filter Form is kept in the settings) and the settings (Configuration 2-1187, crosstabModel.js). Header "Crosstab editor:
 * <name>" with Close (as the Website manager, review 5); toolbar: New | selector | Record editor | Save | Save as | … |
 * Delete | Help. The preview counts its own test records (*Test on: Current result* — a snapshot of Explorer's result — or
 * *Own query*, with the Filter Form of its parameters); the main search does not change it. Only records of the record type
 * of the settings are counted.
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
import { askedParameters, CrosstabParams, ownCount } from '#shared/widgets/crosstabs/crosstabParams.js';
import { CrosstabService } from '#shared/widgets/crosstabs/crosstabService.js';
import { CROSSTAB_DIMENSIONS, crosstabCodePath, normalizeCrosstabSettings } from '#shared/widgets/crosstabs/crosstabModel.js';
import { fieldPathCode } from '#shared/data/fieldPathCodes.js';
import { isIntervalType } from '#shared/data/ranges/rangeDefinitions.js';
import { recordTypeQuery } from '#shared/data/presentationSource.js';
import { fieldCodeDty, fieldCodeType } from '#shared/symbology/thematicFields.js';
import { loadScopeRecordTypes } from '../toolScope.js';
import { bucketTermsFor, crosstabsForm, defaultBucketMode, formValues, valuesSettings } from './crosstabsForm.js';
import {
  crosstabErrorText, crosstabFieldLabel, crosstabIds, crosstabLabels, element, loadCrosstabPresets, presetSelector,
  toolButton, toolSeparator
} from './crosstabsPresets.js';
import './CrosstabsTool.css';

/** Field types of the dimensions (review 2026-11-22: no boolean; pointers give a row per linked record). */
const DIMENSION_TYPES = Object.freeze(['freetext', 'enum', 'relationtype', 'date', 'year', 'integer', 'float', 'resource', 'relmarker']);

/** Header fields of the field tree (`/records` codes) → the header fields of a crosstab code (CrossTabulator). */
const HEADER_CODES = Object.freeze({
  rec_title: 'title', rec_added: 'added', rec_modified: 'modified', rec_addedbyugrpid: 'addedby',
  rec_ownerugrpid: 'owner', rec_nonownervisibility: 'access'
});

/** Header fields of a crosstab and the type of their values (others: each value only). */
const HEADER_TYPES = Object.freeze({ added: 'date', modified: 'date' });

/** Delay of the instant apply after a change of the form (ms). */
const APPLY_DELAY = 400;

/** The crosstab designer. */
export class CrosstabsDesigner extends HBaseWidget {
  /**
   * @param {object} options Designer options.
   * @param {object} options.apiClient API client of Explorer (writes, traced requests).
   * @param {function(): Promise<object>} options.getDbDefs Database definitions (HDbDefs).
   * @param {function(): *} options.getCurrentQuery The query of Explorer's current result (null: none).
   * @param {function(): number[]} [options.getSelection] Selected record ids (the parameter `$SELECTED$`).
   * @param {function(number): Promise<{saved: boolean}>} [options.editRecord] Explorer's record editor.
   * @param {function(object, object): Object<number, object>} [options.specialEditors] Special editors of the record editor
   *        (the query and its filter form); the second argument gives `currentQuery`.
   * @param {function(): Promise<object>} [options.formServices] Services of the form (RecordEditorHost.formServices).
   * @param {function(string): void} [options.openManual] Explorer manual at a section (Help: `crosstabs`).
   * @param {Function} [options.selectExtent] Map extent picker of geo parameters of the Filter Form.
   * @param {function({presetId: number}): void} [options.onClose] The designer closed (unsaved changes asked first).
   * @param {object} options.runtime `{apiBaseUrl, database, requestHeaders, accessToken, language}`.
   */
  constructor(options) {
    super();
    this.tool = options;
    this.language = options.runtime?.language || 'eng';
    const headers = { ...(options.runtime?.requestHeaders || {}) };
    if (options.runtime?.accessToken) headers.Authorization = `Bearer ${options.runtime.accessToken}`;
    this.service = new CrosstabService({
      apiBaseUrl: options.runtime?.apiBaseUrl, database: options.runtime?.database, headers, apiClient: options.apiClient || null
    });
    this.preset = null;
    this.presets = [];
    this.values = this._valuesOf(null);
    this.test = 'current';
    this.testValues = {};
    this.currentQuery = null;
    this._dirty = false;
  }

  /**
   * Toolbar, form, test records and the preview.
   *
   * @returns {Promise<CrosstabsDesigner>}
   */
  async render() {
    this.dbdefs = await this.tool.getDbDefs().catch(() => null);
    this.currentQuery = this.tool.getCurrentQuery?.() ?? null;
    this.test = this.currentQuery == null ? 'own' : 'current';
    this.container.classList.add('h-crosstabs-tool', 'h-crosstabs-designer');
    // the header with Close (as the Website manager and the Report editor)
    const header = element('div', 'heurist-source-header h-crosstabs-designer-header');
    this.titleElement = element('span', 'h-crosstabs-designer-title');
    const close = element('button', 'h-btn h-crosstabs-designer-close');
    close.type = 'button';
    close.title = $HR('Close the crosstab editor');
    const closeIcon = element('i', 'fa-solid fa-xmark');
    closeIcon.setAttribute('aria-hidden', 'true');
    const closeText = element('span');
    closeText.textContent = $HR('Close');
    close.append(closeIcon, closeText);
    close.addEventListener('click', () => void this.close());
    header.append(this.titleElement, close);
    this.toolbar = element('div', 'h-toolbar h-crosstabs-tool-toolbar');
    this.toolbar.setAttribute('role', 'toolbar');
    const main = element('div', 'h-crosstabs-tool-main');
    this.formPane = element('div', 'h-crosstabs-tool-form');
    this.formHost = element('div', 'h-crosstabs-tool-form-body');
    this.formPane.append(this.formHost);
    const view = element('div', 'h-crosstabs-tool-view');
    this.testBar = element('div', 'h-crosstabs-designer-test');
    // the Filter Form of the parameters of the own query (Test on: Own query)
    const paramsHost = element('div', 'h-crosstabs-viewer-params');
    // the form and the preview: a vertical form at the left, a horizontal one above (review 6)
    const body = element('div', 'h-crosstabs-designer-body h-crosstab-params-layout');
    this.params = new CrosstabParams(paramsHost, {
      dbdefs: this.dbdefs,
      apiClient: this.tool.apiClient,
      layout: body,
      selectExtent: this.tool.selectExtent || null,
      onSubmit: (values) => {
        this.testValues = values;
        void this._loadRectypes();
        void this._applyTest();
      }
    });
    const crosstabHost = element('div', 'h-crosstabs-designer-preview');
    body.append(paramsHost, crosstabHost);
    view.append(this.testBar, body);
    main.append(this.formPane, view);
    this.container.replaceChildren(header, this.toolbar, main);
    this.presets = await loadCrosstabPresets(this.tool.apiClient, this.dbdefs);
    this._renderToolbar();
    this._renderTestBar();
    this.crosstab = new HCrosstab().attach(crosstabHost, {
      service: this.service,
      settings: this.values.settings,
      level: 'display',
      language: this.language,
      database: this.tool.runtime?.database || '',
      labels: crosstabLabels(this.dbdefs),
      fieldLabel: (code) => crosstabFieldLabel(this.dbdefs, code),
      emptyText: 'Choose the test records'
    }).render();
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
    this.testValues = {};
    this._dirty = false;
    if (!this.presets.some((item) => item.id === preset.id)) {
      this.presets.push({ id: preset.id, title: preset.title, rectype: this.values.settings.fields.rectype });
    }
    // a crosstab without a current result is tested on its own query
    if (this.currentQuery == null) this.test = 'own';
    this._renderToolbar();
    this._renderTestBar();
    await this._renderForm({ read: false });
    await this.crosstab?.setSettings(this.values.settings, { reload: false });
    await this._applyTest();
    return true;
  }

  /**
   * A new crosstab: the record type of the current result, its query as the query of the crosstab.
   *
   * @returns {Promise<void>}
   */
  newCrosstab() {
    return this._new({ ask: false });
  }

  /** @returns {boolean} Changes of the form that are not saved. */
  hasUnsavedChanges() {
    return this._dirty === true;
  }

  /**
   * Close the designer (Save | Discard | Cancel first when there are changes).
   *
   * @returns {Promise<boolean>} False when the user stays.
   */
  async close() {
    if (!(await this._confirmLeave())) return false;
    this._dirty = false;
    this.tool.onClose?.({ presetId: this.preset?.id || 0 });
    return true;
  }

  /** @returns {Promise<void>} */
  async destroy() {
    clearTimeout(this._applyTimer);
    this.params?.hide();
    await this.form?.destroy();
    await this.crosstab?.destroy();
    this.crosstab = null;
    await super.destroy();
  }

  // ------------------------------------------------------------------ data

  /** @private Field, type and term ids of the database. */
  _ids() {
    return crosstabIds(this.dbdefs);
  }

  /** @private Name, query text and settings of a preset (or a new crosstab). */
  _valuesOf(preset) {
    return {
      title: preset?.title || '',
      query: preset?.query == null ? '' : (typeof preset.query === 'string' ? preset.query : JSON.stringify(preset.query)),
      settings: normalizeCrosstabSettings(preset?.configuration || null)
    };
  }

  /**
   * @private The test records without the record type: the snapshot of the current result, or the own query with its
   * parameters (some values are enough, review 6). `this.missingText`: why the own query does not count.
   */
  _testRecords() {
    this.missingText = null;
    if (this.test === 'current') return this.currentQuery;
    const own = ownCount(this.values.query, {
      values: this.testValues, selection: this.tool.getSelection?.() || [], filterForm: this.values.settings.filterForm,
      dbdefs: this.dbdefs
    });
    this.missingText = own.message;
    return own.q;
  }

  /** @private The preview counts the test records. */
  async _applyTest() {
    this._showParams();
    const records = this._testRecords();
    if (records == null) {
      const text = this.test === 'current' ? 'There is no current result' : 'Set the query of the crosstab (Source)';
      this.crosstab?.clear(this.missingText || text);
      return;
    }
    await this.crosstab?.setQuery(records);
  }

  /** @private The Filter Form of the own query while it is tested (built again for another query or form). */
  _showParams() {
    if (!this.params) return;
    const query = this.test === 'own' ? this.values.query : '';
    if (!query || !askedParameters(query).length) {
      this.params.hide();
      return;
    }
    this.params.show({ id: this.preset?.id || 0, query, settings: { filterForm: this.values.settings.filterForm } }, this.testValues);
  }

  // ------------------------------------------------------------------ save, delete

  /**
   * @private Save the crosstab; `asNew`: a new Presentation set with the values of the form (Save as) — its name is the
   * Name of the form, with "(copy)" when it was not changed.
   * @returns {Promise<boolean>} Saved.
   */
  async _save({ asNew = false } = {}) {
    // one save at a time: Save and Save as are disabled (spinner) until it ends
    if (this._saving) return false;
    this._saving = asNew ? 'saveAs' : 'save';
    this._renderToolbar();
    try {
      return await this._saveNow(asNew);
    } finally {
      this._saving = null;
      this._renderToolbar();
    }
  }

  /** @private Save (see _save). @returns {Promise<boolean>} Saved. */
  async _saveNow(asNew) {
    const ids = this._ids();
    if (!ids.rectype || !ids.configuration || !ids.type || !ids.crosstabs) {
      HMsg.showMsgErr?.($HR('This database has no record type Presentation set (2-1112)'));
      return false;
    }
    if (!(await this._checkForm())) return false;
    if (asNew && this.values.title.trim() === String(this.preset?.title || '').trim()) {
      this.values.title = `${this.values.title.trim()} (${$HR('copy')})`;
    }
    const details = {
      [ids.name]: [this.values.title.trim()],
      [ids.type]: [ids.crosstabs],
      [ids.configuration]: [JSON.stringify(this.values.settings)],
      [ids.query]: this.values.query.trim() ? [this.values.query.trim()] : []
    };
    try {
      const id = asNew ? 0 : (this.preset?.id || 0);
      const answer = id
        ? await this.tool.apiClient.request(`/presentation/${id}`, { method: 'PATCH', body: { details } })
        : await this.tool.apiClient.post('/presentation/0', { body: { rec_RecTypeID: ids.rectype, details } });
      const saved = Number((answer?.data ?? answer)?.records?.[0]?.rec_ID ?? (answer?.data ?? answer)?.recordId ?? id) || 0;
      this._dirty = false;
      this.presets = await loadCrosstabPresets(this.tool.apiClient, this.dbdefs);
      if (saved) await this.openPreset(saved);
      HMsg.showMsgFlash?.($HR('Saved'), { showDelay: 1500 });
      return true;
    } catch (error) {
      HMsg.showMsgErr?.(crosstabErrorText(error));
      return false;
    }
  }

  /** @private The check of the form before Save. */
  async _checkForm() {
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
      HMsg.showMsgErr?.(crosstabErrorText(error));
      return;
    }
    this.presets = this.presets.filter((item) => item.id !== id);
    this._dirty = false;
    await this._new({ ask: false });
    HMsg.showMsgFlash?.($HR('Deleted'), { showDelay: 1500 });
  }

  /** @private The Presentation set in the record editor (name, owner, visibility). */
  async _editRecord() {
    const id = this.preset?.id;
    if (!id || !this.tool.editRecord || !(await this._confirmLeave())) return;
    const result = await this.tool.editRecord(id);
    if (result?.saved === false) return;
    this.presets = await loadCrosstabPresets(this.tool.apiClient, this.dbdefs);
    await this.openPreset(id);
  }

  // ------------------------------------------------------------------ toolbar

  /** @private New | selector | Record editor | Save | Save as | … | Delete | Help (Close on the header). */
  _renderToolbar() {
    if (this.titleElement) {
      const name = this.preset?.title || $HR('New crosstab');
      this.titleElement.textContent = `${$HR('Crosstab editor')}: ${name}`;
    }
    const bar = this.toolbar;
    bar.replaceChildren();
    toolButton(bar, 'fa-plus', 'New crosstab', 'New crosstab', () => void this._new());
    toolSeparator(bar);
    const select = presetSelector(bar, this.preset?.title || $HR('New crosstab'), (anchor) => this._toggleList(anchor));
    select.disabled = !this.presets.length;
    const record = toolButton(bar, 'fa-pen', 'Record editor', 'Name, owner and visibility of the crosstab', () => void this._editRecord(), false);
    record.disabled = !this.preset?.id || !this.tool.editRecord;
    const save = toolButton(bar, this._saving === 'save' ? 'fa-spinner fa-spin' : 'fa-floppy-disk', 'Save', 'Save the crosstab', () => void this._save());
    save.classList.add('h-btn-primary');
    save.disabled = Boolean(this._saving);
    const saveAs = toolButton(bar, this._saving === 'saveAs' ? 'fa-spinner fa-spin' : 'fa-copy', 'Save as', 'Save the changes as a new crosstab (with the Name of the form; "(copy)" when it is not changed)', () => void this._save({ asNew: true }));
    saveAs.disabled = !this.preset?.id || Boolean(this._saving);
    // Delete next to Help (review 2026-11-22)
    const remove = toolButton(bar, 'fa-trash-can', 'Delete', 'Delete the crosstab', () => void this._delete(), false);
    remove.classList.add('h-crosstabs-tool-right');
    remove.disabled = !this.preset?.id;
    const help = toolButton(bar, 'fa-circle-question', 'Help', 'Help of the crosstabs', () => this.tool.openManual?.('crosstabs'), false);
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

  /** @private Test on: Current result (a snapshot of Explorer's result) | Own query. */
  _renderTestBar() {
    this.testBar.replaceChildren();
    const label = element('label', 'h-crosstab-control');
    const caption = element('span');
    caption.textContent = $HR('Test on');
    const select = element('select', 'h-select h-compact');
    for (const [value, text] of [['current', 'Current result'], ['own', 'Own query']]) {
      const option = element('option');
      option.value = value;
      option.textContent = $HR(text);
      option.disabled = value === 'current' && this.tool.getCurrentQuery?.() == null && this.currentQuery == null;
      select.append(option);
    }
    select.value = this.test;
    select.addEventListener('change', () => {
      this.test = select.value;
      // the current result of now
      if (this.test === 'current') this.currentQuery = this.tool.getCurrentQuery?.() ?? this.currentQuery;
      void this._loadRectypes();
      void this._applyTest();
    });
    label.append(caption, select);
    const note = element('span', 'h-crosstabs-designer-note');
    note.textContent = $HR('The main search does not change the preview.');
    this.testBar.append(label, note);
  }

  /** @private A new crosstab: the record type and the query of the current result. */
  async _new({ ask = true } = {}) {
    if (ask && !(await this._confirmLeave())) return;
    this.preset = null;
    this.values = this._valuesOf(null);
    this.testValues = {};
    this.currentQuery = this.tool.getCurrentQuery?.() ?? this.currentQuery;
    if (this.currentQuery != null) {
      this.test = 'current';
      this.values.query = typeof this.currentQuery === 'string' ? this.currentQuery : JSON.stringify(this.currentQuery);
      const types = await loadScopeRecordTypes(this.tool.apiClient, this.currentQuery, this.dbdefs).catch(() => null);
      this.values.settings.fields.rectype = types?.recordTypes?.[0]?.id || null;
    } else {
      this.test = 'own';
    }
    this._dirty = false;
    clearTimeout(this._applyTimer);
    this._renderToolbar();
    this._renderTestBar();
    await this._renderForm({ read: false });
    await this.crosstab?.setSettings(this.values.settings, { reload: false });
    await this._applyTest();
  }

  // ------------------------------------------------------------------ form

  /** @private The form (HEditForm) with the values of the crosstab. */
  async _renderForm({ read = true } = {}) {
    if (read) this._readForm();
    await this.form?.destroy();
    this.form = null;
    const ids = this._ids();
    const services = (await this.tool.formServices?.().catch(() => null)) || { apiClient: this.tool.apiClient, dbdefs: this.dbdefs };
    const fieldTypes = Object.fromEntries(CROSSTAB_DIMENSIONS.map((name) => [name, this._codeType(this.values.settings[name]?.code)]));
    this.form = new HEditForm().attach(this.formHost, {
      ...services,
      form: crosstabsForm({
        ids, rectypes: this._rectypeTerms(this.rectypes), numericFields: this._numericFields(this.values.settings.fields.rectype), fieldTypes
      }),
      values: formValues(this.values, ids),
      keepHidden: true,
      labelPos: 'above',
      specialEditors: this._specialEditors(ids),
      onChange: (form, change) => this._changed(change.name)
    });
    this.form.render();
    void this._loadRectypes();
  }

  /** @private The values of the form into `this.values`. */
  _readForm() {
    if (!this.form) return;
    this.values = valuesSettings(this.form.getValues(), this._ids());
  }

  /** @private A value changed: the preview at once (after a short delay). */
  _changed(name) {
    if (name == null) return;
    this._dirty = true;
    const ids = this._ids();
    const queryChanged = name === String(ids.query || 'query');
    if (name === 'fieldsOf') void this._rectypeChanged();
    const dimension = CROSSTAB_DIMENSIONS.find((item) => name === `${item}Code`);
    if (dimension) void this._fieldChanged(dimension);
    clearTimeout(this._applyTimer);
    this._applyTimer = setTimeout(() => {
      this._readForm();
      void this.crosstab?.setSettings(this.values.settings, { reload: false });
      if (queryChanged && this.test === 'own') void this._loadRectypes();
      void this._applyTest();
    }, APPLY_DELAY);
  }

  /**
   * @private Another field of a dimension: the values offered for its type, reset to the default of the type (3d, 3i,
   * 3j of the review).
   */
  async _fieldChanged(name) {
    const code = String([this.form?.getValue(`${name}Code`)].flat()[0] || '');
    const type = this._codeType(code);
    await this.form?.updateField(`${name}Buckets`, { terms: bucketTermsFor(type) });
    await this.form?.setValue(`${name}Buckets`, defaultBucketMode(type));
    await this.form?.setValue(`${name}Ranges`, '');
    await this.form?.setValue(`${name}Count`, 10);
    await this.form?.setValue(`${name}Groupby`, 'decade');
  }

  /** @private The type of the values of a field code (header dates are dates; other header fields: each value). */
  _codeType(code) {
    if (!code) return null;
    const field = String(code).split(':').pop().toLowerCase();
    if (!/^\d+$/.test(field)) return HEADER_TYPES[field] || null;
    return fieldCodeType(String(code), this.dbdefs) || null;
  }

  /** @private Another record type: the numeric fields of the measure. */
  async _rectypeChanged() {
    await new Promise((resolve) => setTimeout(resolve, 0));
    const rectype = Number([this.form?.getValue('fieldsOf')].flat()[0]) || 0;
    const fields = this._numericFields(rectype);
    await this.form?.updateField('measureField', { terms: fields.map((item) => ({ id: String(item.id), label: item.label })) });
  }

  /**
   * @private The record types of the test records with counts (as the Export scope); without test records every record
   * type of the database.
   */
  async _loadRectypes() {
    const serial = (this._rectypeSerial = (this._rectypeSerial || 0) + 1);
    const records = this._testRecords();
    let types = null;
    if (records != null) {
      types = (await loadScopeRecordTypes(this.tool.apiClient, records, this.dbdefs).catch(() => null))?.recordTypes || null;
    }
    if (serial !== this._rectypeSerial || !this.form) return;
    this.rectypes = types;
    await this.form.updateField('fieldsOf', { terms: this._rectypeTerms(types) });
  }

  /** @private Terms of *Record type*: those of the test records "Name (count)", the chosen one kept. */
  _rectypeTerms(types) {
    const all = (this.dbdefs?.rectypes?.() || []).map((type) => ({ id: String(type.id), label: type.name }));
    if (!Array.isArray(types)) return all;
    const terms = types.map((type) => ({ id: String(type.id), label: `${type.name} (${type.count.toLocaleString()})` }));
    const chosen = String(this.form ? [this.form.getValue('fieldsOf')].flat()[0] ?? '' : this.values.settings.fields.rectype ?? '');
    if (chosen && !terms.some((term) => term.id === chosen)) {
      const name = this.dbdefs?.rectypeName?.(Number(chosen)) || `#${chosen}`;
      terms.push({ id: chosen, label: `${name} (${$HR('not in the test records')})` });
    }
    return terms;
  }

  /** @private Numeric fields of a record type (the measure). */
  _numericFields(rectype) {
    if (!rectype) return [];
    return (this.dbdefs?.fields?.(rectype) || []).filter((field) => ['integer', 'float', 'year'].includes(field.type))
      .map((field) => ({ id: Number(field.id), label: field.name }));
  }

  /** @private Special editors: the query (and its filter form) of the record editor, a field path, fields, the ranges. */
  _specialEditors(ids) {
    const record = this.tool.specialEditors?.(this.dbdefs, { currentQuery: () => this.tool.getCurrentQuery?.() ?? this.currentQuery }) || {};
    const parse = (value) => {
      try {
        return value ? JSON.parse(value) : null;
      } catch {
        return null;
      }
    };
    return {
      query: record[ids.query] || null,
      filterForm: record[ids.form] || { json: true, hidden: true },
      fieldCode: {
        icon: 'fa-list-check',
        editLabel: 'Select',
        title: 'Choose the field',
        describe: (value) => (value ? crosstabFieldLabel(this.dbdefs, value) : ''),
        edit: async () => {
          const [code] = (await this._pickFields()) || [];
          return code === undefined ? undefined : code;
        }
      },
      fieldCodes: {
        json: true,
        icon: 'fa-list-check',
        editLabel: 'Select',
        title: 'Choose the fields',
        describe: (value) => (parse(value) || []).map((code) => crosstabFieldLabel(this.dbdefs, code)).join(', '),
        edit: async (value) => {
          const codes = await this._pickFields({ multiple: true });
          if (!codes) return undefined;
          return JSON.stringify([...new Set([...(parse(value) || []), ...codes])]);
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

  /**
   * @private Fields of the record type or of linked records (the field tree): Alphabetic, type filter, metadata, no Any
   * field; `multiple`: several fields with "Add selected fields".
   * @returns {Promise<string[]|undefined>} Field path codes, undefined when cancelled.
   */
  async _pickFields({ multiple = false } = {}) {
    this._readForm();
    const rectype = this.values.settings.fields.rectype;
    if (!rectype) {
      HMsg.showMsgFlash?.($HR('Choose the record type first'), { showDelay: 2000 });
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
      const codes = (paths) => {
        const result = paths.map((path) => crosstabCode(fieldPathCode(path, rectype))).filter(Boolean);
        if (result.length < paths.length) HMsg.showMsgFlash?.($HR('This field can not be counted'), { showDelay: 2000 });
        return result;
      };
      tree.mount(host, {
        rtyId: rectype,
        selectableTypes: DIMENSION_TYPES,
        hideUnselectable: true,
        typeFilter: true,
        includeHeaders: true,
        valuesOnly: true,
        showSort: true,
        maxDepth: 2,
        ...(multiple ? {
          multiSelect: true,
          onAddSelected: (paths) => {
            const result = codes(paths);
            if (result.length) finish(result);
          }
        } : {})
      }, (path) => {
        if (multiple) return;
        const result = codes([path]);
        if (result.length) finish(result);
      });
      HMsg.showMsgDlg(host, {
        dialogId,
        title: $HR(multiple ? 'Choose the fields' : 'Choose the field'),
        buttons: [{ label: $HR('Cancel'), class: 'h-btn', onClick: () => finish(undefined) }],
        onClose: () => finish(undefined)
      });
      HMsg.getMsgDlg?.(dialogId)?.classList.add('h-crosstabs-field-dialog');
    });
  }

  /** @private The ranges of a field: HRangeList with a label column, Add, Generate ranges (HRangeGenerator), Remove all. */
  async _editRanges(stored, code) {
    if (!code) {
      HMsg.showMsgFlash?.($HR('Choose the field first'), { showDelay: 2000 });
      return undefined;
    }
    const type = this._codeType(code);
    if (!['date', 'year', 'integer', 'float', 'enum', 'relationtype'].includes(type)) {
      HMsg.showMsgFlash?.($HR('Own ranges are for numeric, date and enum fields'), { showDelay: 2500 });
      return undefined;
    }
    const ranges = stored.map((range) => (typeof range === 'string' ? { value: range, label: '' } : { value: range.value, label: range.label || '' }));
    const enumField = !isIntervalType(fieldCodeType(code, this.dbdefs) || type);
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
      const query = recordTypeQuery(this._testRecords(), this.values.settings.fields.rectype) || [];
      const generated = await openRangeGenerator({ code, api: this.tool.apiClient, dbdefs: this.dbdefs, query });
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
        title: `${$HR('Ranges')}: ${crosstabFieldLabel(this.dbdefs, code)}`,
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

/**
 * A field path code of the field tree as a crosstab code: header fields by their crosstab names (`rec_Added` → `added`);
 * '' when the crosstab can not count the field (ID, URL).
 *
 * @param {string} code
 * @returns {string}
 */
export function crosstabCode(code) {
  const parts = String(code || '').split(':');
  const last = parts.pop() || '';
  const header = HEADER_CODES[last.toLowerCase()];
  const result = [...parts, header || last].join(':');
  return result && crosstabCodePath(result) ? result : '';
}
