/**
 * @file HEditForm.js
 * @brief Generic edit form made from JSON (plan 14a): groups as tabs, accordion
 *        sections or fieldsets (inner groups inside them), one HEditField per field, show/hide by the values
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
 * `lazyGroups` (plan 23 §4.1, the record editor): the fields of a group get their
 * widgets only when the group is shown (its tab is active, its accordion open, it is
 * not hidden). Until then a field keeps its state; getStates, getValue, setValue,
 * validate and setIssues work without the widget (they make the group's widgets
 * when a field needs them), and getFieldWidget gives null. Event
 * `h-edit-form-group-rendered` {form, group} after the widgets of a group are made.
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
import { hasScriptOrStyle } from '../../data/storedTextPolicy.js';
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
   *        by the field's `special` id, its dty or its name. `hidden: true`: the field is not shown and
   *        not checked, its value is kept (another field's editor sets it, e.g. the filter form of a query).
   * @param {(field: object) => object} [options.specialContext] More properties of the special
   *        editors' context (the record editor adds the record).
   * @param {object} [options.apiClient] HeuristApiClient (record pointer fields).
   * @param {object} [options.dbdefs] HDbDefs (vocabularies).
   * @param {string[]} [options.languages] Languages of translations.
   * @param {Function} [options.selectExtent] Map extent picker of geo fields (geoKind extent).
   * @param {Function} [options.selectGeometry] Map drawing of geo fields (geoKind feature):
   *        `(wkt) → Promise<{type, wkt}|null>`; without it the extent picker is used.
   * @param {Function} [options.fileUrl] Link to view a file of a file field.
   * @param {Function} [options.editFile] Edit button of file fields (host file editor): `(id) → Promise<{saved, record}>`.
   * @param {{baseUrl: string, database: string}} [options.fileViewer] File fields: show the file below the input.
   * @param {Function} [options.editRecord] Edit button of pointer fields: `(id) → Promise<{saved, record}>`.
   * @param {Function} [options.viewRecord] View button of pointer fields: `(id)`.
   * @param {Function} [options.browseRecords] Browse of pointer fields (record manager, plan 21): `(options) → Promise<number[]|null>`.
   * @param {Function} [options.addRecord] Add of pointer fields (plan 21): `(rectypeId) → Promise<{saved, recordId}>`.
   * @param {object} [options.relationships] Relmarker fields (plan 22): the record editor's service, see HInputRelmarker.
   * @param {boolean} [options.lazyGroups=false] Widgets of a group only when it is first shown (plan 23).
   * @param {number} [options.valueLimit] Inputs made at once for a repeatable field (HEditField, plan 23).
   * @param {(form: HEditForm) => void} [options.onReady] After render (same as `h-edit-form-ready`).
   * @param {(form: HEditForm, change: {name: string, value: *}) => void} [options.onChange] After a value changed.
   * @param {(field: object) => {allowCode?: boolean, codeField?: boolean}} [options.textPolicy]
   *        Server-derived CMS exceptions; omitted means scripts and styles are not allowed.
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
    this._managedFields = new Set(); // special `hidden`: set by another field's editor, kept in the values
    return this;
  }

  /** @returns {HEditForm} This form. */
  render() {
    if (!this.container) throw new Error('HEditForm must be attached before render');
    this._destroyFields();
    this._managedFields = new Set();
    this.clearListeners();
    this.container.replaceChildren();
    this.container.classList.add('h-widget', 'h-edit-form');
    applyFormLayout(this.container, { labelPos: this.options.labelPos || 'auto', inputPos: this.options.inputPos || 'stack' });
    const states = this.options.states instanceof Map ? this.options.states : formStates(this.form, this.options.values || null);
    this._groups = new Map(); // id -> {group, element, tab, select}
    this._slots = new Map();
    this._reveal = new Map(); // name -> show its tab
    // lazy groups (plan 23): the states of fields without widgets, the groups not made yet
    this._states = new Map(states);
    this._pendingGroups = this.options.lazyGroups ? new Map() : null; // group id -> {group, host}
    this._lazyFields = new Map(); // name -> {stored, made}: fields made after render
    this._renderGroups(states);

    this.listen(this.container, 'h-input-change', (event) => this._onInputChange(event));
    this._applyVisibility();
    this._renderShownGroups();
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
    if (!this._pendingGroups) {
      for (const [name, widget] of this.fields) states.set(name, widget.getState());
      return states;
    }
    for (const field of formFields(this.form)) {
      const widget = this.fields.get(field.name);
      states.set(field.name, widget ? this._widgetState(field.name, widget) : this._storedState(field));
    }
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
    if (!field) return undefined;
    if (widget) return stateToValue(field, widget.getState());
    return this._pendingGroups ? stateToValue(field, this._storedState(field)) : undefined;
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
    if (!field || (!widget && !this._pendingGroups)) return;
    // a field without its widget (lazy group): its kept state
    if (widget) await widget.setState(valueToState(field, value));
    else this._states.set(field.name, valueToState(field, value));
    this._afterChange(field.name);
  }

  /**
   * @param {string} name Field name.
   * @returns {object|null} The normalised field definition.
   */
  getField(name) {
    return formFields(this.form).find((field) => field.name === String(name)) || null;
  }

  /** @returns {HEditField|null} The widget of a field (null for a field of a lazy group not shown yet). */
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
    // a required field without a value in a group not shown yet: its widgets are made to
    // check it and to show the problem (its value was loaded, only "required" can fail)
    for (const field of formFields(this.form)) {
      if (this._pendingGroups && !this.fields.has(field.name) && shown(field)
        && !this._managedFields.has(field.name) && isRequiredEmpty(field, this._storedState(field))) {
        this._renderGroupOf(field.name);
      }
    }
    for (const field of formFields(this.form)) {
      const widget = this.fields.get(field.name);
      if (!widget) continue;
      const errors = shown(field) && !this._managedFields.has(field.name) ? widget.validate() : [];
      for (const message of errors) problems.push({ field: field.name, message });
    }
    const extra = this.options.validate?.(this.getValues(), this);
    const more = typeof extra === 'string' && extra ? [{ field: '', message: extra }] : Array.isArray(extra) ? extra : [];
    problems.push(...more.map((problem) => ({ field: String(problem.field ?? ''), message: String(problem.message ?? '') })));
    this._clearViewFilterFor(problems.map((problem) => problem.field));
    const warnings = this._textWarnings(shown);
    this.validationIssues = [...problems.map((problem) => ({ ...problem, severity: 'error' })), ...warnings];
    this.setIssues(this.validationIssues);
    if (problems.length) this.revealField(problems.find((problem) => this.fields.has(problem.field))?.field);
    return problems;
  }

  /** Check every saved value, including translations and fields in unopened lazy groups. */
  _textWarnings(shown) {
    const warnings = [];
    const states = this.getStates();
    for (const field of formFields(this.form)) {
      if (!shown(field) || field.readOnly || this.options.readOnly) continue;
      const policy = this.options.textPolicy?.(field) || {};
      if (policy.allowCode || (field.type !== 'blocktext' && !policy.codeField)) continue;
      const state = states.get(field.name);
      const entries = [...(state?.values || []), ...(state?.translations || [])];
      if (!entries.some((entry) => policy.codeField ? String(entry.value ?? '').trim() : hasScriptOrStyle(entry.value))) continue;
      warnings.push({ field: field.name, severity: 'warning', code: 'html_sanitized',
        message: $HR('JavaScript and CSS are not allowed in this field and will be removed when saving.') });
    }
    return warnings;
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
    this._clearViewFilterFor((issues || []).map((issue) => String(issue.field ?? '')));
    // a field of a group not shown yet gets its widgets to show its issue
    for (const issue of issues || []) {
      const key = String(issue.field ?? '');
      if (this._pendingGroups && !this.fields.has(key) && this.getField(key)) this._renderGroupOf(key);
    }
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
   * Show only some fields (the Structure pane filters, plan 23): a view filter. Unlike
   * showField, the other fields stay in getValues and are checked; a group (tab) without
   * a shown field is hidden. A problem or an issue of a field filtered out clears the
   * filter (event `h-edit-form-view-filter-cleared`).
   *
   * @param {Iterable<string>|null} names Names of the fields to show; null: all.
   * @returns {void}
   */
  setViewFilter(names) {
    this._viewNames = names ? new Set([...names].map(String)) : null;
    this._applyVisibility();
  }

  /**
   * Show or hide the help texts of the fields (the Structure pane's "Show help"); the help
   * of a group stays.
   *
   * @param {boolean} shown Shown.
   * @returns {void}
   */
  setFieldHelpVisible(shown) {
    this.container?.classList.toggle('is-field-help-hidden', !shown);
  }

  /** A problem or issue of a field the view filter hides: all fields again. */
  _clearViewFilterFor(names) {
    if (!this._viewNames) return;
    if (!names.some((name) => this.getField(name) && !this._viewNames.has(String(name)))) return;
    this._viewNames = null;
    this._applyVisibility();
    this._emit('h-edit-form-view-filter-cleared', { form: this });
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
    // a field of a lazy group not shown yet: the definition changes, its widget is made with it
    if (!field || (!widget && !this._pendingGroups)) return;
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
    if (!widget) return;
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
    this._renderGroupOf(String(name));
    this._reveal.get(String(name))?.();
    const widget = this.fields.get(String(name));
    // every accordion around the field (an inner one in an outer one)
    for (let details = widget?.container?.closest?.('details'); details; details = details.parentElement?.closest?.('details')) {
      details.open = true;
    }
    // the accordions opened above may hold other groups not made yet
    this._renderShownGroups();
    widget?.container?.scrollIntoView?.({ block: 'nearest' });
  }

  /** @returns {Promise<void>} Completion after the inputs are removed. */
  async destroy() {
    await this._destroyFieldsAsync();
    await super.destroy();
  }

  // ----------------------------------------------------------------- render ---

  /**
   * Render the groups: an outer group with the inner groups after it is one
   * section; runs of "tabs" sections are tab sets (`newTabs` starts another one),
   * "accordion" sections are collapsible (open by `open`, default the first one),
   * other sections are fieldsets.
   */
  _renderGroups(states) {
    const sections = [];
    this._parentOf = new Map(); // inner group id -> outer group id
    for (const group of this.form.groups) {
      if (group.inner && sections.length) {
        sections.at(-1).inner.push(group);
        this._parentOf.set(group.id, sections.at(-1).group.id);
      } else {
        sections.push({ group, inner: [] });
      }
    }
    let firstAccordion = true;
    for (let index = 0; index < sections.length; index++) {
      const { group } = sections[index];
      if (group.type === 'tabs') {
        const run = [sections[index]];
        while (sections[index + 1]?.group.type === 'tabs' && !sections[index + 1].group.newTabs) run.push(sections[++index]);
        this.container.append(this._renderTabs(run, states));
      } else if (group.type === 'accordion') {
        const details = this._accordion(group, group.open ?? firstAccordion);
        firstAccordion = false;
        details.append(this._renderSection(sections[index], states));
        this.container.append(details);
        this._groups.set(group.id, { group, element: details });
      } else {
        const fieldset = document.createElement('fieldset');
        fieldset.className = 'h-edit-form-group';
        if (group.explanation) fieldset.classList.add('is-explanation');
        if (group.label) {
          const legend = document.createElement('legend');
          legend.textContent = this._text(group.label);
          fieldset.append(legend);
        }
        fieldset.append(this._renderSection(sections[index], states));
        this.container.append(fieldset);
        this._groups.set(group.id, { group, element: fieldset });
      }
    }
  }

  /** A tab set of consecutive "tabs" sections. */
  _renderTabs(sections, states) {
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
      // the widgets of a lazy group when its tab is first shown
      this._renderShownGroups();
    };
    const run = { element, tabs, panels, select, selected: 0 };
    for (const [position, section] of sections.entries()) {
      const { group } = section;
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'h-edit-form-tab';
      tab.setAttribute('role', 'tab');
      tab.textContent = this._text(group.label) || `${position + 1}`;
      this.listen(tab, 'click', () => select(position));
      strip.append(tab);
      tabs.push(tab);
      const panel = this._renderSection(section, states);
      panel.classList.add('h-edit-form-tab-panel');
      panel.setAttribute('role', 'tabpanel');
      element.append(panel);
      panels.push(panel);
      this._groups.set(group.id, { group, element: panel, tab, run, position });
      for (const member of [group, ...section.inner]) {
        for (const field of member.children) this._reveal.set(field.name, () => select(position));
      }
    }
    select(0);
    return element;
  }

  /** Fields of an outer group, then its inner groups. */
  _renderSection(section, states) {
    const host = this._renderGroupFields(section.group, states);
    for (const group of section.inner) host.append(this._renderInnerGroup(group, states));
    return host;
  }

  /** An inner group: a collapsible section, or a heading with its fields (legacy inner separators). */
  _renderInnerGroup(group, states) {
    let element;
    if (group.type === 'accordion') {
      element = this._accordion(group, group.open === true);
      element.classList.add('is-inner');
    } else {
      element = document.createElement('div');
      element.className = 'h-edit-form-subgroup';
      if (group.explanation) element.classList.add('is-explanation');
      if (group.label) {
        const heading = document.createElement('div');
        heading.className = 'h-edit-form-subgroup-heading';
        heading.textContent = this._text(group.label);
        element.append(heading);
      }
    }
    element.append(this._renderGroupFields(group, states));
    this._groups.set(group.id, { group, element });
    return element;
  }

  /** @returns {HTMLDetailsElement} A collapsible section with the group label. */
  _accordion(group, open) {
    const details = document.createElement('details');
    details.className = 'h-edit-form-accordion';
    details.open = open;
    const summary = document.createElement('summary');
    summary.textContent = this._text(group.label) || '';
    details.append(summary);
    // the widgets of a lazy group when the accordion is first opened
    if (this._pendingGroups) this.listen(details, 'toggle', () => { if (details.open) this._renderShownGroups(); });
    return details;
  }

  /** Fields of one group (and its slot). */
  _renderGroupFields(group, states) {
    const host = document.createElement('div');
    host.className = `h-edit-form-fields ${FORM_GROUP_CLASS}`;
    host.dataset.group = group.id;
    if (group.columns > 1) {
      host.classList.add('has-columns');
      host.style.setProperty('--h-edit-form-columns', String(group.columns));
    }
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
    // lazy groups: the field widgets when the group is first shown (_renderShownGroups)
    if (this._pendingGroups) this._pendingGroups.set(group.id, { group, host });
    else this._fillGroupFields(host, group, states);
    return host;
  }

  /** The widgets of the fields of one group, into its host. */
  _fillGroupFields(host, group, states) {
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
        selectGeometry: this.options.selectGeometry,
        editRecord: this.options.editRecord,
        viewRecord: this.options.viewRecord,
        browseRecords: this.options.browseRecords,
        addRecord: this.options.addRecord,
        relationships: this.options.relationships,
        fileUrl: this.options.fileUrl,
        editFile: this.options.editFile,
        fileViewer: this.options.fileViewer,
        allowHidden: this.options.allowHidden === true,
        readOnly: this.options.readOnly,
        valueLimit: this.options.valueLimit,
        special: this._special(field),
        context: this._specialContext(field)
      }).render();
      this.fields.set(field.name, widget);
      if (widget.options.special?.hidden === true) this._managedFields.add(field.name);
    }
  }

  // ------------------------------------------------------------ lazy groups ---

  /**
   * Make the widgets of the lazy groups now on screen: no hidden element (inactive tab,
   * hidden group) and no closed accordion between the group and the form.
   */
  _renderShownGroups() {
    if (!this._pendingGroups?.size) return;
    const shown = [...this._pendingGroups.keys()].filter((id) => this._isOnScreen(this._pendingGroups.get(id).host));
    for (const id of shown) this._renderPendingGroup(id);
    // the new fields follow showWhen; a field may show further groups
    if (shown.length) this._applyVisibility();
  }

  /** @returns {boolean} Whether an element of the form is not inside a hidden element or a closed accordion. */
  _isOnScreen(element) {
    for (let node = element; node && node !== this.container; node = node.parentElement) {
      if (node.hidden) return false;
      if (String(node.tagName).toUpperCase() === 'DETAILS' && !node.open) return false;
    }
    return true;
  }

  /** Make the widgets of the lazy group that holds a field (shown or not). */
  _renderGroupOf(name) {
    if (!this._pendingGroups?.size) return;
    for (const [id, { group }] of this._pendingGroups) {
      if (group.children.some((field) => field.name === name)) {
        this._renderPendingGroup(id);
        this._applyVisibility();
        return;
      }
    }
  }

  /** Make the widgets of one lazy group with the kept states. */
  _renderPendingGroup(id) {
    const entry = this._pendingGroups.get(id);
    if (!entry) return;
    this._pendingGroups.delete(id);
    const states = new Map(entry.group.children.map((field) => [field.name, this._storedState(field)]));
    this._fillGroupFields(entry.host, entry.group, states);
    for (const field of entry.group.children) {
      const widget = this.fields.get(field.name);
      // what the widget gives for the unchanged value (getStates keeps the stored state for it)
      if (widget) this._lazyFields.set(field.name, { stored: states.get(field.name), made: JSON.stringify(widget.getState()) });
    }
    this._emit('h-edit-form-group-rendered', { form: this, group: entry.group });
  }

  /** @returns {object} The kept state of a field without its widget. */
  _storedState(field) {
    return this._states.get(field.name) || this._states.get(String(field.dty)) || valueToState(field, null);
  }

  /**
   * State of a field widget. A widget made after render gives the kept state while its
   * value is unchanged: opening a tab is not a change (the inputs may write the same
   * value a little differently, e.g. a number as text).
   */
  _widgetState(name, widget) {
    const state = widget.getState();
    const lazy = this._lazyFields.get(name);
    if (!lazy) return state;
    if (JSON.stringify(state) === lazy.made) return lazy.stored;
    this._lazyFields.delete(name); // changed: the widget's state from now on
    return state;
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
      // also fields of lazy groups not shown yet (plan 23)
      getValue: (name) => this._contextValue(name),
      setValue: (name, value) => this._contextSetValue(name, value),
      hasField: (name) => this.fields.has(String(name)) || Boolean(this._pendingGroups && this.getField(name)),
      ...(this.options.specialContext?.(field) || {})
    };
  }

  /** First value of a field, for the special editors (as HEditField#getValue). */
  _contextValue(name) {
    const widget = this.fields.get(String(name));
    if (widget) return widget.getValue() ?? null;
    const field = this._pendingGroups ? this.getField(name) : null;
    return field ? this._storedState(field).values?.[0]?.value ?? null : null;
  }

  /** Replace the first value of a field, for the special editors (as HEditField#setValue). */
  _contextSetValue(name, value) {
    const widget = this.fields.get(String(name));
    if (widget) return widget.setValue(value);
    const field = this._pendingGroups ? this.getField(name) : null;
    if (!field) return undefined;
    const state = this._storedState(field);
    const values = [{ ...(state.values?.[0] || { hidden: false }), value }, ...(state.values || []).slice(1)];
    this._states.set(field.name, { ...state, values });
    this._afterChange(field.name);
    return undefined;
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
    const byId = new Map();
    for (const group of this.form.groups) {
      byId.set(group.id, group);
      for (const field of group.children) groupOf.set(field.name, group);
    }
    const hidden = (group) => Boolean(group) && (this._hiddenGroups.has(group.id) || !isVisible(group.showWhen, flat));
    return (field) => {
      const group = groupOf.get(field.name);
      if (hidden(group) || hidden(byId.get(this._parentOf?.get(group?.id)))) return false;
      return !this._hiddenFields.has(field.name) && isVisible(field.showWhen, flat);
    };
  }

  /** Show and hide fields and groups by `showWhen` and by code; a hidden active tab gives way. */
  _applyVisibility() {
    if (!this._groups) return;
    const flat = flatValues(this.form, this.getStates());
    // the view filter (setViewFilter): fields not in it, and groups without a field in it
    const view = this._viewNames || null;
    const outOfView = view ? this._groupsOutOfView(view) : null;
    for (const field of formFields(this.form)) {
      const widget = this.fields.get(field.name);
      if (widget?.container) {
        widget.container.hidden = this._managedFields.has(field.name) || this._hiddenFields.has(field.name)
          || !isVisible(field.showWhen, flat) || Boolean(view && !view.has(field.name));
      }
    }
    const runs = new Set();
    for (const entry of this._groups.values()) {
      const hidden = this._hiddenGroups.has(entry.group.id) || !isVisible(entry.group.showWhen, flat)
        || Boolean(outOfView?.has(entry.group.id));
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
    // a group shown by the values (showWhen) gets its widgets
    this._renderShownGroups();
  }

  /** @returns {Set<*>} Ids of the groups with no field of the view filter (an outer group: also none in its inner groups). */
  _groupsOutOfView(view) {
    const listed = new Set();
    for (const group of this.form.groups) {
      if (group.children.some((field) => view.has(field.name))) listed.add(group.id);
    }
    for (const [inner, outer] of this._parentOf || []) if (listed.has(inner)) listed.add(outer);
    return new Set(this.form.groups.map((group) => group.id).filter((id) => !listed.has(id)));
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

/**
 * Whether a required field has no value in a state (the "A value is required" check of
 * HEditField, for a field of a lazy group without its widget).
 *
 * @param {object} field Normalised field.
 * @param {{values?: Array<{value: *}>}} state Field state.
 * @returns {boolean}
 */
function isRequiredEmpty(field, state) {
  if (field.req !== 'required' || field.type === 'separator' || field.type === 'relmarker') return false;
  return !(state?.values || []).some((entry) => {
    const value = entry?.value;
    return !(value === null || value === undefined || value === '' || (Array.isArray(value) && !value.length));
  });
}
