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
import './HFilterForm.css';

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
    this.inputs.clear();
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
        const parameter = parameters[id];
        if (!parameter) throw new Error(`Unknown filter parameter: ${id}`);
        if (this.inputs.has(id)) throw new Error(`Filter parameter occurs twice: ${id}`);
        const config = child;
        const host = document.createElement('div');
        host.className = 'h-filter-form-field';
        const widget = createHInput(inputType(parameter), host, {
          label: config.label || parameter.label || id,
          value: parameter.range ? {
            from: parameter.fixedValue?.from ?? this.values[id] ?? null,
            to: parameter.fixedValue?.to ?? this.values[parameter.endInput || id] ?? null
          } : this.values[id] ?? null,
          fixedValue: parameter.fixedValue || null,
          required: Boolean(parameter.required),
          range: config.widget?.type === 'range' || parameter.range === true,
          rangeControl: config.widget?.control || 'direct',
          min: config.widget?.min,
          max: config.widget?.max,
          step: config.widget?.step,
          multiple: config.multiple === true,
          mode: config.mode || 'select',
          orientation: config.orientation || 'column',
          terms: this._termsFor(parameter),
          selectExtent: this.options.selectExtent
        });
        this.inputs.set(id, widget);
        section.append(host);
      }

      form.append(section);
    }

    const actions = document.createElement('div');
    actions.className = 'h-filter-form-actions';
    if (!this.options.preview) {
      const filter = button('Filter', 'h-btn h-btn-primary');
      filter.type = 'submit';
      actions.append(filter);
    }
    const reset = button('Reset', 'h-btn');
    reset.type = 'button';
    this.listen(reset, 'click', () => this.reset());
    actions.append(reset);
    if (this.options.onClose) {
      const close = button('Close', 'h-btn h-btn-primary');
      close.type = 'button';
      this.listen(close, 'click', () => this.options.onClose());
      actions.append(close);
    }
    form.append(actions);
    this.listen(form, 'submit', (event) => {
      event.preventDefault();
      const errors = this.validate();
      if (errors.length) {
        this._showErrors(errors);
        return;
      }

      this._showErrors([]);
      const values = this.getValues();
      const query = this.options.composeQuery?.(this.definition, values)
        ?? resolveQueryParameters(this.query, values);
      this.options.onSubmit?.({ values, query, definition: this.definition });
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

  /** Reset inputs to parameter defaults. */
  reset() {
    this.setValues({});
    this._showErrors([]);
    this.container?.dispatchEvent(new CustomEvent('h-filter-form-reset', { bubbles: true }));
  }

  /** @returns {Promise<void>} Completion after child cleanup. */
  async destroy() {
    for (const input of this.inputs.values()) await input.destroy();
    this.inputs.clear();
    await super.destroy();
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

/** @returns {HTMLButtonElement} A localizable action button. */
function button(text, className) {
  const element = document.createElement('button');
  element.className = `${className} h-i18n`;
  element.textContent = text;
  return element;
}
