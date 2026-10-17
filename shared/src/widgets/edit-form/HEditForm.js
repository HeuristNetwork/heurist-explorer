/**
 * @file HEditForm.js
 * @brief Generic edit form made from JSON (plan 14a): groups as tabs, accordion
 *        sections or fieldsets, one HEditField per field, show/hide by the values
 *        (`showWhen`), required and input checks, issues beside the fields and
 *        the values as JSON.
 *
 * The JSON is described in editFormSchema.js; the record editor uses the same
 * format (the record structure). Usage:
 *
 *   const form = new HEditForm().attach(host, { form: json, values, onReady, onChange });
 *   form.render();
 *   if (!form.validate().length) save(form.getValues());
 *
 * Events on the container: `h-edit-form-ready` {form} after render (the place to
 * change the form by code: showField, showGroup, updateField, getSlot), and
 * `h-edit-form-change` {form, name, value, dirty} after a value changed.
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
import { HEditField } from './HEditField.js';
import { applyFormLayout, FORM_GROUP_CLASS } from '../form/formLayout.js';
import {
  flatValues, formFields, formStates, formValues, isVisible, normalizeEditForm, stateToValue, valueToState
} from '../../data/editFormSchema.js';
import { $HR } from '../../ui/i18n/HResource.js';
import './HEditForm.css';

/** Edit form of a JSON definition. */
export class HEditForm extends HBaseWidget {
  /**
   * @param {HTMLElement} container Form host.
   * @param {object} options
   * @param {object} options.form Form JSON (editFormSchema.js) or a record edit structure.
   * @param {object} [options.values] Values (`getValues` shape); missing fields get their default.
   * @param {Map<string, object>} [options.states] Field states by name instead of `values` (record editor).
   * @param {'inline'|'above'|'auto'} [options.labelPos='auto'] Labels beside or above the inputs.
   * @param {'flow'|'stack'} [options.inputPos='stack'] One field per line, or side by side.
   * @param {boolean} [options.allowHidden=false] The "hidden from the public" switch of values.
   * @param {boolean} [options.readOnly] Display only.
   * @param {Object<string, object>} [options.specialEditors] Special field definitions (HEditField `special`)
   *        by the field's `special` id, its dty or its name.
   * @param {(field: object) => object} [options.specialContext] More properties of the special
   *        editors' context (the record editor adds the record).
   * @param {object} [options.apiClient] HeuristApiClient (record pointer fields).
   * @param {object} [options.dbdefs] HDbDefs (vocabularies).
   * @param {string[]} [options.languages] Languages of translations.
   * @param {Function} [options.selectExtent] Map extent picker of geo fields.
   * @param {Function} [options.fileUrl] Link to view a file of a file field.
   * @param {(form: HEditForm) => void} [options.onReady] After render (same as `h-edit-form-ready`).
   * @param {(form: HEditForm, change: {name: string, value: *}) => void} [options.onChange] After a value changed.
   * @param {(values: object, form: HEditForm) => Array<{field?: string, message: string}>|string|null} [options.validate]
   *        Checks over several fields, after the field checks.
   * @returns {HEditForm} This form.
   */
  attach(container, options = {}) {
    super.attach(container, options);
    const { form, warnings } = normalizeEditForm(options.form);
    this.form = form;
    this.warnings = warnings;
    this.fields = new Map(); // name -> HEditField
    this._hiddenFields = new Set(); // hidden by code (showField)
    this._hiddenGroups = new Set(); // hidden by code (showGroup)
    return this;
  }

  /** @returns {HEditForm} This form. */
  render() {
    if (!this.container) throw new Error('HEditForm must be attached before render');
    this._destroyFields();
    this.clearListeners();
    this.container.replaceChildren();
    this.container.classList.add('h-widget', 'h-edit-form');
    applyFormLayout(this.container, { labelPos: this.options.labelPos || 'auto', inputPos: this.options.inputPos || 'stack' });
    const states = this.options.states instanceof Map ? this.options.states : formStates(this.form, this.options.values || null);
    this._groups = new Map(); // id -> {group, element, tab, select}
    this._slots = new Map();
    this._reveal = new Map(); // name -> show its tab
    this._renderGroups(states);

    this.listen(this.container, 'h-input-change', (event) => this._onInputChange(event));
    this._applyVisibility();
    this._initial = this._snapshot();
    this.state = 'rendered';
    this.options.onReady?.(this);
    this._emit('h-edit-form-ready', { form: this });
    return this;
  }

  /**
   * The values of the shown fields: `{name: value}`, a list for a repeatable or
   * multilingual field, dotted names nested.
   *
   * @returns {object} Values.
   */
  getValues() {
    const shown = this._shownChecker();
    return formValues(this.form, this.getStates(), (field) => shown(field));
  }

  /** @returns {Map<string, {values: Array<object>, translations: Array<object>}>} State of every field by name. */
  getStates() {
    const states = new Map();
    for (const [name, widget] of this.fields) states.set(name, widget.getState());
    return states;
  }

  /**
   * Show other values (the form is made again; the issues are cleared).
   *
   * @param {object} values Values (`getValues` shape).
   * @returns {Promise<HEditForm>} This form.
   */
  async setValues(values) {
    this.options.values = values;
    this.options.states = null;
    await this._destroyFieldsAsync();
    return this.render();
  }

  /**
   * @param {string} name Field name.
   * @returns {*} The value of one field (as in getValues), also when it is not shown.
   */
  getValue(name) {
    const field = this.getField(name);
    const widget = this.fields.get(String(name));
    return field && widget ? stateToValue(field, widget.getState()) : undefined;
  }

  /**
   * Set the value of one field.
   *
   * @param {string} name Field name.
   * @param {*} value Value (as in getValues).
   * @returns {Promise<void>} Completion after the inputs are replaced.
   */
  async setValue(name, value) {
    const field = this.getField(name);
    const widget = this.fields.get(String(name));
    if (!field || !widget) return;
    await widget.setState(valueToState(field, value));
    this._afterChange(field.name);
  }

  /**
   * @param {string} name Field name.
   * @returns {object|null} The normalised field definition.
   */
  getField(name) {
    return formFields(this.form).find((field) => field.name === String(name)) || null;
  }

  /** @returns {HEditField|null} The widget of a field. */
  getFieldWidget(name) {
    return this.fields.get(String(name)) || null;
  }

  /**
   * @param {string} name Slot name of a group (`slot` in the JSON).
   * @returns {HTMLElement|null} The element the owner fills (previews, notes).
   */
  getSlot(name) {
    return this._slots?.get(String(name)) || null;
  }

  /**
   * Check the shown fields (required values, input formats, then the `validate`
   * option) and show the problems beside the fields.
   *
   * @returns {Array<{field: string, message: string}>} Problems; empty when the values can be used.
   */
  validate() {
    const problems = [];
    const shown = this._shownChecker();
    for (const field of formFields(this.form)) {
      const widget = this.fields.get(field.name);
      if (!widget) continue;
      const errors = shown(field) ? widget.validate() : [];
      for (const message of errors) problems.push({ field: field.name, message });
    }
    const extra = this.options.validate?.(this.getValues(), this);
    const more = typeof extra === 'string' && extra ? [{ field: '', message: extra }] : Array.isArray(extra) ? extra : [];
    problems.push(...more.map((problem) => ({ field: String(problem.field ?? ''), message: String(problem.message ?? '') })));
    this.setIssues(problems.map((problem) => ({ ...problem, severity: 'error' })));
    if (problems.length) this.revealField(problems.find((problem) => this.fields.has(problem.field))?.field);
    return problems;
  }

  /**
   * Show issues beside their fields (and clear the others).
   *
   * @param {Array<{field: string|number, index?: number, severity?: string, message: string}>} issues Issues.
   * @returns {Array<object>} The issues of no field of this form (the owner shows them).
   */
  setIssues(issues = []) {
    const byField = new Map();
    const other = [];
    for (const issue of issues || []) {
      const key = String(issue.field ?? '');
      if (!this.fields.has(key)) {
        other.push(issue);
        continue;
      }
      if (!byField.has(key)) byField.set(key, []);
      byField.get(key).push(issue);
    }
    for (const [name, widget] of this.fields) widget.setIssues(byField.get(name) || []);
    return other;
  }

  /** @returns {boolean} Whether a value changed since render. */
  isDirty() {
    return this.state === 'rendered' && this._snapshot() !== this._initial;
  }

  /** Take the current values as the unchanged state (after a save). */
  markClean() {
    this._initial = this._snapshot();
  }

  /**
   * Show or hide a field by code (besides its `showWhen`). A hidden field is not
   * checked and not in getValues.
   *
   * @param {string} name Field name.
   * @param {boolean} visible Shown.
   * @returns {void}
   */
  showField(name, visible) {
    if (visible) this._hiddenFields.delete(String(name));
    else this._hiddenFields.add(String(name));
    this._applyVisibility();
  }

  /**
   * Show or hide a group by code (besides its `showWhen`).
   *
   * @param {string} id Group id.
   * @param {boolean} visible Shown.
   * @returns {void}
   */
  showGroup(id, visible) {
    if (visible) this._hiddenGroups.delete(String(id));
    else this._hiddenGroups.add(String(id));
    this._applyVisibility();
  }

  /**
   * Change a field definition (label, required, read only, terms, help...) and
   * make its inputs again with the current values.
   *
   * @param {string} name Field name.
   * @param {object} patch Field properties (as in the JSON; `required: true|false` sets `req`).
   * @returns {Promise<void>} Completion after the field is rendered again.
   */
  async updateField(name, patch = {}) {
    const field = this.getField(name);
    const widget = this.fields.get(String(name));
    if (!field || !widget) return;
    const next = { ...patch };
    if ('required' in next) {
      next.req = next.required ? 'required' : 'optional';
      delete next.required;
    }
    if (Array.isArray(next.terms)) {
      next.terms = next.terms.map((term) => (term && typeof term === 'object'
        ? { id: term.id, label: String(term.label ?? term.id), depth: Number(term.depth) || 1 }
        : { id: term, label: String(term), depth: 1 }));
    }
    Object.assign(field, next);
    widget.field = this._displayField(field);
    await widget.setState(widget.getState());
    this._applyVisibility();
  }

  /**
   * Switch to the tab or open the accordion that holds a field, and scroll to it.
   *
   * @param {string} name Field name.
   * @returns {void}
   */
  revealField(name) {
    if (name === undefined || name === null) return;
    this._reveal.get(String(name))?.();
    const widget = this.fields.get(String(name));
    const details = widget?.container?.closest?.('details');
    if (details) details.open = true;
    widget?.container?.scrollIntoView?.({ block: 'nearest' });
  }

  /** @returns {Promise<void>} Completion after the inputs are removed. */
  async destroy() {
    await this._destroyFieldsAsync();
    await super.destroy();
  }

  // ----------------------------------------------------------------- render ---

  /**
   * Render the groups: runs of "tabs" groups as tab sets, "accordion" groups as
   * collapsible sections (the first one open), other groups as fieldsets.
   */
  _renderGroups(states) {
    const groups = this.form.groups;
    let firstAccordion = true;
    for (let index = 0; index < groups.length; index++) {
      const group = groups[index];
      if (group.type === 'tabs') {
        const run = [group];
        while (groups[index + 1]?.type === 'tabs') run.push(groups[++index]);
        this.container.append(this._renderTabs(run, states));
      } else if (group.type === 'accordion') {
        const details = document.createElement('details');
        details.className = 'h-edit-form-accordion';
        details.open = firstAccordion;
        firstAccordion = false;
        const summary = document.createElement('summary');
        summary.textContent = this._text(group.label) || '';
        details.append(summary, this._renderGroupFields(group, states));
        this.container.append(details);
        this._groups.set(group.id, { group, element: details });
      } else {
        const fieldset = document.createElement('fieldset');
        fieldset.className = 'h-edit-form-group';
        if (group.label) {
          const legend = document.createElement('legend');
          legend.textContent = this._text(group.label);
          fieldset.append(legend);
        }
        fieldset.append(this._renderGroupFields(group, states));
        this.container.append(fieldset);
        this._groups.set(group.id, { group, element: fieldset });
      }
    }
  }

  /** A tab set of consecutive "tabs" groups. */
  _renderTabs(groups, states) {
    const element = document.createElement('div');
    element.className = 'h-edit-form-tabs';
    const strip = document.createElement('div');
    strip.className = 'h-edit-form-tab-strip';
    strip.setAttribute('role', 'tablist');
    element.append(strip);
    const panels = [];
    const tabs = [];
    const select = (selected) => {
      for (const [position, panel] of panels.entries()) {
        const active = position === selected;
        panel.hidden = !active;
        tabs[position].classList.toggle('is-active', active);
        tabs[position].setAttribute('aria-selected', String(active));
      }
      run.selected = selected;
    };
    const run = { element, tabs, panels, select, selected: 0 };
    for (const [position, group] of groups.entries()) {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'h-edit-form-tab';
      tab.setAttribute('role', 'tab');
      tab.textContent = this._text(group.label) || `${position + 1}`;
      this.listen(tab, 'click', () => select(position));
      strip.append(tab);
      tabs.push(tab);
      const panel = this._renderGroupFields(group, states);
      panel.classList.add('h-edit-form-tab-panel');
      panel.setAttribute('role', 'tabpanel');
      element.append(panel);
      panels.push(panel);
      this._groups.set(group.id, { group, element: panel, tab, run, position });
      for (const field of group.children) this._reveal.set(field.name, () => select(position));
    }
    select(0);
    return element;
  }

  /** Fields of one group (and its slot). */
  _renderGroupFields(group, states) {
    const host = document.createElement('div');
    host.className = `h-edit-form-fields ${FORM_GROUP_CLASS}`;
    host.dataset.group = group.id;
    if (group.help) {
      const help = document.createElement('div');
      help.className = 'h-edit-field-help';
      help.textContent = this._text(group.help);
      host.append(help);
    }
    if (group.slot) {
      const slot = document.createElement('div');
      slot.className = 'h-edit-form-slot';
      slot.dataset.slot = group.slot;
      host.append(slot);
      this._slots.set(group.slot, slot);
    }
    for (const field of group.children) {
      const fieldHost = document.createElement('div');
      host.append(fieldHost);
      const widget = new HEditField().attach(fieldHost, {
        field: this._displayField(field),
        state: states.get(field.name) || states.get(field.dty) || valueToState(field, null),
        apiClient: this.options.apiClient,
        dbdefs: this.options.dbdefs,
        languages: this.options.languages || this.options.dbdefs?.translationLanguages?.() || this.options.dbdefs?.languages?.() || [],
        selectExtent: this.options.selectExtent,
        fileUrl: this.options.fileUrl,
        allowHidden: this.options.allowHidden === true,
        readOnly: this.options.readOnly,
        special: this._special(field),
        context: this._specialContext(field)
      }).render();
      this.fields.set(field.name, widget);
    }
    return host;
  }

  /** The field as shown: labels, help and term labels localized unless the JSON is. */
  _displayField(field) {
    if (this.form.localized) return field;
    return {
      ...field,
      label: this._text(field.label),
      help: this._text(field.help),
      patternMessage: this._text(field.patternMessage),
      terms: Array.isArray(field.terms) ? field.terms.map((term) => ({ ...term, label: this._text(term.label) })) : field.terms
    };
  }

  /** @returns {string} A text of the JSON in the interface language (unless `localized`). */
  _text(value) {
    const text = String(value ?? '');
    return text && !this.form.localized ? $HR(text) : text;
  }

  /** The special definition of a field: its own object, by `special` id, by dty or by name. */
  _special(field) {
    const editors = this.options.specialEditors || {};
    if (field.special && typeof field.special === 'object') return field.special;
    const found = (field.special != null ? editors[field.special] : null)
      || (field.dty ? editors[field.dty] : null) || editors[field.name] || null;
    if (found) return found;
    // a "special" field without an editor: the readable value and Show raw only
    return field.type === 'special' ? { json: false } : null;
  }

  /** Context of the special editors: other values of the form (a query editor also sets the filter form). */
  _specialContext(field) {
    return {
      field,
      form: this,
      getValue: (name) => this.fields.get(String(name))?.getValue() ?? null,
      setValue: (name, value) => this.fields.get(String(name))?.setValue(value),
      ...(this.options.specialContext?.(field) || {})
    };
  }

  // ------------------------------------------------------------------- state ---

  /** A value changed: visibility, then the owner. */
  _onInputChange(event) {
    const element = event.target?.closest?.('.h-edit-field');
    const name = element?.dataset?.name ?? event.detail?.field?.name ?? null;
    this._afterChange(name);
  }

  /** After a change of a field: show/hide by the values, events. */
  _afterChange(name) {
    this._applyVisibility();
    const value = name != null ? this.getValue(name) : undefined;
    this.options.onChange?.(this, { name, value });
    this._emit('h-edit-form-change', { form: this, name, value, dirty: this.isDirty() });
  }

  /** @returns {(field: object) => boolean} Whether a field is shown with the current values. */
  _shownChecker() {
    const flat = flatValues(this.form, this.getStates());
    const groupOf = new Map();
    for (const group of this.form.groups) for (const field of group.children) groupOf.set(field.name, group);
    return (field) => {
      const group = groupOf.get(field.name);
      if (group && (this._hiddenGroups.has(group.id) || !isVisible(group.showWhen, flat))) return false;
      return !this._hiddenFields.has(field.name) && isVisible(field.showWhen, flat);
    };
  }

  /** Show and hide fields and groups by `showWhen` and by code; a hidden active tab gives way. */
  _applyVisibility() {
    if (!this._groups) return;
    const flat = flatValues(this.form, this.getStates());
    for (const field of formFields(this.form)) {
      const widget = this.fields.get(field.name);
      if (widget?.container) widget.container.hidden = this._hiddenFields.has(field.name) || !isVisible(field.showWhen, flat);
    }
    const runs = new Set();
    for (const entry of this._groups.values()) {
      const hidden = this._hiddenGroups.has(entry.group.id) || !isVisible(entry.group.showWhen, flat);
      if (entry.tab) {
        entry.tab.hidden = hidden;
        entry.hidden = hidden;
        runs.add(entry.run);
      } else {
        entry.element.hidden = hidden;
      }
    }
    for (const run of runs) {
      const entries = [...this._groups.values()].filter((entry) => entry.run === run);
      const visible = entries.filter((entry) => !entry.hidden);
      run.element.hidden = visible.length === 0;
      if (visible.length && entries[run.selected]?.hidden) run.select(visible[0].position);
    }
  }

  /** @returns {string} The values of all fields, to tell a change. */
  _snapshot() {
    return JSON.stringify([...this.getStates()]);
  }

  /** Remove the field widgets (synchronous part; see _destroyFieldsAsync). */
  _destroyFields() {
    for (const widget of this.fields?.values() || []) void widget.destroy();
    this.fields = new Map();
  }

  /** @returns {Promise<void>} Completion after the field widgets are removed. */
  async _destroyFieldsAsync() {
    const widgets = [...(this.fields?.values() || [])];
    this.fields = new Map();
    for (const widget of widgets) await widget.destroy();
  }

  /** Dispatch a form event on the container. */
  _emit(type, detail) {
    this.container?.dispatchEvent(new CustomEvent(type, { bubbles: true, detail }));
  }
}

