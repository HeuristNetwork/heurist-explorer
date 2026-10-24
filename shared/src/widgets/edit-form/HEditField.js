/**
 * @file HEditField.js
 * @brief One field of an edit form (plan 14a; was HRecordField of plan 14 §6):
 *        label, the value inputs (several for a repeatable field), "hidden from
 *        the public" per value, translations of a multilingual field and the
 *        issues of a check or a save.
 *
 * The inputs are the shared HInput classes (createHInput) without their own
 * label. A repeatable field (max values 0 or more than 1) has an "add value"
 * button; a multilingual field has a Translate button instead, and its
 * translations are shown as language chips that open a small popup to edit them.
 *
 * A special field (query, filter form, expansion rules, symbology...: the host
 * gives a `special` definition) shows a readable value, then "Edit" (the special
 * editor of the host, with its icon and tooltip), "Show raw" (a small link shown on
 * mouse over, toggles a text area with the stored (JSON) value), clear and "hidden
 * from the public" (shown for a value, as the value tools of other fields). A `json` field is the raw text area, checked as JSON. A special
 * `list` field is a repeatable field edited as a whole (field codes of a Query Source):
 * one box, its raw text has one value per line.
 *
 * The field definition is a normalised field of editFormSchema.js (a record
 * structure field has the same properties).
 *
 * A repeatable field with more values than `valueLimit` makes the inputs of the
 * first ones only, then "Show all values (N)" (plan 23 §4.4); the other values stay
 * in the state (getState, validate) until they are shown.
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
import { createHInput } from '../form/inputs/createHInput.js';
import { FORM_FIELD_CLASS, FORM_LABEL_CLASS } from '../form/formLayout.js';
import { TermSource } from '../../data/valueSources/localSources.js';
import { cssWidth } from '../../data/editFormSchema.js';
import { closePopover } from '../popover/popover.js';
import { HMsg } from '../../ui/HMsg.js';
import { $HR } from '../../ui/i18n/HResource.js';
import './HEditField.css';

/** Languages offered for translations when the host gives none (3-letter codes). */
/** Translation dialogs opened (unique ids). */
let translateDialogCount = 0;

export const DEFAULT_LANGUAGES = Object.freeze(['ENG', 'FRE', 'GER', 'SPA', 'ITA', 'POR', 'DUT', 'RUS', 'CHI', 'JPN', 'ARA']);

/** Field types without values to edit here. */
const NO_INPUT_TYPES = new Set(['separator']);

/** Numeric field types (min / maxValue checks). */
const NUMERIC_TYPES = new Set(['integer', 'float', 'year']);

/** Text field types (maxLength / pattern checks). */
const TEXT_TYPES = new Set(['freetext', 'blocktext', 'url']);

/** Editor of the values of one field. */
export class HEditField extends HBaseWidget {
  /**
   * @param {HTMLElement} container Field host.
   * @param {object} options
   * @param {object} options.field Normalised field (editFormSchema.js) or record structure field.
   * @param {{values: Array<object>, translations: Array<object>}} [options.state] Initial values.
   * @param {object} [options.apiClient] HeuristApiClient (record pointer titles).
   * @param {object} [options.dbdefs] HDbDefs (vocabularies).
   * @param {string[]} [options.languages] Language codes offered for translations.
   * @param {Function} [options.selectExtent] Map extent picker of geo fields (host).
   * @param {Function} [options.selectGeometry] Map drawing of geo feature fields (host).
   * @param {Function} [options.editRecord] Edit the record of a pointer field (host): `(id) → {saved, record}`.
   * @param {Function} [options.viewRecord] View the record of a pointer field (host): `(id)`.
   * @param {Function} [options.browseRecords] Record manager of pointer fields (host, plan 21): `(options) → Promise<number[]|null>`.
   * @param {Function} [options.addRecord] New record of a pointer field (host, plan 21): `(rectypeId) → Promise<{saved, recordId}>`.
   * @param {Function} [options.fileUrl] Link to view a file of a file field.
   * @param {Function} [options.editFile] Edit button of file fields (host file editor): `(id) → Promise<{saved, record}>`.
   * @param {{baseUrl: string, database: string}} [options.fileViewer] File fields: show the file below the input.
   * @param {boolean} [options.allowHidden=true] Show the "hidden from the public" switch.
   * @param {boolean} [options.readOnly] Display only (also `field.readOnly`).
   * @param {{json?: boolean, list?: boolean, describe?: Function, edit?: Function, icon?: string, title?: string, actions?: Array<object>}|null} [options.special] Special field:
   *        `describe(value, context)` readable text, `edit(value, context)` resolves with the new
   *        value (undefined: cancelled), `icon` (Font Awesome class) and `title` (tooltip) of its
   *        Edit button, `json` the raw value must be JSON; `actions`
   *        (`[{label, icon?, title?, primary?, run(value, context)}]`) several editors instead of `edit`,
   *        or `actionsFor(context)` returning them for the record (type) being edited.
   * @param {object} [options.context] Passed to `describe`/`edit`: `{field, getValue(name), setValue(name, value)}`.
   * @param {object} [options.relationships] Relmarker fields (plan 22): the record editor's service
   *        (`ensureRecord`, `create`, `remove`, `load`, `fits`, `changed`); see HInputRelmarker.
   * @param {number} [options.valueLimit] Inputs made at once for a repeatable field (0: all; plan 23).
   * @returns {HEditField} This field.
   */
  attach(container, options = {}) {
    super.attach(container, options);
    this.field = options.field;
    this._setEntries(options.state);
    this._rows = [];
    this._pending = []; // values past valueLimit, without inputs yet
    this._moreLine = null;
    return this;
  }

  /** @returns {string} Name of the field in the form (the dty of a record field). */
  get name() {
    return String(this.field.name ?? this.field.dty);
  }

  /** @returns {boolean} Whether the field may have several values. */
  get isRepeatable() {
    return !this.field.multilang && !this.isList && (this.field.max === 0 || this.field.max > 1);
  }

  /**
   * Whether the relationships of a repeatable relmarker field are edited in the relations
   * mode of the record manager (one-to-many, plan 24): the service gives `manage`.
   *
   * @returns {boolean}
   */
  get isManagedRelmarker() {
    return this.field.type === 'relmarker' && this.isRepeatable && typeof this.options.relationships?.manage === 'function';
  }

  /** @returns {boolean} Whether the values are edited as one list (special `list`: one value per line). */
  get isList() {
    return this.options.special?.list === true;
  }

  /** @returns {boolean} Whether the values cannot be changed. */
  get isReadOnly() {
    return Boolean(this.options.readOnly || this.field.readOnly);
  }

  /** @returns {HEditField} This field. */
  render() {
    if (!this.container) throw new Error('HEditField must be attached before render');
    const field = this.field;
    this.clearListeners();
    this.container.replaceChildren();
    // a field of the form layout (labelPos / inputPos of the form, formLayout.js)
    this.container.className = `h-edit-field ${FORM_FIELD_CLASS}`;
    this.container.dataset.name = this.name;
    if (field.dty) this.container.dataset.dty = String(field.dty);
    this.container.classList.toggle('is-required', field.req === 'required');
    // display width (characters or a CSS length, any input type): the input, and in flow
    // mode the whole card (HEditField.css)
    const width = this._displayWidth();
    this.container.classList.toggle('has-display-width', Boolean(width));
    if (width) this.container.style.setProperty('--h-field-width', width);
    else this.container.style.removeProperty?.('--h-field-width');
    // label colour and weight by requirement (plan 18): required, recommended, optional
    this.container.classList.toggle('is-recommended', field.req === 'recommended');

    const header = document.createElement('div');
    header.className = `h-edit-field-header ${FORM_LABEL_CLASS}`;
    const label = document.createElement('label');
    label.className = 'h-edit-field-label';
    label.textContent = field.label;
    header.append(label);
    this.labelElement = label;
    // Add a value / Translate: after the input of the last value (HInput#setActions, plan 18)
    this.actionButtons = [];
    this.addButton = null;
    this.container.append(header);

    this.valuesHost = document.createElement('div');
    this.valuesHost.className = 'h-edit-field-values';
    this.container.append(this.valuesHost);

    if (NO_INPUT_TYPES.has(field.type)) {
      const note = document.createElement('div');
      note.className = 'h-edit-field-note h-i18n';
      note.textContent = $HR('Relationships are not edited in this editor yet');
      this.valuesHost.append(note);
    } else {
      if (!this._entries.length) this._entries.push({ value: null, hidden: false });
      const limit = this._valueLimit();
      const shown = limit && this._entries.length > limit ? this._entries.slice(0, limit) : this._entries;
      this._pending = this._entries.slice(shown.length);
      this._moreLine = null;
      for (const entry of shown) this._addRow(entry);
      this._renderMore();
      this._renderActions();
    }

    this.translationsHost = null;
    this._translationRows = [];
    if (field.multilang) {
      // the translations: values of their own with the language code (plan 25)
      this.translationsHost = document.createElement('div');
      this.translationsHost.className = 'h-edit-field-translations';
      this.container.append(this.translationsHost);
      this._renderTranslations();
    }

    if (field.help) {
      const help = document.createElement('div');
      help.className = 'h-edit-field-help';
      help.textContent = field.help;
      this.container.append(help);
    }
    this.issuesHost = document.createElement('div');
    this.issuesHost.className = 'h-edit-field-issues';
    this.container.append(this.issuesHost);
    this.state = 'rendered';
    return this;
  }

  /**
   * Current values.
   *
   * @returns {{values: Array<{value: *, hidden: boolean, geoType?: string}>, translations: Array<object>}}
   */
  getState() {
    // a drawn geometry brings its type (p, l, pl...); a stored one keeps its type
    const entryOf = (row) => ({
      ...row.entry,
      value: row.input.getValue(),
      hidden: row.entry.hidden,
      ...(row.input.geoType ? { geoType: row.input.geoType } : {}),
      // a relmarker value: the relationship shown (created or changed in the input)
      ...(row.input.getRelation ? { relation: row.input.getRelation() } : {})
    });
    // the stored order: shown values, values not shown yet, then the added ones
    const values = [
      ...this._rows.filter((row) => !row.added).map(entryOf),
      ...this._pending.map((entry) => ({ ...entry })),
      ...this._rows.filter((row) => row.added).map(entryOf)
    ].filter((entry) => !isEmpty(entry.value));
    // a list field: one value per line of its text
    const listed = this.isList
      ? values.flatMap((entry) => listLines(entry.value).map((value) => ({ value, hidden: false })))
      : values;
    return { values: listed, translations: this._translationState() };
  }

  /**
   * Replace all values and translations (the inputs are made again).
   *
   * @param {{values: Array<object>, translations?: Array<object>}} state New state.
   * @returns {Promise<void>} Completion after the inputs are replaced.
   */
  async setState(state) {
    closePopover();
    for (const row of this._rows) await row.input.destroy();
    for (const row of this._translationRows || []) await row.input.destroy();
    this._rows = [];
    this._translationRows = [];
    this._setEntries(state);
    if (this.container) this.render();
  }

  /** @returns {*} First value of the field (null when empty). */
  getValue() {
    return this.getState().values[0]?.value ?? null;
  }

  /**
   * Replace the first value (special editors change related fields this way).
   *
   * @param {*} value New value.
   * @returns {void}
   */
  setValue(value) {
    const row = this._rows[0];
    if (!row) return;
    row.input.setValue(this.isList && Array.isArray(value) ? value.join('\n') : value);
    this._syncSpecial(row);
    this._changed();
  }

  /**
   * Check the values: a required field needs one, and every input its own rules
   * (number range, text length and pattern, JSON).
   *
   * @returns {string[]} Error messages.
   */
  validate() {
    const field = this.field;
    const errors = [];
    for (const row of this._rows) errors.push(...row.input.validate().map((message) => $HR(message)));
    const values = this.getState().values.map((entry) => entry.value);
    if (this.options.special?.json || field.type === 'json') {
      for (const value of values) {
        if (!isJson(String(value ?? '').trim())) errors.push($HR('The raw value is not valid JSON'));
      }
    }
    if (NUMERIC_TYPES.has(field.type)) {
      for (const value of values) {
        const number = Number(value);
        if (!Number.isFinite(number)) errors.push($HR('Enter a number'));
        else if (field.minValue !== null && field.minValue !== undefined && number < field.minValue) errors.push(`${$HR('The smallest value is')} ${field.minValue}`);
        else if (field.maxValue !== null && field.maxValue !== undefined && number > field.maxValue) errors.push(`${$HR('The largest value is')} ${field.maxValue}`);
      }
    }
    if (TEXT_TYPES.has(field.type) && !this.options.special) {
      const pattern = patternOf(field.pattern);
      for (const value of values) {
        const text = String(value ?? '');
        if (field.maxLength > 0 && text.length > field.maxLength) errors.push(`${$HR('At most this number of characters:')} ${field.maxLength}`);
        if (pattern && !pattern.test(text)) errors.push(field.patternMessage || $HR('The value has characters that are not allowed'));
      }
    }
    // not for relmarker: relationships can be added only after the first save of a record (plan 22)
    if (field.req === 'required' && !NO_INPUT_TYPES.has(field.type) && field.type !== 'relmarker' && !values.length) {
      errors.push($HR('A value is required'));
    }
    return [...new Set(errors)];
  }

  /**
   * Show the issues of a save (server) or of validate().
   *
   * @param {Array<{index?: number|null, severity?: string, message: string}>} issues Issues of this field.
   * @returns {void}
   */
  setIssues(issues = []) {
    if (!this.issuesHost) return;
    this.issuesHost.replaceChildren();
    const list = issues || [];
    this.container.classList.toggle('has-error', list.some((issue) => issue.severity !== 'warning'));
    this.container.classList.toggle('has-warning', list.length > 0 && list.every((issue) => issue.severity === 'warning'));
    for (const issue of list) {
      const item = document.createElement('div');
      item.className = `h-edit-field-issue is-${issue.severity === 'warning' ? 'warning' : 'error'}`;
      const position = Number.isInteger(issue.index) && this._valueCount() > 1 ? ` (${$HR('value')} ${issue.index + 1})` : '';
      item.textContent = String(issue.message || '') + position;
      this.issuesHost.append(item);
    }
  }

  /** Move the focus to the first value. */
  focus() {
    this._rows[0]?.input?.control?.focus?.();
  }

  /** @returns {Promise<void>} Completion after the inputs are removed. */
  async destroy() {
    closePopover();
    for (const row of this._rows) await row.input.destroy();
    for (const row of this._translationRows || []) await row.input.destroy();
    this._rows = [];
    this._translationRows = [];
    await super.destroy();
  }

  /** @returns {string} CSS width of the inputs ('' when the field has none; not for special fields). */
  _displayWidth() {
    return this.options.special || NO_INPUT_TYPES.has(this.field.type) || this.field.type === 'relmarker' ? '' : cssWidth(this.field.width);
  }

  /** Copy the values and translations of a state. */
  _setEntries(state) {
    const source = state || { values: [], translations: [] };
    this._entries = (source.values || []).map((entry) => ({ ...entry }));
    this._translations = (source.translations || []).map((entry) => ({ ...entry }));
    // a list field: all values in one text, one per line
    if (this.isList && this._entries.length) {
      const text = this._entries.map((entry) => String(entry.value ?? '').trim()).filter(Boolean).join('\n');
      this._entries = text ? [{ value: text, hidden: false }] : [];
    }
  }

  /**
   * Add one value row. The input carries its value tools (plan 18): the remove /
   * clear icon (removes the value when the field has several, otherwise clears it)
   * and the "hidden from the public" eye; the field only answers their events.
   */
  _addRow(entry, { before = null } = {}) {
    const row = { entry };
    row.element = document.createElement('div');
    row.element.className = 'h-edit-field-value';
    const host = document.createElement('div');
    host.className = 'h-edit-field-input';
    row.element.append(host);
    // before "Show all values" (or a given row); else at the end
    const anchor = before || this._moreLine;
    if (anchor) anchor.before(row.element);
    else this.valuesHost.append(row.element);
    row.input = createHInput(inputType(this.field, this.options.special), host, this._inputOptions(entry));
    if (this.field.maxLength > 0 && row.input.control && 'maxLength' in row.input.control) {
      row.input.control.maxLength = this.field.maxLength;
    }
    // the limits on the number spinner too (HInputNumeric sets them only for its sliders)
    if (NUMERIC_TYPES.has(this.field.type) && row.input.control?.type === 'number') {
      const range = numberRange(this.field);
      if (range.min !== undefined) row.input.control.min = String(range.min);
      if (range.max !== undefined) row.input.control.max = String(range.max);
      if (range.step !== undefined) row.input.control.step = String(range.step);
    }
    // display width of the input; the value tools come beside it
    const width = this._displayWidth();
    if (width) {
      host.classList.add('has-display-width');
      host.style.setProperty('--h-field-width', width);
    }
    // a special field has its own clear and visibility buttons
    if (this.options.special) this._renderSpecial(row, host);
    else {
      row.removeButton = row.input.clearButton || null;
      row.hiddenButton = row.input.visibilityButton || null;
    }
    this.listen(host, 'h-input-remove', (event) => {
      event.stopPropagation();
      this._removeRow(row);
    });
    this.listen(host, 'h-input-visibility-change', (event) => {
      event.stopPropagation();
      row.entry.hidden = event.detail?.hidden === true;
      this._syncHidden(row);
      this._changed();
    });
    if (row.hiddenButton) this._syncHidden(row);
    if (this.isReadOnly) {
      row.input.setReadOnly(true);
      // shown for a hidden value only (HInput#_syncClearButton, _syncSpecial)
      if (row.hiddenButton) row.hiddenButton.disabled = true;
      this._syncSpecial(row);
    }
    const index = before ? this._rows.findIndex((item) => item.element === before) : -1;
    if (index >= 0) this._rows.splice(index, 0, row);
    else this._rows.push(row);
    this._syncRows();
    return row;
  }

  /** @returns {number} Inputs made at once (0: all): `valueLimit` for a repeatable field. */
  _valueLimit() {
    const limit = Math.floor(Number(this.options.valueLimit));
    return this.isRepeatable && limit > 0 ? limit : 0;
  }

  /** @returns {number} Values of the field: with inputs and not shown yet. */
  _valueCount() {
    return this._rows.length + this._pending.length;
  }

  /** "Show all values (N)" after the inputs while some values have none. */
  _renderMore() {
    if (!this._pending.length) return;
    this._moreLine = document.createElement('div');
    this._moreLine.className = 'h-edit-field-more';
    const link = document.createElement('a');
    link.href = '#';
    link.textContent = `${$HR('Show all values')} (${this._valueCount()})`;
    this.listen(link, 'click', (event) => {
      event.preventDefault();
      this._showPending();
    });
    this._moreLine.append(link);
    this.valuesHost.append(this._moreLine);
  }

  /** Make the inputs of the values not shown yet, after the shown ones (before added values). */
  _showPending() {
    const pending = this._pending;
    this._pending = [];
    const before = this._rows.find((row) => row.added)?.element || null;
    for (const entry of pending) this._addRow(entry, { before });
    this._moreLine?.remove();
    this._moreLine = null;
    this._syncRows();
  }

  /**
   * Special field: readable value, "Edit" (the host's editors), "Show raw" (the text
   * input, hidden at first), clear and visibility.
   */
  _renderSpecial(row, host) {
    const special = this.options.special;
    row.element.classList.add('is-special');
    const box = document.createElement('div');
    box.className = 'h-edit-field-special';
    row.summary = document.createElement('div');
    row.summary.className = 'h-edit-field-special-summary';
    // Edit (the host's editors), Show raw, then clear and visibility (2026-10-18)
    const buttons = document.createElement('div');
    buttons.className = 'h-edit-field-special-buttons';
    const raw = document.createElement('button');
    raw.type = 'button';
    raw.className = 'h-input-raw-toggle h-i18n';
    raw.textContent = $HR('Show raw');
    raw.title = $HR('Show the stored value');
    host.hidden = true;
    this.listen(raw, 'click', () => {
      host.hidden = !host.hidden;
      raw.textContent = host.hidden ? $HR('Show raw') : $HR('Hide raw');
      raw.setAttribute('aria-expanded', String(!host.hidden));
    });
    // several editors (symbology: Style, Thematic maps), or the one Edit
    const listed = typeof special.actionsFor === 'function' ? special.actionsFor(this.options.context || {}) : special.actions;
    const actions = Array.isArray(listed)
      ? listed
      : (typeof special.edit === 'function' ? [{ label: 'Edit', icon: special.icon, title: special.title, primary: true, run: special.edit }] : []);
    if (!this.isReadOnly) {
      for (const action of actions) {
        if (typeof action?.run !== 'function') continue;
        const edit = document.createElement('button');
        edit.type = 'button';
        edit.className = `h-btn h-btn-small h-edit-field-special-edit${action.primary ? ' h-btn-primary' : ''}`;
        if (action.icon) edit.append(iconElement(action.icon));
        const caption = document.createElement('span');
        caption.className = 'h-i18n';
        caption.textContent = $HR(action.label || 'Edit');
        edit.append(caption);
        if (action.title) edit.title = $HR(action.title);
        this.listen(edit, 'click', async () => {
          try {
            const next = await action.run(row.input.getValue(), this.options.context || {});
            if (next === undefined) return;
            row.input.setValue(this.isList && Array.isArray(next) ? next.join('\n') : next);
            this._syncSpecial(row);
            this._changed();
          } catch (error) {
            this.setIssues([{ severity: 'error', message: error?.message || String(error) }]);
          }
        });
        buttons.append(edit);
      }
    }
    buttons.append(raw, ...this._specialTools(row));
    box.append(row.summary, buttons);
    row.element.prepend(box);
    // the raw text: readable value again on change; JSON checked on blur
    this.listen(host, 'h-input-change', () => this._syncSpecial(row));
    this.listen(host, 'focusout', () => this._checkJson(row));
    this._syncSpecial(row);
  }

  /**
   * Clear and "hidden from the public" of a special field (the raw text input has no
   * value tools): the same icons and behaviour as HInput's value tools.
   *
   * @returns {HTMLButtonElement[]} The buttons.
   */
  _specialTools(row) {
    const tools = [];
    if (this.field.clearable !== false || this.isRepeatable) {
      row.removeButton = toolButton('fa-xmark', 'h-form-input-clear');
      row.removeButton.title = $HR('Clear the value');
      row.removeButton.setAttribute('aria-label', row.removeButton.title);
      this.listen(row.removeButton, 'click', () => {
        this._removeRow(row);
        this._syncSpecial(row);
      });
      tools.push(row.removeButton);
    }
    if (this.options.allowHidden !== false) {
      row.hiddenButton = toolButton('fa-eye', 'h-form-input-visibility');
      this.listen(row.hiddenButton, 'click', () => {
        row.entry.hidden = !row.entry.hidden;
        this._syncHidden(row);
        this._changed();
      });
      tools.push(row.hiddenButton);
    }
    return tools;
  }

  /** Show a JSON error of a raw value at once (on blur). */
  _checkJson(row) {
    const json = this.options.special?.json || this.field.type === 'json';
    const text = String(row.input.getValue() ?? '').trim();
    this.setIssues(json && text && !isJson(text)
      ? [{ severity: 'error', message: $HR('The raw value is not valid JSON') }] : []);
  }

  /** Readable value of a special field. */
  _syncSpecial(row) {
    if (!row?.summary) return;
    const value = row.input.getValue();
    let text = '';
    if (value !== null && value !== undefined && String(value).trim() !== '') {
      try {
        text = this.options.special.describe?.(value, this.options.context || {}) || '';
      } catch {
        text = '';
      }
      if (!text) text = shorten(value);
    }
    row.summary.textContent = text || $HR('Not defined');
    row.summary.classList.toggle('is-empty', !text);
    // clear and visibility only for a value (read only: the eye of a hidden value only)
    const present = !isEmpty(value);
    if (row.removeButton) row.removeButton.hidden = !present || this.isReadOnly;
    if (row.hiddenButton) row.hiddenButton.hidden = !present || (this.isReadOnly && !row.entry.hidden);
  }

  /** Remove a value row (the last row only empties). */
  _removeRow(row) {
    if (this._valueCount() === 1) {
      row.input.setValue(null);
      row.entry.hidden = false;
      this._syncHidden(row);
    } else {
      void row.input.destroy();
      row.element.remove();
      this._rows = this._rows.filter((item) => item !== row);
    }
    this._syncRows();
    this._changed();
  }

  /** Options of the input of one value, by field type. */
  _inputOptions(entry) {
    const field = this.field;
    const options = { value: entry.value ?? null, suppressLabel: true, label: field.label };
    // raw (JSON) text of a special field: no value tools (it is shown on request only)
    if (this.options.special) return { ...options, multiline: true, rows: 6, clearButton: false };
    // a setting that always has a value: no clear button (and no value tools)
    if (field.clearable === false && !this.isRepeatable) {
      return { ...options, clearButton: false, readOnly: this.isReadOnly, ...this._typeOptions(entry) };
    }
    // remove / clear and the eye beside the input, the field's Add / Translate after them
    Object.assign(options, {
      valueTools: true,
      removable: false,
      // also read only: the eye keeps its place (disabled, shown only for a hidden value);
      // not for a relationship (plan 22)
      visibilityToggle: this.options.allowHidden !== false && field.type !== 'relmarker',
      valueHidden: entry.hidden === true,
      readOnly: this.isReadOnly
    });
    return { ...options, ...this._typeOptions(entry) };
  }

  /** Input options of the field type. */
  _typeOptions(entry) {
    const field = this.field;
    const options = {};
    switch (field.type) {
      case 'blocktext':
        return {
          ...options,
          multiline: true,
          rows: Math.min(12, Math.max(3, field.rows || field.height || 3)),
          // text / wysiwyg / codeeditor (plan 25); the CMS script and CSS fields: code only
          ...(this.options.richText ? { richText: this._richTextOptions() } : {})
        };
      case 'json':
        return { ...options, multiline: true, rows: Math.min(20, Math.max(3, field.rows || 6)) };
      case 'url':
        return { ...options, inputType: 'url' };
      case 'integer':
      case 'year':
        return { ...options, integer: true, ...numberRange(field) };
      case 'float':
        return { ...options, ...numberRange(field) };
      case 'date':
        return { ...options, allowLegacyText: true };
      case 'enum':
      case 'relationtype':
        return { ...options, ...this._choiceOptions() };
      case 'resource':
        return {
          ...options,
          apiClient: this.options.apiClient,
          targetTypes: field.targetTypes,
          valueLabel: entry.label || '',
          valueRectype: entry.rectype || null,
          // record type icon of the chosen record
          iconBase: this.options.fileViewer || null,
          editRecord: this.options.editRecord,
          viewRecord: this.options.viewRecord,
          // rst_PointerMode and the record manager (plan 21 §5)
          dbdefs: this.options.dbdefs,
          pointerMode: field.pointerMode || 'dropdown_add',
          browseFilter: field.browseFilter || '',
          showBrowse: true,
          browseRecords: typeof this.options.browseRecords === 'function'
            ? (request) => this._browsePointer(entry, request) : undefined,
          addRecord: this.options.addRecord
        };
      case 'file':
        return {
          ...options,
          // replace mode (a registered file's own content, plan 20 §10.11): the current file of the field
          file: entry.file || field.file || null,
          replace: field.replace === true,
          // the image of a user or group (plan 20 Phase 4d): changed at once
          entityImage: field.entityImage || null,
          fileUrl: this.options.fileUrl,
          apiClient: this.options.apiClient,
          editFile: this.options.editFile,
          // a click on the thumbnail shows the file below the input (plan 21)
          fileViewer: this.options.fileViewer || null,
          // the record manager of registered files (plan 21)
          browseRecords: this.options.browseRecords,
          fileRecordType: Number(this.options.dbdefs?.dbconst?.('RT_REGISTERED_FILE')) || 0
        };
      case 'relmarker':
        // relationships (plan 22): created and deleted by the input with the editor's service
        return {
          ...options,
          relation: entry.relation || null,
          field,
          relationships: this.options.relationships || null,
          // one-to-many (plan 24): the relationships are shown here, changed in the manager
          managed: this.isManagedRelmarker,
          apiClient: this.options.apiClient,
          dbdefs: this.options.dbdefs,
          iconBase: this.options.fileViewer || null,
          editRecord: this.options.editRecord,
          viewRecord: this.options.viewRecord,
          browseRecords: this.options.browseRecords,
          addRecord: this.options.addRecord
        };
      case 'geo':
        // extent: a bounding box; feature: a geometry (record values; drawing comes later)
        return {
          ...options,
          geoKind: field.geoKind === 'extent' ? 'extent' : 'feature',
          selectExtent: this.options.selectExtent,
          selectGeometry: this.options.selectGeometry
        };
      default:
        // a password field (a user account, plan 20 Phase 4d): the text is not shown
        return field.inputType === 'password' ? { ...options, inputType: 'password' } : options;
    }
  }

  /** Rich editors of this blocktext: the CMS script / CSS fields get the code editor only. */
  _richTextOptions() {
    const constant = (name) => Number(this.options.dbdefs?.dbconst?.(name)) || 0;
    const dty = Number(this.field.dty) || 0;
    const script = dty > 0 && dty === constant('DT_CMS_SCRIPT');
    const style = dty > 0 && dty === constant('DT_CMS_CSS');
    return { ...this.options.richText, codeOnly: script || style, codeLanguage: script ? 'javascript' : style ? 'css' : 'html' };
  }

  /**
   * Choices of an enum field: the static `terms` of the form, or the vocabulary of
   * the database. A unique choice among a few flat terms is an inline radio group
   * (plan 18) unless the field sets `mode`.
   */
  _choiceOptions() {
    const field = this.field;
    let choices;
    let items;
    if (Array.isArray(field.terms)) {
      const terms = field.terms.map((term) => ({ id: term.id, label: term.label, depth: term.depth || 1 }));
      // text ids stay text; numeric ids (a list of term ids) as numbers
      const numeric = terms.length > 0 && terms.every((term) => typeof term.id === 'number');
      choices = { terms, numeric };
      items = terms.map((term) => ({ ...term, depth: (term.depth || 1) - 1 }));
    } else {
      const source = new TermSource(this.options.dbdefs, field.vocabulary);
      choices = { source };
      items = source.items();
    }
    const mode = field.mode === 'radio' && this.isRepeatable ? 'select'
      : field.mode || (!this.isRepeatable && isSmallFlatVocabulary(items) ? 'radio' : 'select');
    return {
      ...choices,
      mode,
      ...(mode === 'radio' || mode === 'checkbox' ? { orientation: 'inline', radioStyle: 'standard', countsMode: 'none' } : {})
    };
  }

  /** Add button (repeatable) or Translate button (multilingual). */
  _renderActions() {
    this.actionButtons = [];
    if (this.isReadOnly) return;
    if (this.field.multilang) {
      const translate = document.createElement('button');
      translate.type = 'button';
      translate.className = 'heurist-icon-button h-edit-field-translate';
      translate.append(iconElement('fa-language'));
      translate.title = $HR('Add the value in another language');
      translate.setAttribute('aria-label', translate.title);
      this.listen(translate, 'click', () => void this._openTranslateDialog());
      this.actionButtons.push(translate);
    } else if (this.isManagedRelmarker) {
      // on its own line above the relationships (plan 24 review)
      const line = document.createElement('div');
      line.className = 'h-edit-field-manage-line';
      line.append(this._manageButton());
      this.valuesHost.prepend(line);
    } else if (this.isRepeatable) {
      this.addButton = document.createElement('button');
      this.addButton.type = 'button';
      this.addButton.className = 'heurist-icon-button h-edit-field-add';
      this.addButton.append(iconElement('fa-plus'));
      this.addButton.title = $HR('Add a value');
      this.addButton.setAttribute('aria-label', this.addButton.title);
      this.listen(this.addButton, 'click', () => {
        const row = this._addRow({ value: null, hidden: false });
        row.added = true;
        if (this.field.type === 'relmarker') {
          // a relationship: its popup at once; cancelled, the new row goes again
          void row.input.openAddDialog?.().then((created) => {
            if (!created && this._rows.includes(row) && this._rows.length > 1) this._removeRow(row);
          });
          return;
        }
        row.input.control?.focus?.();
      });
      this.actionButtons.push(this.addButton);
    }
    this._syncRows();
  }

  /**
   * "Manage relationships to <types>" (plan 24): the relations mode of the record manager;
   * then the field shows the relationships again.
   */
  _manageButton() {
    const field = this.field;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'h-btn h-btn-small h-edit-field-manage';
    const types = ((field.reverse ? field.sourceTypes : field.targetTypes) || []).map(Number).filter((id) => id > 0);
    const names = types.map((id) => this.options.dbdefs?.rectypeName?.(id) || `#${id}`).join(', ');
    const caption = document.createElement('span');
    caption.textContent = names
      ? `${$HR(field.reverse ? 'Manage relationships from' : 'Manage relationships to')} ${names}`
      : $HR('Manage relationships');
    button.append(iconElement('fa-circle-plus'), caption);
    button.title = caption.textContent;
    this.listen(button, 'click', async () => {
      if (button.disabled) return;
      button.disabled = true;
      try {
        const relations = await this.options.relationships.manage(field);
        if (!Array.isArray(relations)) return;
        await this.setState({ values: relations.map((relation) => ({ value: relation.relId, hidden: false, relation })), translations: [] });
        this.options.relationships.changed?.();
      } catch (error) {
        HMsg.showMsgErr(error?.message || String(error));
      } finally {
        button.disabled = false;
      }
    });
    return button;
  }

  /**
   * Remove icon: removes a value when there are several, clears the last one; Add and
   * Translate in front of the input of the first value only, the other values keep
   * their place (inputs aligned); no Add at the max values.
   */
  _syncRows() {
    const many = this._valueCount() > 1;
    this.container?.classList.toggle('has-actions', (this.actionButtons || []).length > 0);
    for (const [index, row] of this._rows.entries()) {
      row.input.setRemovable?.(many);
      row.input.setActions?.(index === 0 ? this.actionButtons : null);
    }
    if (this.addButton) this.addButton.hidden = this.field.max > 0 && this._valueCount() >= this.field.max;
  }

  /** Show the state of the "hidden from the public" switch. */
  _syncHidden(row) {
    const hidden = Boolean(row.entry.hidden);
    if (row.input.isValueHidden?.() !== hidden) row.input.setValueHidden?.(hidden);
    row.element.classList.toggle('is-hidden', hidden);
    // the eye of a special field (not a value tool of its input)
    if (row.summary && row.hiddenButton) {
      row.hiddenButton.replaceChildren(iconElement(hidden ? 'fa-eye-slash' : 'fa-eye'));
      row.hiddenButton.classList.toggle('is-hidden', hidden);
      row.hiddenButton.title = hidden ? $HR('Hidden from the public - click to show') : $HR('Visible to the public - click to hide');
      row.hiddenButton.setAttribute('aria-label', row.hiddenButton.title);
      row.hiddenButton.setAttribute('aria-pressed', String(hidden));
      this._syncSpecial(row);
    }
  }

  /** The translations as value rows, each with its language code (plan 25). */
  _renderTranslations() {
    if (!this.translationsHost) return;
    this.translationsHost.replaceChildren();
    this._translationRows = [];
    for (const translation of this._translations) this._addTranslationRow(translation);
  }

  /** @returns {Array<{lang: string, value: string, hidden: boolean}>} The translations (empty ones left out). */
  _translationState() {
    if (!this.translationsHost) return this._translations.map((entry) => ({ ...entry }));
    return this._translationRows
      .map((row) => ({ lang: row.entry.lang, value: row.input.getValue(), hidden: row.entry.hidden === true }))
      .filter((entry) => !isEmpty(entry.value));
  }

  /**
   * One translation: the text input of the field type with the language code before it,
   * the remove action and the "hidden from the public" eye.
   */
  _addTranslationRow(translation) {
    const row = { entry: { lang: String(translation.lang ?? '').toUpperCase(), hidden: translation.hidden === true } };
    row.element = document.createElement('div');
    row.element.className = 'h-edit-field-value h-edit-field-translation';
    const host = document.createElement('div');
    host.className = 'h-edit-field-input';
    row.element.append(host);
    this.translationsHost.append(row.element);
    row.input = createHInput(inputType(this.field, this.options.special), host, {
      ...this._inputOptions({ value: translation.value ?? '', hidden: row.entry.hidden }),
      langCode: row.entry.lang,
      removable: true
    });
    if (this.field.maxLength > 0 && row.input.control && 'maxLength' in row.input.control) {
      row.input.control.maxLength = this.field.maxLength;
    }
    const width = this._displayWidth();
    if (width) {
      host.classList.add('has-display-width');
      host.style.setProperty('--h-field-width', width);
    }
    this.listen(host, 'h-input-remove', (event) => {
      event.stopPropagation();
      void row.input.destroy();
      row.element.remove();
      this._translationRows = this._translationRows.filter((item) => item !== row);
      this._changed();
    });
    this.listen(host, 'h-input-visibility-change', (event) => {
      event.stopPropagation();
      row.entry.hidden = event.detail?.hidden === true;
      row.element.classList.toggle('is-hidden', row.entry.hidden);
      this._changed();
    });
    row.element.classList.toggle('is-hidden', row.entry.hidden);
    if (this.isReadOnly) row.input.setReadOnly(true);
    this._translationRows.push(row);
    return row;
  }

  /** Languages offered for a new translation: the configured ones without the used ones. */
  _freeLanguages() {
    const languages = [...new Set([...(this.options.languages?.length ? this.options.languages : DEFAULT_LANGUAGES)]
      .map((code) => String(code).toUpperCase()))];
    const used = new Set((this._translationRows || []).map((row) => row.entry.lang));
    return languages.filter((code) => !used.has(code));
  }

  /**
   * "Insert translated value" (port of the legacy dialog, plan 25): the language and a help
   * text; Translate (the first value with DeepL, when the server has a key), Insert blank,
   * Cancel. The new translation is a value row of its own.
   *
   * @returns {Promise<void>}
   */
  async _openTranslateDialog() {
    if (this.isReadOnly) return;
    const languages = this._freeLanguages();
    if (!languages.length) {
      HMsg.showMsgFlash?.($HR('The value is translated into all the languages'));
      return;
    }
    const first = String(this._rows[0]?.input.getValue() ?? '').trim();
    const translator = this.options.translator || null;
    const canTranslate = Boolean(translator?.available && first);
    const body = document.createElement('div');
    body.className = 'h-edit-field-translate-dialog';
    const label = document.createElement('label');
    label.className = 'h-edit-field-translate-language';
    const caption = document.createElement('span');
    caption.className = 'h-i18n';
    caption.textContent = $HR('Language');
    const select = document.createElement('select');
    select.className = 'h-select';
    for (const code of languages) {
      const option = document.createElement('option');
      option.value = code;
      option.textContent = code;
      select.append(option);
    }
    select.value = languages[0];
    label.append(caption, select);
    const help = document.createElement('p');
    help.className = 'h-edit-field-translate-help';
    help.textContent = canTranslate
      ? $HR('The first value is translated into the chosen language. To keep a part of the text as it is, enclose it in <span translate="no">...</span>.')
      : translator?.available
        ? $HR('Enter the first value to translate it automatically.')
        : $HR('To enable automatic translation please ask your system administrator to add a DeepL free or paid account API key.');
    body.append(label, help);
    const dialogId = `h-translate-dialog-${++translateDialogCount}`;
    const close = () => HMsg.closeMsgDlg(dialogId);
    const insert = (lang, value) => {
      const row = this._addTranslationRow({ lang, value, hidden: false });
      this._changed();
      row.input.control?.focus?.();
      return row;
    };
    const buttons = [];
    if (canTranslate) {
      buttons.push({
        label: $HR('Translate'),
        class: 'h-btn h-btn-primary',
        onClick: async () => {
          const target = select.value;
          help.textContent = $HR('Translating text...');
          try {
            const text = await translator.translate({ string: first, target });
            close();
            insert(target, text);
          } catch (error) {
            close();
            HMsg.showMsgErr(error?.message || String(error));
          }
        }
      });
    }
    buttons.push(
      {
        label: $HR('Insert blank'),
        class: canTranslate ? 'h-btn' : 'h-btn h-btn-primary',
        onClick: () => {
          const target = select.value;
          close();
          insert(target, '');
        }
      },
      { label: $HR('Cancel'), class: 'h-btn', onClick: close }
    );
    HMsg.showMsgDlg(body, { dialogId, title: $HR('Insert translated value'), buttons });
  }

  /** Tell the form that a value changed (inputs send h-input-change themselves). */
  _changed() {
    this.container?.dispatchEvent(new CustomEvent('h-input-change', { bubbles: true, detail: { field: this.field } }));
  }

  /**
   * Record manager of a pointer value (plan 21 §5, §9.5): a repeatable field with room
   * for more values selects several records; the first is this value, the others become
   * new values; records the field already has are skipped.
   *
   * @param {object} entry Entry of the value that asks.
   * @param {object} request Manager options of HInputResource.
   * @returns {Promise<number[]|null>} The record for this value, or null.
   */
  async _browsePointer(entry, request = {}) {
    const others = new Set([
      ...this._rows.filter((row) => row.entry !== entry).map((row) => Number(row.input.getValue())),
      // values not shown yet (valueLimit) are values of the field too
      ...this._pending.map((item) => Number(item.value))
    ].filter((id) => id > 0));
    const room = this.field.max > 0 ? this.field.max - this._valueCount() : Infinity;
    const multiple = this.isRepeatable && room > 0 && !this.isReadOnly;
    const ids = await this.options.browseRecords({ ...request, selectMode: multiple ? 'select_multi' : 'select' });
    const fresh = [...new Set((ids || []).map(Number))].filter((id) => id > 0 && !others.has(id));
    if (!fresh.length) return null;
    const [first, ...rest] = fresh;
    const added = multiple ? rest.slice(0, room) : [];
    for (const id of added) this._addRow({ value: id, hidden: false }).added = true;
    if (added.length) this._changed();
    return [first];
  }
}

/**
 * createHInput type of a field type. A date field has the temporal editor (Show raw,
 * Edit; plan 19) unless the field sets `temporal: false` or the host gives a special editor.
 *
 * @returns {string} Input type.
 */
export function inputType(field, special = null) {
  if (field.type === 'date' && field.temporal !== false && !special) return 'temporal';
  switch (field.type) {
    case 'freetext':
    case 'blocktext':
    case 'url':
    case 'integer':
    case 'float':
    case 'year':
    case 'date':
    case 'enum':
    case 'relationtype':
    case 'resource':
    case 'file':
    case 'geo':
    case 'boolean':
    case 'color':
    case 'relmarker':
      return field.type;
    default:
      return 'freetext';
  }
}

/** @returns {{min?: number, max?: number, step?: number}} Number input limits of a field (minValue / maxValue). */
function numberRange(field) {
  const range = {};
  if (field.minValue !== null && field.minValue !== undefined) range.min = field.minValue;
  if (field.maxValue !== null && field.maxValue !== undefined) range.max = field.maxValue;
  if (field.step) range.step = field.step;
  return range;
}

/** @returns {RegExp|null} Whole-value expression of a field pattern (null when invalid). */
function patternOf(pattern) {
  if (!pattern) return null;
  try {
    return new RegExp(`^(?:${pattern})$`, 'u');
  } catch {
    return null;
  }
}

/** @returns {string[]} The non-empty lines of a list field's text. */
function listLines(value) {
  return String(value ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

/** @returns {boolean} Whether a text is JSON. */
function isJson(text) {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/** @returns {boolean} Whether a value is empty. */
function isEmpty(value) {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '')
    || (Array.isArray(value) && value.length === 0);
}

/** @returns {string} Text cut for a chip. */
function shorten(value) {
  const text = String(value ?? '').replace(/<[^>]*>/g, '').trim();
  return text.length > 40 ? `${text.slice(0, 39)}…` : text;
}

/** Whether a vocabulary is a few terms without hierarchy (shown as radios): at most 5, one level. */
export function isSmallFlatVocabulary(items) {
  const list = Array.isArray(items) ? items : [];
  return list.length > 0 && list.length <= 5 && list.every((item) => !(item.depth > 0));
}

/** A value tool button (clear, visibility) of a special field, styled as HInput's (HInput.css). */
function toolButton(icon, className) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `heurist-icon-button h-form-input-tool ${className}`;
  button.append(iconElement(icon));
  return button;
}

/** A Font Awesome icon element. */
function iconElement(icon) {
  const element = document.createElement('span');
  element.className = `fa-solid ${icon}`;
  element.setAttribute('aria-hidden', 'true');
  return element;
}
