/**
 * @file HRecordEditor.js
 * @brief Record editor of the new write API (plan 14 §6): ownership, the fields
 *        of the record type in groups (tabs, accordion or plain groups, as set by
 *        the separators of the record structure), save with the server's issues.
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
import { HRecordField } from './HRecordField.js';
import { HValueCombo } from '../picker/HValueCombo.js';
import { UserGroupSource } from '../../data/valueSources/localSources.js';
import { RecordEditClient, RecordEditError } from '../../data/RecordEditClient.js';
import { RecordStructureProvider } from '../../recordview/RecordStructureProvider.js';
import { buildRecordBody, defaultFieldValues, recordFieldValues } from '../../data/recordEditValues.js';
import { multilangFieldIds } from '../../data/writableRecordTypes.js';
import { nonStandardGroup, structureFields } from '../../data/recordEditStructure.js';
import { HCardinalLayout } from '../layout/HCardinalLayout.js';
import { applyFormLayout, FORM_GROUP_CLASS } from '../form/formLayout.js';
import { RecordRelationsProvider } from '../../recordview/RecordRelationsProvider.js';
import { buildLinkedFromSection, buildLinksRow } from '../../recordview/RecordViewRenderer.js';
import { HMsg } from '../../ui/HMsg.js';
import { $HR } from '../../ui/i18n/HResource.js';
import './HRecordEditor.css';

/** Non-owner visibility values and their labels. */
const VISIBILITY = [
  ['viewable', 'Logged-in users'],
  ['public', 'Public'],
  ['pending', 'Public, pending approval'],
  ['hidden', 'Owner only']
];

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
   * @param {object} [options.client] RecordEditClient (default: one over apiClient).
   * @param {object} [options.structureProvider] RecordStructureProvider (shared cache).
   * @param {string[]} [options.languages] Language codes offered for translations.
   * @param {Function} [options.selectExtent] Map extent picker of geo fields.
   * @param {Function} [options.fileUrl] Link to view a file of a file field.
   * @param {Object<number, object>} [options.specialEditors] Special fields by field id: `{json, describe, edit}`
   *        (see HRecordField); `describe` and `edit` get `{field, record, getValue(dty), setValue(dty, value)}`.
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
    this.fields = new Map();
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
    // values of fields the structure does not have: last group (a copy: the structure is cached)
    const extra = nonStandardGroup(this.record, structure, this.dbdefs, $HR('Non-standard fields'));
    this.structure = extra ? { ...structure, groups: [...structure.groups, extra] } : structure;
    this.render();
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
    // labels inline / above, fields stacked / side by side (plan 18)
    applyFormLayout(this.body, { labelPos: this.options.labelPos || 'auto', inputPos: this.options.inputPos || 'stack' });
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
    this._fieldWidgets = new Map();
    this._tabButtons = new Map(); // field dty -> tab button of its group
    this._renderGroups(values);

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
    for (const [dty, widget] of this._fieldWidgets || []) fields.set(dty, widget.getState());
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
    const problems = [];
    for (const [dty, widget] of this._fieldWidgets || []) {
      const errors = widget.validate();
      widget.setIssues(errors.map((message) => ({ severity: 'error', message })));
      for (const message of errors) problems.push({ field: String(dty), message });
    }
    this._showMessages(problems.length ? [{ severity: 'error', message: $HR('Please correct the marked fields') }] : []);
    if (problems.length) this._revealField(problems[0].field);
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
    for (const widget of this._fieldWidgets?.values() || []) await widget.destroy();
    for (const combo of this._combos || []) await combo.destroy();
    this._fieldWidgets = new Map();
    this._combos = [];
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
    section('Linked records', true, (body) => this._renderLinkedRecords(body));
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
    if (this.isNew) {
      body.append(note($HR('Save the record to see its links')));
      return;
    }
    body.append(note($HR('Loading…')));
    const provider = new RecordRelationsProvider({ apiClient: this.options.apiClient, dbDefsProvider: async () => this.dbdefs });
    const relmarkers = structureFields(this.structure).filter((field) => field.type === 'relmarker');
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

  /** Owner, visibility, view groups and edit groups. */
  _renderOwnership(header, { legend: withLegend = true } = {}) {
    const pane = document.createElement('fieldset');
    pane.className = 'h-record-editor-ownership';
    if (withLegend) {
      const legend = document.createElement('legend');
      legend.className = 'h-i18n';
      legend.textContent = $HR('Ownership and access');
      pane.append(legend);
    }
    this._combos = [];

    const row = (label, control) => {
      const item = document.createElement('div');
      item.className = 'h-record-editor-ownership-row';
      const caption = document.createElement('label');
      caption.className = 'h-i18n';
      caption.textContent = $HR(label);
      item.append(caption, control);
      pane.append(item);
      return item;
    };

    const ownerHost = document.createElement('div');
    row('Owner', ownerHost);
    this.ownerCombo = this._combo(ownerHost, ownerSource(this.dbdefs), header.owner, false);

    this.visibilitySelect = document.createElement('select');
    this.visibilitySelect.className = 'h-select';
    for (const [value, label] of VISIBILITY) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = $HR(label);
      this.visibilitySelect.append(option);
    }
    this.visibilitySelect.value = header.visibility;
    this.visibilitySelect.disabled = Boolean(this.options.readOnly);
    this.listen(this.visibilitySelect, 'change', () => {
      this._syncViewGroups();
      this._onChange();
    });
    row('Visible to', this.visibilitySelect);

    const viewHost = document.createElement('div');
    this.viewGroupsRow = row('Only these groups', viewHost);
    this.viewGroupsCombo = this._combo(viewHost, new UserGroupSource(this.dbdefs), header.viewGroups, true);

    const editHost = document.createElement('div');
    row('Also editable by', editHost);
    this.editGroupsCombo = this._combo(editHost, new UserGroupSource(this.dbdefs), header.editGroups, true);

    this.ownershipIssues = document.createElement('div');
    this.ownershipIssues.className = 'h-record-field-issues';
    pane.append(this.ownershipIssues);
    this._syncViewGroups();
    return pane;
  }

  /** A value picker of users and groups. */
  _combo(host, source, value, multiple) {
    const combo = new HValueCombo().attach(host, {
      source,
      multiple,
      value,
      emptyLabel: multiple ? $HR('Nobody else') : $HR('Select…'),
      onChange: () => this._onChange()
    }).render();
    combo.setReadOnly(Boolean(this.options.readOnly));
    this._combos.push(combo);
    return combo;
  }

  /** Show the view groups only for "logged-in users" visibility. */
  _syncViewGroups() {
    if (this.viewGroupsRow) this.viewGroupsRow.hidden = this.visibilitySelect.value !== 'viewable';
  }

  /**
   * Render the groups of the structure: runs of "tabs" groups as tab sets,
   * "accordion" groups as collapsible sections (the first one open), other groups
   * as fieldsets.
   */
  _renderGroups(values) {
    const groups = this.structure.groups;
    let firstAccordion = true;
    for (let index = 0; index < groups.length; index++) {
      const group = groups[index];
      if (group.type === 'tabs') {
        const run = [group];
        while (groups[index + 1]?.type === 'tabs') run.push(groups[++index]);
        this.body.append(this._renderTabs(run, values));
      } else if (group.type === 'accordion') {
        const details = document.createElement('details');
        details.className = 'h-record-editor-accordion';
        details.open = firstAccordion;
        firstAccordion = false;
        const summary = document.createElement('summary');
        summary.textContent = group.label || '';
        details.append(summary, this._renderGroupFields(group, values));
        this.body.append(details);
      } else {
        const fieldset = document.createElement('fieldset');
        fieldset.className = 'h-record-editor-group';
        if (group.label) {
          const legend = document.createElement('legend');
          legend.textContent = group.label;
          fieldset.append(legend);
        }
        fieldset.append(this._renderGroupFields(group, values));
        this.body.append(fieldset);
      }
    }
  }

  /** A tab set of consecutive "tabs" groups. */
  _renderTabs(groups, values) {
    const element = document.createElement('div');
    element.className = 'h-record-editor-tabs';
    const strip = document.createElement('div');
    strip.className = 'h-record-editor-tab-strip';
    strip.setAttribute('role', 'tablist');
    element.append(strip);
    const panels = [];
    const select = (selected) => {
      for (const [position, panel] of panels.entries()) {
        const active = position === selected;
        panel.hidden = !active;
        strip.children[position].classList.toggle('is-active', active);
        strip.children[position].setAttribute('aria-selected', String(active));
      }
    };
    for (const [position, group] of groups.entries()) {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'h-record-editor-tab';
      tab.setAttribute('role', 'tab');
      tab.textContent = group.label || `${position + 1}`;
      this.listen(tab, 'click', () => select(position));
      strip.append(tab);
      const panel = this._renderGroupFields(group, values);
      panel.classList.add('h-record-editor-tab-panel');
      panel.setAttribute('role', 'tabpanel');
      element.append(panel);
      panels.push(panel);
      for (const field of group.children) this._tabButtons.set(String(field.dty), { tab, show: () => select(position) });
    }
    select(0);
    return element;
  }

  /** Fields of one group. */
  _renderGroupFields(group, values) {
    const host = document.createElement('div');
    host.className = `h-record-editor-fields ${FORM_GROUP_CLASS}`;
    if (group.help) {
      const help = document.createElement('div');
      help.className = 'h-record-field-help';
      help.textContent = group.help;
      host.append(help);
    }
    for (const field of group.children) {
      const fieldHost = document.createElement('div');
      host.append(fieldHost);
      const widget = new HRecordField().attach(fieldHost, {
        field,
        state: values.get(field.dty),
        apiClient: this.options.apiClient,
        dbdefs: this.dbdefs,
        // the database setting "Languages" (was: the languages of definition translations)
        languages: this.options.languages || this.dbdefs?.translationLanguages?.() || this.dbdefs?.languages?.() || [],
        selectExtent: this.options.selectExtent,
        fileUrl: this.options.fileUrl,
        readOnly: this.options.readOnly,
        special: this.options.specialEditors?.[field.dty] || null,
        context: this._specialContext(field)
      }).render();
      this._fieldWidgets.set(field.dty, widget);
    }
    return host;
  }

  // ------------------------------------------------------------------- state ---

  /** Values of other fields for special editors (a query editor also sets the filter form). */
  _specialContext(field) {
    return {
      field,
      record: this.record,
      rectypeId: this.rectypeId,
      getValue: (dty) => this._fieldWidgets.get(Number(dty))?.getValue() ?? null,
      setValue: (dty, value) => this._fieldWidgets.get(Number(dty))?.setValue(value)
    };
  }

  /** Ownership of the loaded record, or of a new record (owner: current user). */
  _initialHeader() {
    const record = this.record;
    if (!record) {
      return { owner: Number(this.dbdefs?.currentUserId?.()) || 0, visibility: 'viewable', viewGroups: [], editGroups: [] };
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
    if (!this.ownerCombo) return this._initialHeader();
    return {
      owner: Number(this.ownerCombo.getValue()) || 0,
      visibility: this.visibilitySelect.value,
      viewGroups: toIds(this.viewGroupsCombo.getValue()),
      editGroups: toIds(this.editGroupsCombo.getValue())
    };
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
    const byField = new Map();
    const other = [];
    const header = [];
    for (const issue of issues || []) {
      const key = String(issue.field ?? '');
      if (HEADER_FIELDS.has(key)) header.push(issue);
      else if (this._fieldWidgets.has(Number(key))) {
        if (!byField.has(key)) byField.set(key, []);
        byField.get(key).push(issue);
      } else other.push(issue);
    }
    for (const [dty, widget] of this._fieldWidgets) widget.setIssues(byField.get(String(dty)) || []);
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
    const first = [...byField.keys()][0];
    if (errors.length && first) this._revealField(first);
  }

  /** Show messages under the form. */
  _showMessages(messages) {
    this.messages.replaceChildren(...(messages || []).map((issue) => issueElement(issue)));
  }

  /** Switch to the tab or open the accordion that holds a field. */
  _revealField(dty) {
    this._tabButtons.get(String(dty))?.show();
    const widget = this._fieldWidgets.get(Number(dty));
    const details = widget?.container?.closest?.('details');
    if (details) details.open = true;
    widget?.container?.scrollIntoView?.({ block: 'nearest' });
  }

  /** Dispatch an editor event on the container. */
  _emit(type, detail) {
    this.container?.dispatchEvent(new CustomEvent(type, { bubbles: true, detail }));
  }
}

/** Owner choices: everyone, then groups and users. */
function ownerSource(dbdefs) {
  const users = new UserGroupSource(dbdefs);
  const everyone = { value: 0, label: $HR('Everyone (any logged-in user)') };
  return {
    async load() {
      const items = [everyone, ...users.items()];
      return { items, total: items.length, complete: true };
    },
    labelFor(value) {
      return Number(value) === 0 ? everyone.label : users.labelFor(value);
    }
  };
}

/** @returns {number[]} Positive ids of a picker value. */
function toIds(value) {
  return (Array.isArray(value) ? value : value == null ? [] : [value]).map(Number).filter((id) => id > 0);
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
function localTime(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const date = new Date(text.replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? text : `${text} (${date.toLocaleString()})`;
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
