/**
 * @file HInput.js
 * @brief Base class for a single value input in edit and filter forms.
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

import { HBaseWidget } from '../../HBaseWidget.js';
import './HInput.css';

let nextInputId = 0;

/** Provides shared label, value, validation, and change behavior. */
export class HInput extends HBaseWidget {
  /** Create an unattached input. */
  constructor() {
    super();
    this.value = null;
    this.control = null;
  }

  /**
   * Attach the input and its field definition.
   *
   * @param {HTMLElement} container Input host.
   * @param {object} options Input definition and initial value.
   * @returns {HInput} This input.
   */
  attach(container, options = {}) {
    super.attach(container, options);
    this.value = options.value ?? null;
    return this;
  }

  /**
   * Render the common field shell and the concrete control.
   *
   * @returns {HInput} This input.
   */
  render() {
    if (!this.container) throw new Error('HInput must be attached before render');

    this.container.replaceChildren();
    this.container.classList.add('h-widget', 'h-form-input');

    const label = document.createElement('label');
    label.className = 'h-form-input-label h-i18n';
    label.textContent = this.options.label || '';

    const controlHost = document.createElement('div');
    controlHost.className = 'h-form-input-control';
    this.container.append(label, controlHost);

    this.label = label;
    this.control = this.renderControl(controlHost);
    if (this.control) {
      this.control.id = `h-input-${++nextInputId}`;
      label.htmlFor = this.control.id;
      this.setValue(this.value);
      this.setReadOnly(Boolean(this.options.readOnly));
    }

    this.state = 'rendered';
    return this;
  }

  /**
   * Create the type-specific control in a host.
   *
   * @param {HTMLElement} host Control host.
   * @returns {HTMLElement} Primary control.
   */
  renderControl(host) {
    throw new Error(`renderControl is not implemented for ${this.constructor.name}`);
  }

  /**
   * Read the current value.
   *
   * @returns {*} Current value.
   */
  getValue() {
    return this.value;
  }

  /**
   * Replace the current value.
   *
   * @param {*} value New value.
   * @returns {HInput} This input.
   */
  setValue(value) {
    this.value = value ?? null;
    return this;
  }

  /**
   * Set the control's read-only state.
   *
   * @param {boolean} readOnly Whether editing is disabled.
   * @returns {HInput} This input.
   */
  setReadOnly(readOnly) {
    if (this.control) this.control.disabled = Boolean(readOnly);
    return this;
  }

  /**
   * Validate the current value.
   *
   * @returns {string[]} Error messages.
   */
  validate() {
    if (this.options.required && (this.getValue() === null || this.getValue() === '')) {
      return ['A value is required'];
    }

    return [];
  }

  /** Notify the form that this input changed. */
  notifyChange() {
    this.container?.dispatchEvent(new CustomEvent('h-input-change', {
      bubbles: true,
      detail: { input: this, value: this.getValue() }
    }));
  }
}
