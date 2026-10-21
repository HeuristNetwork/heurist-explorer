/**
 * @file HRecordEditor.js
 * @brief Record editor of the new write API (plan 14 §6): ownership, the fields
 *        of the record type in groups (tabs, accordion or plain groups, as set by
 *        the separators of the record structure), save with the server's issues.
 *        The fields are an HEditForm (plan 14a) of the record structure.
 *
 * For now it edits the system record types of writableRecordTypes.js (query
 * sources, map documents and layers, reports, website pages); other records
 * keep the host's record editor. Usage:
 *
 *   const editor = new HRecordEditor().attach(host, { apiClient, dbdefs, recordId });
 *   await editor.open();               // loads the record and its structure, renders
 *   host.addEventListener('h-record-editor-saved', (event) => ...);
 *
 * Events on the container: `h-record-editor-saved` {record, issues, created},
 * `h-record-editor-close` {saved}, `h-record-editor-change` {dirty}.
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
import { HEditForm } from '../edit-form/HEditForm.js';
import { HRecordAccess, describeAccess } from '../record-access/HRecordAccess.js';
import { UserGroupSource } from '../../data/valueSources/localSources.js';
import { RecordEditClient, RecordEditError } from '../../data/RecordEditClient.js';
import { RecordStructureProvider } from '../../recordview/RecordStructureProvider.js';
import { buildRecordBody, defaultFieldValues, recordFieldValues } from '../../data/recordEditValues.js';
import { multilangFieldIds } from '../../data/writableRecordTypes.js';
import { nonStandardGroup, reverseRelmarkerGroup, structureFields } from '../../data/recordEditStructure.js';
import { loadRelationship, loadRelmarkerStates, relationFits, relationshipBody } from '../../data/relmarkerRelations.js';
import { HCardinalLayout } from '../layout/HCardinalLayout.js';
import { RecordRelationsProvider } from '../../recordview/RecordRelationsProvider.js';
import { buildLinkedFromSection, buildLinksRow } from '../../recordview/RecordViewRenderer.js';
import { HMsg } from '../../ui/HMsg.js';
import { $HR } from '../../ui/i18n/HResource.js';
import './HRecordEditor.css';

/** Header fields of the server issues, shown in the ownership pane. */
const HEADER_FIELDS = new Set(['rec_OwnerUGrpID', 'rec_NonOwnerVisibility', 'rec_NonOwnerVisibilityGroups', 'rec_EditGroups']);

/** Editor of one record. */
export class HRecordEditor extends HBaseWidget {
  /**
   * @param {HTMLElement} container Editor host.
   * @param {object} options
   * @param {object} options.apiClient HeuristApiClient.
   * @param {object} options.dbdefs HDbDefs (record type names, vocabularies, users and groups, dbconst).
   * @param {number|string} [options.recordId] Record to edit.
   * @param {number|string} [options.rectypeId] Record type of a new record (no recordId).
   * @param {{owner?: number, visibility?: string, viewGroups?: number[]}} [options.access] Owner and
   *        visibility of a new record (the remembered ones, plan 21); default: current user, viewable.
   * @param {object} [options.client] RecordEditClient (default: one over apiClient).
   * @param {object} [options.structureProvider] RecordStructureProvider (shared cache).
   * @param {string[]} [options.languages] Language codes offered for translations.
   * @param {Function} [options.selectExtent] Map extent picker of geo fields.
   * @param {Function} [options.selectGeometry] Map drawing of geo fields: `(wkt) → Promise<{type, wkt}|null>`.
   * @param {Function} [options.editRecord] Edit button of pointer fields: `(id) → Promise<{saved, record}>`.
   * @param {Function} [options.viewRecord] View button of pointer fields: `(id)`.
   * @param {Function} [options.browseRecords] Browse of pointer fields (record manager, plan 21): `(options) → Promise<number[]|null>`.
   * @param {Function} [options.addRecord] Add of pointer fields (plan 21): `(rectypeId) → Promise<{saved, recordId}>`.
   * @param {Function} [options.fileUrl] Link to view a file of a file field.
   * @param {Function} [options.editFile] Edit button of file fields (host file editor): `(id) → Promise<{saved, record}>`.
   * @param {{baseUrl: string, database: string}} [options.fileViewer] File fields: show the file below the input.
   * @param {Object<number, object>} [options.specialEditors] Special fields by field id: `{json, describe, edit}`
   *        (see HEditField); `describe` and `edit` get `{field, record, getValue(dty), setValue(dty, value)}`.
   * @param {Function} [options.onSaved] Called after a save with `{record, issues, created}`.
   * @param {Function} [options.onClose] Called when the editor asks to close, with `{saved}`.
   * @param {boolean} [options.readOnly] Display only.
   * @param {'inline'|'above'|'auto'} [options.labelPos='auto'] Labels beside or above the inputs
   *        (auto: beside when the form is wide enough), see formLayout.js.
   * @param {'flow'|'stack'} [options.inputPos='stack'] One field per line, or side by side.
   * @param {boolean} [options.summary=true] The Record summary pane on the right.
   * @param {Function} [options.onOpenRecord] Called with a record id: a linked record of the summary.
   * @returns {HRecordEditor} This editor.
   */
  attach(container, options = {}) {
    super.attach(container, options);
    if (!options.apiClient) throw new TypeError('HRecordEditor requires an API client');
    this.client = options.client || new RecordEditClient({ apiClient: options.apiClient });
    this.structureProvider = options.structureProvider || new RecordStructureProvider({ apiClient: options.apiClient });
    this.dbdefs = options.dbdefs || null;
    this.record = null;
    this.structure = null;
    this.editForm = null;
    this._saved = false;
    return this;
  }

  /** @returns {number} Record type of the record. */
  get rectypeId() {
    return Number(this.record?.rec_RecTypeID ?? this.options.rectypeId) || 0;
  }

  /** @returns {boolean} Whether the record is not saved yet. */
  get isNew() {
    return !(Number(this.record?.rec_ID) > 0);
  }

  /**
   * Load the record (or prepare a new one) and its structure, then render.
   *
   * @param {{signal?: AbortSignal}} [options]
   * @returns {Promise<HRecordEditor>} This editor.
   * @throws {Error} When the record cannot be loaded or is not visible.
   */
  async open({ signal } = {}) {
    if (!this.container) throw new Error('HRecordEditor must be attached before open');
    this._renderLoading();
    const recordId = Number(this.options.recordId) || 0;
    if (recordId > 0) {
      const { record } = await this.client.load(recordId, { signal });
      if (!record) throw new Error($HR('The record does not exist or you cannot see it'));
      this.record = record;
    } else if (!(Number(this.options.rectypeId) > 0)) {
      throw new TypeError('HRecordEditor needs recordId or rectypeId');
    }
    const rty = this.rectypeId;
    const structure = await this.structureProvider.editStructure(rty, {
      signal, dbdefs: this.dbdefs, multilangIds: multilangFieldIds(this.dbdefs, rty)
    });
    // relationships of other record types' relmarker fields that target this type (plan 22),
    // then the values of fields the structure does not have: last groups (a copy: the structure is cached)
    const reverse = reverseRelmarkerGroup(rty, this.dbdefs, $HR('Relationships from other records'));
    const extra = nonStandardGroup(this.record, structure, this.dbdefs, $HR('Non-standard fields'));
    this.structure = reverse || extra
      ? { ...structure, groups: [...structure.groups, ...(reverse ? [reverse] : []), ...(extra ? [extra] : [])] }
      : structure;
    const relationsError = await this._loadRelmarkers(signal);
    this.render();
    if (relationsError) this._showMessages([{ severity: 'error', message: relationsError }]);
    return this;
  }

  /** @returns {HRecordEditor} This editor (after open()). */
  render() {
    if (!this.structure) throw new Error('HRecordEditor.render needs open() first');
    this.clearListeners();
    this.container.replaceChildren();
    this.container.classList.add('h-widget', 'h-record-editor');

    this.titleElement = document.createElement('div');
    this.titleElement.className = 'h-record-editor-title';
    this.body = document.createElement('div');
    this.body.className = 'h-record-editor-body';
    this.messages = document.createElement('div');
    this.messages.className = 'h-record-editor-messages';
    this.messages.setAttribute('role', 'status');
    const footer = this._renderFooter();
    const header = this._initialHeader();
    if (this.options.summary === false) {
      this.container.append(this.titleElement, this.body, this.messages, footer);
      this.body.append(this._renderOwnership(header));
    } else {
      // the form and, on the right, the Record summary (owner and access are in its Admin panel)
      this.layoutHost = document.createElement('div');
      this.layoutHost.className = 'h-record-editor-layout';
      this.container.append(this.titleElement, this.layoutHost, this.messages, footer);
      this._renderLayout(header);
    }
    this._renderTitle();
    const values = this.record ? recordFieldValues(this.record, this.structure) : defaultFieldValues(this.structure);
    this._renderForm(values);

    this.listen(this.container, 'h-input-change', () => this._onChange());
    this._initial = JSON.stringify(this.getRecord());
    this.state = 'rendered';
    return this;
  }

  /**
   * The record in the write format, as a save would send it.
   *
   * @returns {object} Record body.
   */
  getRecord() {
    const fields = new Map();
    // record fields only (reverse relationship fields are named rev:<dty>)
    for (const [name, state] of this.editForm?.getStates() || []) {
      if (/^\d+$/.test(name)) fields.set(Number(name), state);
    }
    const body = buildRecordBody({
      record: this.record,
      rectypeId: this.rectypeId,
      header: this._header(),
      fields,
      structure: this.structure
    });
    // Scratchpad panel of the Record summary
    if (this.scratchpad) body.rec_ScratchPad = this.scratchpad.value;
    return body;
  }

  /** @returns {boolean} Whether something changed since the record was loaded or saved. */
  isDirty() {
    return this.state === 'rendered' && JSON.stringify(this.getRecord()) !== this._initial;
  }

  /**
   * Check the values in the browser (required fields, input formats) and show
   * the problems.
   *
   * @returns {Array<{field: string, message: string}>} Problems; empty when the record can be sent.
   */
  validate() {
    // the form shows the problems beside the fields and opens the first one
    const problems = this.editForm ? this.editForm.validate() : [];
    this._showMessages(problems.length ? [{ severity: 'error', message: $HR('Please correct the marked fields') }] : []);
    return problems;
  }

  /**
   * Save the record (insert or replace). Invalid values and a change by someone
   * else are shown in the editor.
   *
   * @param {{close?: boolean, force?: boolean}} [options] `close`: close after a save;
   *        `force`: overwrite a change by someone else.
   * @returns {Promise<boolean>} True when saved.
   */
  async save({ close = false, force = false } = {}) {
    if (this.options.readOnly || this._saving) return false;
    if (this.validate().length) return false;
    const body = this.getRecord();
    this._setBusy(true);
    try {
      const created = this.isNew;
      const result = created ? await this.client.insert(body) : await this.client.update(body, { force });
      this.record = result.record;
      this._saved = true;
      this._afterSave(result.issues);
      this._emit('h-record-editor-saved', { record: result.record, issues: result.issues, created });
      this.options.onSaved?.({ record: result.record, issues: result.issues, created });
      if (close) this.close();
      return true;
    } catch (error) {
      if (error instanceof RecordEditError && error.isValidation) {
        this._showIssues(error.issues);
      } else if (error instanceof RecordEditError && error.isConflict) {
        if (await confirmDialog($HR('This record was changed by someone else after you opened it. Save your version anyway?'),
          $HR('Record changed'))) {
          this._setBusy(false);
          return this.save({ close, force: true });
        }
        this._showMessages([{ severity: 'error', message: $HR('Not saved: the record was changed by someone else') }]);
      } else {
        this._showMessages([{ severity: 'error', message: error?.message || $HR('The record could not be saved') }]);
      }
      return false;
    } finally {
      this._setBusy(false);
    }
  }

  /**
   * Ask to close the editor (the host removes it). Unsaved changes are confirmed first.
   *
   * @param {{confirm?: boolean}} [options] `confirm: false` closes without asking.
   * @returns {Promise<boolean>} True when closing.
   */
  async close({ confirm = true } = {}) {
    if (confirm && this.isDirty()
      && !(await confirmDialog($HR('Close without saving your changes?'), $HR('Unsaved changes')))) {
      return false;
    }
    this._emit('h-record-editor-close', { saved: this._saved });
    this.options.onClose?.({ saved: this._saved });
    return true;
  }

  /**
   * Drop the unsaved changes: the form again with the values of the record as it was
   * loaded or last saved (confirmed first when something changed).
   *
   * @returns {Promise<boolean>} True when the form was reloaded.
   */
  async dropChanges() {
    if (this.isDirty()
      && !(await confirmDialog($HR('Drop your changes and show the saved values again?'), $HR('Drop changes')))) {
      return false;
    }
    await this._destroyForm();
    this.render();
    return true;
  }

  /** Remove the inputs and the layout of the form (before render() again or destroy()). */
  async _destroyForm() {
    this._relationsAbort?.abort();
    this.cardinal?.destroy();
    this.cardinal = null;
    await this.editForm?.destroy();
    this.editForm = null;
    await this.access?.destroy();
    this.access = null;
  }

  /** @returns {Promise<void>} Completion after the inputs are removed. */
  async destroy() {
    await this._destroyForm();
    await super.destroy();
  }

  // ----------------------------------------------------------------- render ---

  /** Placeholder while loading. */
  _renderLoading() {
    this.container.replaceChildren();
    this.container.classList.add('h-widget', 'h-record-editor');
    const loading = document.createElement('div');
    loading.className = 'h-record-editor-loading h-i18n';
    loading.textContent = $HR('Loading…');
    this.container.append(loading);
  }

  /** Record type, title and id. */
  _renderTitle() {
    const typeName = this.dbdefs?.rectypeName?.(this.rectypeId) || `#${this.rectypeId}`;
    this.titleElement.replaceChildren();
    const type = document.createElement('span');
    type.className = 'h-record-editor-type';
    type.textContent = typeName;
    const title = document.createElement('span');
    title.className = 'h-record-editor-record';
    title.textContent = this.isNew ? $HR('New record') : stripTags(this.record.rec_Title) || `#${this.record.rec_ID}`;
    this.titleElement.append(type, title);
    if (!this.isNew) {
      const id = document.createElement('span');
      id.className = 'h-record-editor-id';
      id.textContent = `ID ${this.record.rec_ID}`;
      this.titleElement.append(id);
    }
  }

  /** Save, Save and close, Close. */
  _renderFooter() {
    const footer = document.createElement('div');
    footer.className = 'h-record-editor-footer';
    const button = (label, className, onClick) => {
      const element = document.createElement('button');
      element.type = 'button';
      element.className = `h-btn ${className} h-i18n`;
      element.textContent = $HR(label);
      this.listen(element, 'click', onClick);
      footer.append(element);
      return element;
    };
    this.saveButton = button('Save', 'h-btn-primary', () => this.save());
    this.saveCloseButton = button('Save and close', '', () => this.save({ close: true }));
    button('Close', '', () => this.close());
    // Drop changes: the form again with the values of the record as loaded or last saved
    this.dropButton = button('Drop changes', 'h-record-editor-drop', () => void this.dropChanges());
    if (this.options.readOnly) {
      this.saveButton.hidden = true;
      this.saveCloseButton.hidden = true;
      this.dropButton.hidden = true;
    }
    return footer;
  }

  /**
   * The form in the center and the Record summary on the right (HCardinalLayout):
   * resizable, collapsed to a strip with a large «/» button and its caption.
   */
  _renderLayout(header) {
    const collapsed = readSummaryCollapsed();
    this.cardinal = new HCardinalLayout(this.layoutHost, { eastSize: 300, minEast: 220, collapsedSize: 30, minCenterWidth: 280 });
    this.cardinal.setContent('center', this.body);
    this.cardinal.hide('west');
    this.summary = this._renderSummary(header);
    this.cardinal.setContent('east', this.summary);
    this.cardinal.show('east');
    if (collapsed) this.cardinal.collapse('east');
    const sync = () => {
      const isCollapsed = this.cardinal.state.east.collapsed === true;
      this.summaryToggleIcon.className = `fa-solid ${isCollapsed ? 'fa-angles-left' : 'fa-angles-right'}`;
      this.summaryToggle.title = isCollapsed ? $HR('Show the record summary') : $HR('Hide the record summary');
      this.summaryToggle.setAttribute('aria-label', this.summaryToggle.title);
      this.summaryToggle.setAttribute('aria-expanded', String(!isCollapsed));
      writeSummaryCollapsed(isCollapsed);
    };
    this.cardinal.addEventListener('regioncollapsechange', sync);
    sync();
  }

  /** Record summary: Admin, Private, Tags, Linked records, Scratchpad (plan 18). */
  _renderSummary(header) {
    const pane = document.createElement('div');
    pane.className = 'h-record-editor-summary';
    const head = document.createElement('div');
    head.className = 'h-record-editor-summary-head';
    this.summaryToggle = document.createElement('button');
    this.summaryToggle.type = 'button';
    this.summaryToggle.className = 'heurist-icon-button h-record-editor-summary-toggle';
    this.summaryToggleIcon = iconElement('fa-angles-right');
    this.summaryToggle.append(this.summaryToggleIcon);
    this.listen(this.summaryToggle, 'click', () => this.cardinal.toggle('east'));
    const caption = document.createElement('span');
    caption.className = 'h-record-editor-summary-caption h-i18n';
    caption.textContent = $HR('Record summary');
    head.append(this.summaryToggle, caption);
    pane.append(head);

    const section = (title, open, build) => {
      const details = document.createElement('details');
      details.className = 'h-record-editor-summary-section';
      details.open = open;
      const summary = document.createElement('summary');
      summary.className = 'h-i18n';
      summary.textContent = $HR(title);
      const body = document.createElement('div');
      body.className = 'h-record-editor-summary-body';
      build(body);
      details.append(summary, body);
      pane.append(details);
      return details;
    };
    this.adminSection = section('Admin', true, (body) => this._renderAdmin(body, header));
    section('Private', false, (body) => body.append(note($HR('Bookmark, rating and reminders: coming soon'))));
    section('Tags', false, (body) => body.append(note($HR('Tags: coming soon'))));
    section('Linked records', true, (body) => {
      this.linkedBody = body;
      this._renderLinkedRecords(body);
    });
    section('Scratchpad', false, (body) => {
      this.scratchpad = document.createElement('textarea');
      this.scratchpad.className = 'h-input h-record-editor-scratchpad';
      this.scratchpad.rows = 6;
      this.scratchpad.value = this.record?.rec_ScratchPad || '';
      this.scratchpad.readOnly = Boolean(this.options.readOnly);
      this.scratchpad.setAttribute('aria-label', $HR('Scratchpad'));
      this.listen(this.scratchpad, 'input', () => this._onChange());
      body.append(this.scratchpad);
    });
    return pane;
  }

  /** Admin: owner and access (editable), added by, added and updated. */
  _renderAdmin(body, header) {
    body.append(this._renderOwnership(header, { legend: false }));
    if (this.isNew) return;
    const users = new UserGroupSource(this.dbdefs);
    const info = document.createElement('dl');
    info.className = 'h-record-editor-admin-info';
    const row = (label, value) => {
      if (!value) return;
      const dt = document.createElement('dt');
      dt.className = 'h-i18n';
      dt.textContent = $HR(label);
      const dd = document.createElement('dd');
      dd.textContent = value;
      info.append(dt, dd);
    };
    const addedBy = Number(this.record.rec_AddedByUGrpID) || 0;
    row('Added by', addedBy ? users.labelFor(addedBy) || `#${addedBy}` : '');
    row('Added', localTime(this.record.rec_Added));
    row('Updated', localTime(this.record.rec_Modified));
    body.append(info);
  }

  /**
   * Linked records: relationships of the relmarker fields and the records linking
   * here, with the code of Record View's built-in renderer (RecordRelationsProvider,
   * buildLinksRow, buildLinkedFromSection).
   */
  _renderLinkedRecords(body) {
    this._relationsAbort?.abort();
    body.replaceChildren();
    if (this.isNew) {
      body.append(note($HR('Save the record to see its links')));
      return;
    }
    body.append(note($HR('Loading…')));
    const provider = new RecordRelationsProvider({ apiClient: this.options.apiClient, dbDefsProvider: async () => this.dbdefs });
    const relmarkers = structureFields(this.structure).filter((field) => field.type === 'relmarker' && !field.reverse);
    const onNavigate = (id) => this.options.onOpenRecord?.(id);
    this._relationsAbort = new AbortController();
    provider.load({
      id: Number(this.record.rec_ID),
      rty: this.rectypeId,
      sections: [{ fields: relmarkers.map((field) => ({ id: field.dty, type: 'relmarker' })) }],
      signal: this._relationsAbort.signal
    }).then((relations) => {
      const parts = [];
      const rows = [];
      for (const field of relmarkers) {
        const items = relations.related?.[String(field.dty)] || [];
        if (items.length) rows.push(buildLinksRow(field.label, items, onNavigate, true));
      }
      if (rows.length) {
        const fieldset = document.createElement('fieldset');
        fieldset.className = 'heurist-recordview-section heurist-recordview-related';
        const legend = document.createElement('legend');
        legend.textContent = $HR('Related');
        const dl = document.createElement('dl');
        dl.className = 'heurist-recordview-section-fields';
        for (const [dt, dd] of rows) dl.append(dt, dd);
        fieldset.append(legend, dl);
        parts.push(fieldset);
      }
      const linkedFrom = buildLinkedFromSection(relations, onNavigate);
      if (linkedFrom) parts.push(linkedFrom);
      body.replaceChildren(...(parts.length ? parts : [note($HR('No linked records'))]));
      body.classList.toggle('can-open', typeof this.options.onOpenRecord === 'function');
    }).catch((error) => {
      if (error?.name === 'AbortError') return;
      body.replaceChildren(note(error?.message || String(error)));
    });
  }

  /**
   * Owner and access as read-only lines with a pen; the pen opens HRecordAccess (port of
   * the legacy access form, plan 21 §6) inline, Apply closes it and shows the new values.
   * Nothing is saved here: the header goes with the record on Save (plan 21 review
   * 2026-10-19). The server issues of the header are shown below.
   */
  _renderOwnership(header, { legend: withLegend = true } = {}) {
    const pane = document.createElement('fieldset');
    pane.className = 'h-record-editor-ownership';
    if (withLegend) {
      const legend = document.createElement('legend');
      legend.className = 'h-i18n';
      legend.textContent = $HR('Ownership and access');
      pane.append(legend);
    }
    this.accessValue = { ...header };
    const view = document.createElement('div');
    view.className = 'h-record-editor-access';
    const lines = document.createElement('dl');
    lines.className = 'h-record-editor-access-lines';
    const line = (label) => {
      const dt = document.createElement('dt');
      dt.className = 'h-i18n';
      dt.textContent = $HR(label);
      const dd = document.createElement('dd');
      lines.append(dt, dd);
      return dd;
    };
    this.ownerText = line('Owner');
    this.accessText = line('Access');
    view.append(lines);
    if (!this.options.readOnly) {
      const pen = document.createElement('button');
      pen.type = 'button';
      pen.className = 'heurist-icon-button h-record-editor-access-edit';
      pen.title = $HR('Change owner and access');
      pen.setAttribute('aria-label', pen.title);
      pen.append(iconElement('fa-pen'));
      this.listen(pen, 'click', () => this._openAccessForm());
      view.append(pen);
      this.accessPen = pen;
    }
    this.accessFormHost = document.createElement('div');
    this.accessFormHost.className = 'h-record-editor-access-form';
    this.accessFormHost.hidden = true;
    pane.append(view, this.accessFormHost);
    this._syncAccessText();
    this.ownershipIssues = document.createElement('div');
    this.ownershipIssues.className = 'h-edit-field-issues';
    pane.append(this.ownershipIssues);
    return pane;
  }

  /** The owner and access lines of the current header. */
  _syncAccessText() {
    if (!this.ownerText) return;
    const text = describeAccess(this.accessValue || {}, this.dbdefs);
    this.ownerText.textContent = text.owner;
    this.accessText.textContent = text.access;
  }

  /** The access form inline, with Apply and Cancel. */
  _openAccessForm() {
    if (this.access || !this.accessFormHost) return;
    const formHost = document.createElement('div');
    this.access = new HRecordAccess().attach(formHost, {
      dbdefs: this.dbdefs,
      value: this.accessValue,
      // "Also editable by" (rec_EditGroups) is hidden for now - an intentional
      // simplification, as in the legacy access form (Artem 2026-10-19, plan 21 §11).
      // The stored edit groups are kept on save (HRecordAccess keeps them without the picker).
      // Show it again with `editGroups: true`.
      editGroups: false
    }).render();
    const buttons = document.createElement('div');
    buttons.className = 'h-record-editor-access-buttons';
    const apply = document.createElement('button');
    apply.type = 'button';
    apply.className = 'h-btn h-btn-primary h-btn-small h-i18n';
    apply.textContent = $HR('Apply');
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'h-btn h-btn-small h-i18n';
    cancel.textContent = $HR('Cancel');
    this.listen(apply, 'click', () => void this._closeAccessForm(true));
    this.listen(cancel, 'click', () => void this._closeAccessForm(false));
    buttons.append(apply, cancel);
    this.accessFormHost.replaceChildren(formHost, buttons);
    this.accessFormHost.hidden = false;
    if (this.accessPen) this.accessPen.hidden = true;
  }

  /**
   * Close the inline access form; Apply keeps its values for the next Save.
   *
   * @param {boolean} apply Whether to take the form's values.
   * @returns {Promise<void>}
   */
  async _closeAccessForm(apply) {
    if (!this.access) return;
    if (apply) this.accessValue = this.access.getValue();
    await this.access.destroy();
    this.access = null;
    this.accessFormHost.replaceChildren();
    this.accessFormHost.hidden = true;
    if (this.accessPen) this.accessPen.hidden = false;
    this._syncAccessText();
    if (apply) this._onChange();
  }

  /**
   * The fields of the structure in an HEditForm: groups as tabs, accordion or
   * fieldsets (the separators), labels inline / above and fields stacked / side by
   * side (plan 18).
   */
  _renderForm(values) {
    const host = document.createElement('div');
    host.className = 'h-record-editor-form';
    this.body.append(host);
    const states = new Map();
    for (const [dty, state] of values) states.set(String(dty), state);
    // relationships of the relmarker fields (loaded in open, kept up to date by the inputs)
    for (const [name, state] of this._relmarkerStates || []) states.set(name, state);
    this.editForm = new HEditForm().attach(host, {
      // labels of the record structure come from the database: not translated
      form: { localized: true, groups: this.structure.groups },
      states,
      allowHidden: true,
      labelPos: this.options.labelPos || 'auto',
      inputPos: this.options.inputPos || 'stack',
      apiClient: this.options.apiClient,
      dbdefs: this.dbdefs,
      // the database setting "Languages" (was: the languages of definition translations)
      languages: this.options.languages,
      selectExtent: this.options.selectExtent,
      selectGeometry: this.options.selectGeometry,
      editRecord: this.options.editRecord,
      viewRecord: this.options.viewRecord,
      browseRecords: this.options.browseRecords,
      addRecord: this.options.addRecord,
      fileUrl: this.options.fileUrl,
      editFile: this.options.editFile,
      fileViewer: this.options.fileViewer,
      readOnly: this.options.readOnly,
      specialEditors: this.options.specialEditors || {},
      specialContext: () => ({ record: this.record, rectypeId: this.rectypeId }),
      relationships: this._relationshipService()
    }).render();
  }

  /**
   * Relationships of the relmarker fields of a saved record (plan 22).
   *
   * @returns {Promise<string>} A message when they could not be loaded, else ''.
   */
  async _loadRelmarkers(signal) {
    this._relmarkerStates = new Map();
    const fields = structureFields(this.structure).filter((field) => field.type === 'relmarker');
    if (this.isNew || !fields.length) return '';
    try {
      this._relmarkerStates = await loadRelmarkerStates({
        apiClient: this.options.apiClient,
        dbdefs: this.dbdefs,
        recordId: Number(this.record.rec_ID),
        fields,
        signal
      });
      return '';
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      return `${$HR('The relationships could not be loaded')}: ${error?.message || error}`;
    }
  }

  /**
   * The service of the relmarker inputs (HInputRelmarker): a new record is saved before its
   * first relationship (plan 14 §5: no temporary record); relationships are records of their
   * own, saved and deleted at once, with the owner and visibility of this record.
   */
  _relationshipService() {
    return {
      ensureRecord: async () => {
        if (this.options.readOnly) return null;
        if (this.isNew && !(await this.save())) return null;
        return { id: Number(this.record.rec_ID), rty: this.rectypeId, title: stripTags(this.record.rec_Title) };
      },
      create: async (relationship) => {
        const result = await this.client.insert(relationshipBody(this.dbdefs, { ...relationship, header: this._header() }));
        return Number(result.record?.rec_ID) || 0;
      },
      remove: (relId) => this.client.remove(relId),
      load: (relId) => loadRelationship(this.options.apiClient, this.dbdefs, relId, Number(this.record?.rec_ID)),
      fits: (field, relation) => relationFits(field, relation, this.dbdefs),
      changed: () => this._relationshipsChanged()
    };
  }

  /** A relationship was added, changed or deleted: keep the states (a new render) and the Linked records. */
  _relationshipsChanged() {
    const names = new Set(structureFields(this.structure).filter((field) => field.type === 'relmarker')
      .map((field) => String(field.name ?? field.dty)));
    for (const [name, state] of this.editForm?.getStates() || []) {
      if (names.has(name)) this._relmarkerStates.set(name, state);
    }
    if (this.linkedBody) this._renderLinkedRecords(this.linkedBody);
    this._emit('h-relmarker-change', { recordId: Number(this.record?.rec_ID) || 0 });
  }

  // ------------------------------------------------------------------- state ---

  /** Ownership of the loaded record, or of a new record (owner: current user). */
  _initialHeader() {
    const record = this.record;
    if (!record) {
      const access = this.options.access || {};
      const owner = Number(access.owner);
      return {
        owner: Number.isFinite(owner) && access.owner != null ? owner : Number(this.dbdefs?.currentUserId?.()) || 0,
        visibility: access.visibility || 'viewable',
        viewGroups: (access.viewGroups || []).map(Number),
        editGroups: []
      };
    }
    return {
      owner: Number(record.rec_OwnerUGrpID) || 0,
      visibility: record.rec_NonOwnerVisibility || 'viewable',
      viewGroups: (record.rec_NonOwnerVisibilityGroups || []).map(Number),
      editGroups: (record.rec_EditGroups || []).map(Number)
    };
  }

  /** Ownership as edited. */
  _header() {
    return this.accessValue ? { ...this.accessValue } : this._initialHeader();
  }

  /** A value changed: tell the host whether there are unsaved changes. */
  _onChange() {
    this._emit('h-record-editor-change', { dirty: this.isDirty() });
  }

  /** After a save: new title and rec_Modified; warnings; nothing unsaved. */
  _afterSave(issues = []) {
    this._renderTitle();
    this._showIssues(issues);
    this._initial = JSON.stringify(this.getRecord());
    const warnings = (issues || []).length;
    this._showMessages([{
      severity: 'info',
      message: warnings ? $HR('Saved, with warnings') : $HR('Saved')
    }]);
  }

  /** Disable the buttons while saving. */
  _setBusy(busy) {
    this._saving = busy;
    if (this.saveButton) this.saveButton.disabled = busy;
    if (this.saveCloseButton) this.saveCloseButton.disabled = busy;
    this.container?.classList.toggle('is-busy', busy);
  }

  /**
   * Show the issues of the server next to their fields; header issues in the
   * ownership pane; issues of fields not in the form in the message area.
   */
  _showIssues(issues = []) {
    const header = [];
    const fieldIssues = [];
    for (const issue of issues || []) {
      if (HEADER_FIELDS.has(String(issue.field ?? ''))) header.push(issue);
      else fieldIssues.push(issue);
    }
    // issues of fields not in the form come back for the message area
    const other = this.editForm ? this.editForm.setIssues(fieldIssues) : fieldIssues;
    this.ownershipIssues.replaceChildren(...header.map((issue) => issueElement(issue)));
    // owner/access problems: show them in the Record summary
    if (header.length && this.cardinal) {
      this.cardinal.expand('east');
      if (this.adminSection) this.adminSection.open = true;
    }
    const errors = (issues || []).filter((issue) => issue.severity !== 'warning');
    const summary = errors.length
      ? [{ severity: 'error', message: $HR('Not saved: please correct the marked fields') }]
      : [];
    this._showMessages([...summary, ...other]);
    const first = fieldIssues.find((issue) => !other.includes(issue));
    if (errors.length && first) this._revealField(first.field);
  }

  /** Show messages under the form. */
  _showMessages(messages) {
    this.messages.replaceChildren(...(messages || []).map((issue) => issueElement(issue)));
  }

  /** Switch to the tab or open the accordion that holds a field. */
  _revealField(dty) {
    this.editForm?.revealField(String(dty));
  }

  /** Dispatch an editor event on the container. */
  _emit(type, detail) {
    this.container?.dispatchEvent(new CustomEvent(type, { bubbles: true, detail }));
  }
}

/** @returns {HTMLElement} One message or issue line. */
function issueElement(issue) {
  const element = document.createElement('div');
  element.className = `h-record-editor-message is-${issue.severity === 'warning' ? 'warning' : issue.severity === 'info' ? 'info' : 'error'}`;
  element.textContent = String(issue.message || '');
  return element;
}

/** @returns {string} Text without HTML tags (titles may have markup). */
function stripTags(value) {
  return String(value ?? '').replace(/<[^>]*>/g, '').trim();
}

/**
 * Yes/No question in the common message dialog.
 *
 * @returns {Promise<boolean>} True for Yes.
 */
function confirmDialog(message, title) {
  return new Promise((resolve) => {
    let answered = false;
    const answer = (value) => {
      if (answered) return;
      answered = true;
      HMsg.closeMsgDlg();
      resolve(value);
    };
    const dialog = HMsg.showMsgDlg(message, {
      title,
      buttons: [
        { label: 'Yes', class: 'h-btn h-btn-primary', onClick: () => answer(true) },
        { label: 'No', class: 'h-btn', onClick: () => answer(false) }
      ]
    });
    dialog?.addEventListener?.('close', () => answer(false), { once: true });
  });
}

/** A muted note of the Record summary. */
function note(text) {
  const element = document.createElement('div');
  element.className = 'h-record-editor-summary-note';
  element.textContent = text;
  return element;
}

/** A stored date-time (server time) with the browser's local time. */
export function localTime(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  // as the legacy editor (getTimeForLocalTimeZone): the stored time is UTC, the local time beside it
  const date = new Date(`${text.replace(' ', 'T')}${/[zZ]|[+-]\d\d:?\d\d$/.test(text) ? '' : 'Z'}`);
  if (Number.isNaN(date.getTime())) return text;
  const pad = (number) => String(number).padStart(2, '0');
  return `${text} (${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())} ${$HR('local')})`;
}

const SUMMARY_KEY = 'heurist.recordEditor.summaryCollapsed';

/** @returns {boolean} Whether the user collapsed the Record summary last time. */
function readSummaryCollapsed() {
  try { return globalThis.localStorage?.getItem(SUMMARY_KEY) === '1'; } catch { return false; }
}

/** Remember whether the Record summary is collapsed. */
function writeSummaryCollapsed(collapsed) {
  try { globalThis.localStorage?.setItem(SUMMARY_KEY, collapsed ? '1' : '0'); } catch { /* storage may be unavailable */ }
}

/** A Font Awesome icon element. */
function iconElement(icon) {
  const element = document.createElement('span');
  element.className = `fa-solid ${icon}`;
  element.setAttribute('aria-hidden', 'true');
  return element;
}
