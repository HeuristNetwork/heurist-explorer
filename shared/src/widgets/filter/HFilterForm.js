/**
 * @file HFilterForm.js
 * @brief Shared runtime form for a parameterized Heurist query.
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
import { describeQueryParameters, resolveQueryParameters } from '../../data/queryParameters.js';
import { TermSource, UserGroupSource } from '../../data/valueSources/localSources.js';
import { FieldValueSource, FacetTermSource, fetchFieldRange } from '../../data/valueSources/FieldValueSource.js';
import './HFilterForm.css';

/** Presentations that pick from a list (plan §3). */
const LIST_MODES = new Set(['select', 'radio', 'checkbox']);
/** Header predicates whose values `detail=values` can list. */
const HEADER_VALUE_FIELDS = new Set(['owner', 'addedby', 'tag', 'access']);
/** Header predicates whose bounds `detail=minmax` can find. */
const HEADER_RANGE_FIELDS = new Set(['added', 'modified']);
/** Delay before other facets are recounted after a change. */
const FACET_REFRESH_DELAY = 300;

/**
 * Defaults of the form-wide list settings (`layout.settings`); the designer
 * stores only values that differ. Counts follow the legacy faceted search.
 */
export const FILTER_FORM_LIST_DEFAULTS = Object.freeze({
  listThreshold: 20,
  countsAlign: 'right',
  countsMode: 'badge'
});

/** Render a layout over Builder-defined query parameters. */
export class HFilterForm extends HBaseWidget {
  /** Create an unattached filter form. */
  constructor() {
    super();
    this.inputs = new Map();
  }

  /**
   * Attach a parameter definition and optional layout.
   *
   * @param {HTMLElement} container Form host.
   * @param {object} options Runtime form options.
   * @returns {HFilterForm} This form.
   */
  attach(container, options = {}) {
    super.attach(container, options);
    this.definition = options.definition || {};
    this.query = this.definition.query || this.definition.q || [];
    this.parameters = describeQueryParameters(this.query, options.dbdefs);
    this.values = { ...(options.values || {}) };
    // optional: facet counts and text value lists need the records API
    this.apiClient = options.apiClient || null;
    this._facetInputs = new Set();
    return this;
  }

  /**
   * Render the configured inputs and Filter/Reset actions.
   *
   * @returns {HFilterForm} This form.
   */
  render() {
    if (!this.container) throw new Error('HFilterForm must be attached before render');
    const parameters = this.parameters;
    const layout = this.definition.filterForm || defaultLayout(parameters);
    this.layout = layout;
    this._facetInputs = new Set();
    this._rangeRequests?.abort();
    this._rangeRequests = new AbortController();
    const companionInputs = new Set(Object.values(parameters)
      .map((parameter) => parameter.endInput).filter(Boolean));
    this.inputs.clear();
    this.defaults = {};
    this.container.replaceChildren();
    this.container.className = `h-widget h-filter-form h-filter-form-${layout.settings?.orientation === 'horizontal' ? 'horizontal' : 'vertical'}`;

    const form = document.createElement('form');
    form.noValidate = true;
    form.className = 'h-filter-form-body';

    for (const group of layout.groups || []) {
      if (group.hidden) continue;
      const section = document.createElement('section');
      section.className = 'h-filter-form-group';
      if (group.label) {
        const heading = document.createElement('h3');
        heading.className = 'h-i18n';
        heading.textContent = group.label;
        section.append(heading);
      }

      for (const child of group.children || []) {
        const id = child.input;
        if (companionInputs.has(id)) continue;
        const parameter = parameters[id];
        if (!parameter) throw new Error(`Unknown filter parameter: ${id}`);
        if (this.inputs.has(id)) throw new Error(`Filter parameter occurs twice: ${id}`);
        const config = child;
        // layout default: the initial value and the value Reset restores
        if (config.default != null && config.default !== '' && !parameter.range) this.defaults[id] = config.default;
        const host = document.createElement('div');
        host.className = 'h-filter-form-field';
        const presentation = this._presentation(id, parameter, config, layout);
        const settings = layout.settings || {};
        const widget = createHInput(presentation.type, host, {
          label: config.label || parameter.label || id,
          help: config.help || '',
          hierarchy: settings.showHierarchy ? (parameter.hierarchy || []).join(' > ') : '',
          // accordion: only radio/checkbox lists collapse; a picker or a single input would not gain anything
          collapsible: settings.accordion === true && presentation.type === 'enum'
            && ['radio', 'checkbox'].includes(presentation.options.mode ?? config.mode),
          countsMode: settings.countsMode || FILTER_FORM_LIST_DEFAULTS.countsMode,
          countsAlign: settings.countsAlign || FILTER_FORM_LIST_DEFAULTS.countsAlign,
          value: parameter.range ? {
            from: parameter.fixedValue?.from ?? this.values[id] ?? null,
            to: parameter.fixedValue?.to ?? this.values[parameter.endInput || id] ?? null
          } : this.values[id] ?? this.defaults[id] ?? null,
          fixedValue: parameter.fixedValue || null,
          required: Boolean(parameter.required),
          range: config.widget?.type === 'range' || parameter.range === true,
          rangeControl: config.widget?.control || 'direct',
          min: config.widget?.min,
          max: config.widget?.max,
          step: config.widget?.step,
          integer: parameter.integer === true,
          multiple: config.multiple === true,
          mode: config.mode || 'select',
          orientation: config.orientation || 'column',
          terms: this._termsFor(parameter),
          selectExtent: this.options.selectExtent,
          ...presentation.options
        });
        this.inputs.set(id, widget);
        this._requestSliderBounds(id, parameter, config, widget);
        section.append(host);
      }

      form.append(section);
    }

    const actions = document.createElement('div');
    actions.className = 'h-filter-form-actions';
    if (!this.options.preview) {
      // type="button", not "submit": a submit-type button makes the browser
      // treat it as the form's default control, so pressing Enter in a field
      // triggers the browser's own native implicit form submission (a
      // 'submit' event) *in addition to* our own per-input Enter handling
      // (HInput's commit-on-Enter, which already dispatches h-input-change).
      // Those two fire in separate tasks, so no amount of same-tick
      // debouncing coalesces them - the only reliable fix is to leave no
      // submit-type control in the form for the browser to invoke.
      const filter = button('Filter', 'h-btn h-btn-primary');
      filter.type = 'button';
      this.listen(filter, 'click', () => scheduleSubmit('button'));
      actions.append(filter);
    }
    const reset = button('Reset', 'h-btn');
    reset.type = 'button';
    this.listen(reset, 'click', () => this.reset());
    actions.append(reset);
    if (this.options.runtimeMode === 'main' && this.options.onOpenBuilder) {
      const builder = button('Builder', 'h-btn');
      builder.type = 'button';
      this.listen(builder, 'click', () => void this.options.onOpenBuilder());
      actions.append(builder);
    }
    if (this.options.onClose) {
      const close = button('Close', 'h-btn h-btn-primary');
      close.type = 'button';
      this.listen(close, 'click', () => this.options.onClose());
      actions.append(close);
    }
    form.append(actions);
    // trigger: 'input' (a committed value: blur or Enter) or 'button' (explicit Filter click)
    const submit = (trigger) => {
      const errors = this.validate();
      if (errors.length) {
        this._showErrors(errors);
        return false;
      }

      this._showErrors([]);
      const values = this.getValues();
      if (layout.settings?.skipEmptySearch && Object.values(values).every(isBlankValue)) {
        this._showErrors(['Enter at least one value to search']);
        return false;
      }
      const query = this.options.composeQuery?.(this.definition, values)
        ?? resolveQueryParameters(this.query, values, layout);
      this.options.onSubmit?.({ values, query, definition: this.definition, trigger });
      return true;
    };
    // Clicking Filter while a field still has focus blurs that field first,
    // committing an edited value via h-input-change, and the click's own
    // handler fires moments later. The browser can dispatch those as two
    // separate tasks (not just two listeners in one task), so a same-tick
    // microtask guard doesn't reliably coalesce them - it can drain and
    // reset between the two. A short wall-clock debounce does: every new
    // trigger restarts the timer, so anything landing within the window
    // (blur immediately followed by its own click) collapses into one call.
    this._submitTimer = null;
    let lastSubmitOk = false;
    const scheduleSubmit = (trigger) => {
      if (this._submitTimer === null) {
        lastSubmitOk = submit(trigger);
        this._submitTimer = setTimeout(() => {
          this._submitTimer = null;
        }, 500);
      }
      // An explicit Filter click is reported even when the debounce swallowed
      // it (blur-commit + click): hosts may hide the form only on this event.
      if (trigger === 'button' && lastSubmitOk) {
        this.container?.dispatchEvent(new CustomEvent('h-filter-form-apply', { bubbles: true }));
      }
    };
    // Defensive only: no control in this form has type="submit", so the
    // browser's native implicit form submission (Enter with no field
    // committing a change of its own) shouldn't reach this - but if it ever
    // does, still block navigation without submitting a second time.
    this.listen(form, 'submit', (event) => event.preventDefault());
    this.listen(form, 'h-input-change', (event) => {
      this._scheduleFacetRefresh(event.detail?.input);
      scheduleSubmit('input');
    });
    this.listen(form, 'h-input-error', (event) => {
      this._showErrors([event.detail?.error?.message || 'Input error']);
    });

    this.errors = document.createElement('div');
    this.errors.className = 'h-filter-form-errors';
    this.errors.setAttribute('role', 'alert');
    this.container.append(form, this.errors);
    this.state = 'rendered';
    return this;
  }

  /** @returns {object} Current values keyed by parameter ID. */
  getValues() {
    const values = {};
    for (const [id, input] of this.inputs) {
      const value = input.getValue();
      const endInput = this.parameters[id]?.endInput;
      if (endInput) { values[id] = value?.from ?? ''; values[endInput] = value?.to ?? ''; }
      else if (this.parameters[id]?.range) {
        values[id] = value?.[this.parameters[id].endpoint] ?? '';
      } else values[id] = value;
    }
    return values;
  }

  /**
   * Replace current values.
   *
   * @param {object} values Values by parameter ID.
   * @returns {HFilterForm} This form.
   */
  setValues(values = {}) {
    for (const [id, input] of this.inputs) {
      const endInput = this.parameters[id]?.endInput;
      const parameter = this.parameters[id];
      input.setValue(endInput ? { from: values[id] ?? null, to: values[endInput] ?? null }
        : parameter?.range ? { ...parameter.fixedValue, [parameter.endpoint]: values[id] ?? null }
          : values[id] ?? null);
    }
    return this;
  }

  /** @returns {string[]} Input validation errors. */
  validate() {
    const errors = [];
    for (const [id, input] of this.inputs) {
      for (const error of input.validate()) errors.push(`${id}: ${error}`);
    }
    return errors;
  }

  /** Reset inputs to their layout defaults (blank when none). */
  reset() {
    this.setValues({ ...this.defaults });
    this._scheduleFacetRefresh(null);
    this._showErrors([]);
    this.container?.dispatchEvent(new CustomEvent('h-filter-form-reset', { bubbles: true }));
  }

  /** @returns {Promise<void>} Completion after child cleanup. */
  async destroy() {
    this._rangeRequests?.abort();
    clearTimeout(this._submitTimer);
    clearTimeout(this._facetTimer);
    for (const input of this.inputs.values()) await input.destroy();
    this.inputs.clear();
    await super.destroy();
  }

  /**
   * Input type and value-list options for one parameter (plan §3):
   * - enum: the vocabulary, or with `facets` the terms that occur (with counts);
   * - text in a list mode: the field's values from the server (exact match, V12);
   * - owner/creator/bookmarked-by: visible users and groups (direct input for guests).
   *
   * @returns {{type: string, options: object}} createHInput type and extra options.
   */
  _presentation(id, parameter, config, layout) {
    const listThreshold = Number(layout.settings?.listThreshold) || FILTER_FORM_LIST_DEFAULTS.listThreshold;
    const selected = () => toList(this.inputs.get(id)?.getValue());
    const factory = this.options.valueSourceFactory;
    const custom = factory?.(parameter, { id, config, query: () => this._facetQuery(id), selected });

    if (parameter.type === 'enum' && !Array.isArray(parameter.terms)) {
      const vocabId = this.options.dbdefs?.vocabRoot?.(parameter.fieldId) || 0;
      const vocabulary = vocabId ? new TermSource(this.options.dbdefs, vocabId) : null;
      let source = custom || vocabulary;
      if (!custom && config.facets === true && this.apiClient && vocabulary && parameter.fieldId) {
        source = new FacetTermSource(this.options.dbdefs, vocabId, new FieldValueSource(this.apiClient, {
          query: () => this._facetQuery(id), field: parameter.fieldId, selected
        }), { selected });
        this._facetInputs.add(id);
      }
      return { type: 'enum', options: { ...(source ? { source, fallbackSource: vocabulary } : {}), listThreshold } };
    }

    if (parameter.type === 'text' && ['owner', 'addedby', 'user'].includes(parameter.predicate)) {
      const people = custom || new UserGroupSource(this.options.dbdefs, { groups: parameter.predicate === 'owner' });
      if (custom || (this.options.dbdefs?.hasUserGroups?.() && people.isAvailable())) {
        return { type: 'enum', options: { source: people, mode: config.mode || 'select', listThreshold } };
      }
      return { type: 'text', options: {} };
    }

    if (parameter.type === 'text' && LIST_MODES.has(config.mode)) {
      const field = parameter.fieldId || (HEADER_VALUE_FIELDS.has(parameter.predicate) ? parameter.predicate : null);
      const source = custom || (this.apiClient && field ? new FieldValueSource(this.apiClient, {
        query: () => this._facetQuery(id), field, sort: 'count', selected
      }) : null);
      if (source) {
        this._facetInputs.add(id);
        return { type: 'enum', options: { source, numeric: false, listThreshold } };
      }
      // no records API: the list cannot be built, so fall back to direct input
      return { type: 'text', options: { mode: 'direct' } };
    }

    return { type: inputType(parameter), options: {} };
  }

  /**
   * A slider without both bounds ("auto") asks the server for the field's
   * smallest and largest value over the form's query (other filled parameters
   * applied, this one left out) once, when the form renders. Until then, or
   * without the records API, the direct From/To inputs are shown alone.
   */
  _requestSliderBounds(id, parameter, config, widget) {
    const { control, min, max } = config.widget || {};
    if (control !== 'slider' || !parameter.range || !widget.setBounds || !this.apiClient) return;
    if (min != null && min !== '' && max != null && max !== '') return;
    const field = parameter.fieldId || (HEADER_RANGE_FIELDS.has(parameter.predicate) ? parameter.predicate : null);
    if (!field) return;
    const { signal } = this._rangeRequests;
    fetchFieldRange(this.apiClient, { query: this._facetQuery(id), field, signal })
      .then((range) => { if (!signal.aborted && range.count) widget.setBounds(range.min, range.max); })
      .catch((error) => {
        if (signal.aborted) return;
        widget.container?.dispatchEvent(new CustomEvent('h-input-error', { bubbles: true, detail: { input: widget, error } }));
      });
  }

  /**
   * Query that a facet of `id` counts over: the form's query with every other
   * filled parameter applied and `id` itself left out. A parameter inside a
   * linked sub-query counts over its record type only.
   *
   * @param {string} id Parameter ID.
   * @returns {Array} Resolved query.
   */
  _facetQuery(id) {
    const parameter = this.parameters[id];
    if (parameter?.nested) return parameter.recordTypeId ? [{ t: String(parameter.recordTypeId) }] : [];
    const values = this.inputs.size ? this.getValues() : { ...this.values };
    delete values[id];
    if (parameter?.endInput) delete values[parameter.endInput];
    return resolveQueryParameters(this.query, values, this.layout).q;
  }

  /** Recount the other facet inputs shortly after a value changed (V15). */
  _scheduleFacetRefresh(changedInput) {
    if (!this._facetInputs.size) return;
    clearTimeout(this._facetTimer);
    this._facetTimer = setTimeout(() => {
      for (const [id, input] of this.inputs) {
        if (input !== changedInput && this._facetInputs.has(id)) void input.refresh?.();
      }
    }, FACET_REFRESH_DELAY);
  }

  /** @returns {Array<object>} Terms for an enum parameter. */
  _termsFor(parameter) {
    if (Array.isArray(parameter.terms)) return parameter.terms;
    const dbdefs = this.options.dbdefs;
    const root = dbdefs?.vocabRoot?.(parameter.fieldId);
    if (!root) return [];
    const terms = [];
    const visit = (term, depth) => {
      if (depth) terms.push({ ...term, depth });
      for (const child of term.children || []) visit(child, depth + 1);
    };
    visit(dbdefs.termTree(root), 0);
    return terms;
  }

  /** Show or clear validation errors. */
  _showErrors(errors) {
    if (this.errors) this.errors.textContent = errors.join('; ');
  }
}

/** @returns {object} Basic layout for every defined parameter. */
export function defaultLayout(parameters = {}) {
  return {
    version: 1,
    groups: [{ id: 'main', type: 'section', children: Object.keys(parameters)
      .filter((input) => !Object.values(parameters).some((parameter) => parameter.endInput === input))
      .map((input) => ({ input })) }]
  };
}

/** @returns {string} Shared input type for a parameter. */
function inputType(parameter) {
  return { number: 'numeric', term: 'enum', bool: 'enum', record: 'text' }[parameter.type]
    || parameter.type || 'text';
}

/** @returns {Array<*>} A value as a list of non-blank values. */
function toList(value) {
  const list = Array.isArray(value) ? value : [value];
  return list.filter((item) => item != null && item !== '');
}

/** @returns {boolean} True when a form value is empty (no criterion). */
function isBlankValue(value) {
  if (value == null || value === '') return true;
  return Array.isArray(value) && value.length === 0;
}

/** @returns {HTMLButtonElement} A localizable action button. */
function button(text, className) {
  const element = document.createElement('button');
  element.className = `${className} h-i18n`;
  element.textContent = text;
  return element;
}
