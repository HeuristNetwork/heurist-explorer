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
 * gives a `special` definition) shows a readable value with two actions: "Show
 * raw" toggles a text area with the stored (JSON) value, "Edit" opens the special
 * editor of the host. A `json` field is the raw text area, checked as JSON.
 *
 * The field definition is a normalised field of editFormSchema.js (a record
 * structure field has the same properties).
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
import { showPopover, closePopover } from '../popover/popover.js';
import { $HR } from '../../ui/i18n/HResource.js';
import './HEditField.css';

/** Languages offered for translations when the host gives none (3-letter codes). */
export const DEFAULT_LANGUAGES = Object.freeze(['ENG', 'FRE', 'GER', 'SPA', 'ITA', 'POR', 'DUT', 'RUS', 'CHI', 'JPN', 'ARA']);

/** Field types without values to edit here. */
const NO_INPUT_TYPES = new Set(['relmarker', 'separator']);

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
   * @param {Function} [options.fileUrl] Link to view a file of a file field.
   * @param {boolean} [options.allowHidden=true] Show the "hidden from the public" switch.
   * @param {boolean} [options.readOnly] Display only (also `field.readOnly`).
   * @param {{json?: boolean, describe?: Function, edit?: Function, actions?: Array<object>}|null} [options.special] Special field:
   *        `describe(value, context)` readable text, `edit(value, context)` resolves with the new
   *        value (undefined: cancelled), `json` the raw value must be JSON; `actions`
   *        (`[{label, title?, primary?, run(value, context)}]`) several editors instead of `edit`,
   *        or `actionsFor(context)` returning them for the record (type) being edited.
   * @param {object} [options.context] Passed to `describe`/`edit`: `{field, getValue(name), setValue(name, value)}`.
   * @returns {HEditField} This field.
   */
  attach(container, options = {}) {
    super.attach(container, options);
    this.field = options.field;
    this._setEntries(options.state);
    this._rows = [];
    return this;
  }

  /** @returns {string} Name of the field in the form (the dty of a record field). */
  get name() {
    return String(this.field.name ?? this.field.dty);
  }

  /** @returns {boolean} Whether the field may have several values. */
  get isRepeatable() {
    return !this.field.multilang && (this.field.max === 0 || this.field.max > 1);
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
      for (const entry of this._entries) this._addRow(entry);
      this._renderActions();
    }

    this.translationsHost = null;
    if (field.multilang) {
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
    const values = this._rows
      // a drawn geometry brings its type (p, l, pl...); a stored one keeps its type
      .map((row) => ({
        ...row.entry,
        value: row.input.getValue(),
        hidden: row.entry.hidden,
        ...(row.input.geoType ? { geoType: row.input.geoType } : {})
      }))
      .filter((entry) => !isEmpty(entry.value));
    return { values, translations: this._translations.map((entry) => ({ ...entry })) };
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
    this._rows = [];
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
    row.input.setValue(value);
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
    if (field.req === 'required' && !NO_INPUT_TYPES.has(field.type) && !values.length) {
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
      const position = Number.isInteger(issue.index) && this._rows.length > 1 ? ` (${$HR('value')} ${issue.index + 1})` : '';
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
    this._rows = [];
    await super.destroy();
  }

  /** @returns {string} CSS width of the inputs ('' when the field has none; not for special fields). */
  _displayWidth() {
    return this.options.special || NO_INPUT_TYPES.has(this.field.type) ? '' : cssWidth(this.field.width);
  }

  /** Copy the values and translations of a state. */
  _setEntries(state) {
    const source = state || { values: [], translations: [] };
    this._entries = (source.values || []).map((entry) => ({ ...entry }));
    this._translations = (source.translations || []).map((entry) => ({ ...entry }));
  }

  /**
   * Add one value row. The input carries its value tools (plan 18): the remove /
   * clear icon (removes the value when the field has several, otherwise clears it)
   * and the "hidden from the public" eye; the field only answers their events.
   */
  _addRow(entry) {
    const row = { entry };
    row.element = document.createElement('div');
    row.element.className = 'h-edit-field-value';
    const host = document.createElement('div');
    host.className = 'h-edit-field-input';
    row.element.append(host);
    this.valuesHost.append(row.element);
    row.input = createHInput(inputType(this.field), host, this._inputOptions(entry));
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
    if (this.options.special) this._renderSpecial(row, host);
    row.removeButton = row.input.clearButton || null;
    row.hiddenButton = row.input.visibilityButton || null;
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
      if (row.hiddenButton) {
        row.hiddenButton.disabled = true;
        row.hiddenButton.hidden = !entry.hidden;
      }
    }
    this._rows.push(row);
    this._syncRows();
    return row;
  }

  /**
   * Special field: readable value, "Show raw" (the text input, hidden at first)
   * and "Edit" (the host's editor).
   */
  _renderSpecial(row, host) {
    const special = this.options.special;
    row.element.classList.add('is-special');
    const box = document.createElement('div');
    box.className = 'h-edit-field-special';
    row.summary = document.createElement('div');
    row.summary.className = 'h-edit-field-special-summary';
    const buttons = document.createElement('div');
    buttons.className = 'h-edit-field-special-buttons';
    const raw = document.createElement('button');
    raw.type = 'button';
    raw.className = 'h-btn h-btn-small h-i18n';
    raw.textContent = $HR('Show raw');
    buttons.append(raw);
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
      : (typeof special.edit === 'function' ? [{ label: 'Edit', primary: true, run: special.edit }] : []);
    if (!this.isReadOnly) {
      for (const action of actions) {
        if (typeof action?.run !== 'function') continue;
        const edit = document.createElement('button');
        edit.type = 'button';
        edit.className = `h-btn h-btn-small h-i18n${action.primary ? ' h-btn-primary' : ''}`;
        edit.textContent = $HR(action.label || 'Edit');
        if (action.title) edit.title = $HR(action.title);
        this.listen(edit, 'click', async () => {
          try {
            const next = await action.run(row.input.getValue(), this.options.context || {});
            if (next === undefined) return;
            row.input.setValue(next);
            this._syncSpecial(row);
            this._changed();
          } catch (error) {
            this.setIssues([{ severity: 'error', message: error?.message || String(error) }]);
          }
        });
        buttons.append(edit);
      }
    }
    box.append(row.summary, buttons);
    row.element.prepend(box);
    // the raw text: readable value again on change; JSON checked on blur
    this.listen(host, 'h-input-change', () => this._syncSpecial(row));
    this.listen(host, 'focusout', () => this._checkJson(row));
    this._syncSpecial(row);
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
  }

  /** Remove a value row (the last row only empties). */
  _removeRow(row) {
    if (this._rows.length === 1) {
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
      // also read only: the eye keeps its place (disabled, shown only for a hidden value)
      visibilityToggle: this.options.allowHidden !== false,
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
        return { ...options, multiline: true, rows: Math.min(12, Math.max(3, field.rows || field.height || 3)) };
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
          editRecord: this.options.editRecord,
          viewRecord: this.options.viewRecord
        };
      case 'file':
        return { ...options, file: entry.file || null, fileUrl: this.options.fileUrl };
      case 'geo':
        // extent: a bounding box; feature: a geometry (record values; drawing comes later)
        return {
          ...options,
          geoKind: field.geoKind === 'extent' ? 'extent' : 'feature',
          selectExtent: this.options.selectExtent,
          selectGeometry: this.options.selectGeometry
        };
      default:
        return options;
    }
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
      this.listen(translate, 'click', () => this._editTranslation(translate, null));
      this.actionButtons.push(translate);
    } else if (this.isRepeatable) {
      this.addButton = document.createElement('button');
      this.addButton.type = 'button';
      this.addButton.className = 'heurist-icon-button h-edit-field-add';
      this.addButton.append(iconElement('fa-plus'));
      this.addButton.title = $HR('Add a value');
      this.addButton.setAttribute('aria-label', this.addButton.title);
      this.listen(this.addButton, 'click', () => {
        const row = this._addRow({ value: null, hidden: false });
        row.input.control?.focus?.();
      });
      this.actionButtons.push(this.addButton);
    }
    this._syncRows();
  }

  /**
   * Remove icon: removes a value when there are several, clears the last one; Add and
   * Translate in front of the input of the first value only, the other values keep
   * their place (inputs aligned); no Add at the max values.
   */
  _syncRows() {
    const many = this._rows.length > 1;
    this.container?.classList.toggle('has-actions', (this.actionButtons || []).length > 0);
    for (const [index, row] of this._rows.entries()) {
      row.input.setRemovable?.(many);
      row.input.setActions?.(index === 0 ? this.actionButtons : null);
    }
    if (this.addButton) this.addButton.hidden = this.field.max > 0 && this._rows.length >= this.field.max;
  }

  /** Show the state of the "hidden from the public" switch. */
  _syncHidden(row) {
    const hidden = Boolean(row.entry.hidden);
    if (row.input.isValueHidden?.() !== hidden) row.input.setValueHidden?.(hidden);
    row.element.classList.toggle('is-hidden', hidden);
  }

  /** Language chips of the translations. */
  _renderTranslations() {
    if (!this.translationsHost) return;
    this.translationsHost.replaceChildren();
    for (const translation of this._translations) {
      const chip = document.createElement('span');
      chip.className = 'h-edit-field-translation';
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'h-edit-field-translation-text';
      const code = document.createElement('strong');
      code.textContent = String(translation.lang).toUpperCase();
      open.append(code, ` ${shorten(translation.value)}`);
      open.title = $HR('Edit translation');
      this.listen(open, 'click', () => this._editTranslation(open, translation));
      chip.append(open);
      if (!this.isReadOnly) {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'heurist-icon-button h-edit-field-translation-remove';
        remove.textContent = '×';
        remove.title = $HR('Remove translation');
        this.listen(remove, 'click', () => {
          this._translations = this._translations.filter((item) => item !== translation);
          this._renderTranslations();
          this._changed();
        });
        chip.append(remove);
      }
      this.translationsHost.append(chip);
    }
  }

  /**
   * Popup with a language and the translated value. A new translation when
   * `translation` is null.
   */
  _editTranslation(anchor, translation) {
    if (this.isReadOnly) return;
    const form = document.createElement('form');
    form.className = 'h-edit-field-translate-form';
    const languages = [...new Set([...(this.options.languages?.length ? this.options.languages : DEFAULT_LANGUAGES)]
      .map((code) => String(code).toUpperCase()))];
    const select = document.createElement('select');
    select.className = 'h-select';
    select.setAttribute('aria-label', $HR('Language'));
    const used = new Set(this._translations.filter((item) => item !== translation).map((item) => String(item.lang).toUpperCase()));
    const current = translation ? String(translation.lang).toUpperCase() : '';
    if (current && !languages.includes(current)) languages.unshift(current);
    for (const code of languages) {
      if (used.has(code)) continue;
      const option = document.createElement('option');
      option.value = code;
      option.textContent = code;
      select.append(option);
    }
    if (current) select.value = current;
    const text = document.createElement(this.field.type === 'blocktext' ? 'textarea' : 'input');
    text.className = 'h-input';
    if (this.field.type === 'blocktext') text.rows = 4;
    text.value = translation?.value ?? '';
    text.setAttribute('aria-label', $HR('Translated value'));
    const buttons = document.createElement('div');
    buttons.className = 'h-edit-field-translate-buttons';
    const ok = document.createElement('button');
    ok.type = 'submit';
    ok.className = 'h-btn h-btn-primary h-i18n';
    ok.textContent = $HR('OK');
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'h-btn h-i18n';
    cancel.textContent = $HR('Cancel');
    buttons.append(ok, cancel);
    form.append(select, text, buttons);
    const popover = showPopover(anchor, form, { className: 'h-edit-field-translate-popover' });
    cancel.addEventListener('click', () => popover.close());
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const value = String(text.value ?? '');
      if (!select.value || !value.trim()) { popover.close(); return; }
      if (translation) {
        translation.lang = select.value;
        translation.value = value;
      } else {
        this._translations.push({ lang: select.value, value, hidden: false });
      }
      popover.close();
      this._renderTranslations();
      this._changed();
    });
    setTimeout(() => text.focus?.(), 0);
  }

  /** Tell the form that a value changed (inputs send h-input-change themselves). */
  _changed() {
    this.container?.dispatchEvent(new CustomEvent('h-input-change', { bubbles: true, detail: { field: this.field } }));
  }
}

/** @returns {string} createHInput type of a field type. */
function inputType(field) {
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

/** A Font Awesome icon element. */
function iconElement(icon) {
  const element = document.createElement('span');
  element.className = `fa-solid ${icon}`;
  element.setAttribute('aria-hidden', 'true');
  return element;
}
