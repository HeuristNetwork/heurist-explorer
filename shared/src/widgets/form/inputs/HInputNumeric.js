/**
 * @file HInputNumeric.js
 * @brief Integer and decimal inputs with optional filter range presentation.
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

import { HInput } from './HInput.js';
import './HInputNumeric.css';

/** Edits a number or two range endpoints. */
export class HInputNumeric extends HInput {
  /**
   * Create numeric controls.
   *
   * @param {HTMLElement} host Control host.
   * @returns {HTMLInputElement} Primary input.
   */
  renderControl(host) {
    const range = this.options.range === true;
    const first = this._makeNumber(range ? 'From' : 'Value');
    this.control = first;
    host.append(first);

    if (range) {
      this.endControl = this._makeNumber('To');
      first.readOnly = this.options.fixedValue?.from != null;
      this.endControl.readOnly = this.options.fixedValue?.to != null;
      host.classList.add('h-input-numeric-range');
      host.append(this.endControl);
      if (this.options.rangeControl === 'slider'
        && Number.isFinite(Number(this.options.min))
        && Number.isFinite(Number(this.options.max))) {
        this._addSliders(host);
      }
    }

    return first;
  }

  /**
   * Read a number or a range object with nullable endpoints.
   *
   * @returns {number|null|{from:number|null,to:number|null}} Value.
   */
  getValue() {
    const from = this._number(this.control);
    return this.options.range === true
      ? { from, to: this._number(this.endControl) }
      : from;
  }

  /**
   * Set a number or range.
   *
   * @param {*} value Number or `{from,to}`.
   * @returns {HInputNumeric} This input.
   */
  setValue(value) {
    super.setValue(value);
    if (this.control) {
      this.control.value = String(this.options.range === true ? value?.from ?? '' : value ?? '');
    }

    if (this.endControl) this.endControl.value = String(value?.to ?? '');
    this._syncSliders();
    return this;
  }

  /**
   * Disable both endpoints when read-only.
   *
   * @param {boolean} readOnly Whether editing is disabled.
   * @returns {HInputNumeric} This input.
   */
  setReadOnly(readOnly) {
    super.setReadOnly(readOnly);
    if (this.endControl) this.endControl.disabled = Boolean(readOnly);
    for (const [index, slider] of (this.sliders || []).entries()) {
      const endpoint = index ? 'to' : 'from';
      slider.disabled = Boolean(readOnly) || this.options.fixedValue?.[endpoint] != null;
    }
    return this;
  }

  /** @returns {string[]} Validation errors. */
  validate() {
    const value = this.getValue();
    const empty = this.options.range === true
      ? value.from === null && value.to === null
      : value === null;
    const errors = this.options.required && empty ? ['A value is required'] : [];

    if (this.options.range === true && value.from !== null && value.to !== null && value.from > value.to) {
      errors.push('Range start must not exceed range end');
    }

    return errors;
  }

  /** @returns {HTMLInputElement} Numeric control. */
  _makeNumber(placeholder) {
    const input = document.createElement('input');
    input.className = 'h-input h-input-numeric';
    input.type = 'number';
    input.step = this.options.integer ? '1' : String(this.options.step || 'any');
    input.placeholder = placeholder;
    input.addEventListener('input', () => { this._syncSliders(); this.notifyChange(); });
    return input;
  }

  /** Add one range track with independent start and end handles. */
  _addSliders(host) {
    this.sliders = [];
    const wrapper = document.createElement('div');
    wrapper.className = 'h-input-numeric-sliders h-input-dual-slider';

    for (const [index, endpoint] of [this.control, this.endControl].entries()) {
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = String(this.options.min);
      slider.max = String(this.options.max);
      slider.step = String(this.options.step || (this.options.integer ? 1 : 'any'));
      slider.setAttribute('aria-label', endpoint.placeholder);
      slider.disabled = endpoint.readOnly;
      slider.addEventListener('input', () => {
        const other = this.sliders[index ? 0 : 1];
        if (other) slider.value = String(index
          ? Math.max(Number(slider.value), Number(other.value))
          : Math.min(Number(slider.value), Number(other.value)));
        endpoint.value = slider.value;
        this._syncSliderFill(wrapper);
        this.notifyChange();
      });
      wrapper.append(slider);
      this.sliders.push(slider);
    }

    host.append(wrapper);
    this.sliderWrapper = wrapper;
    this._syncSliderFill(wrapper);
  }

  /** Keep sliders aligned when direct values change. */
  _syncSliders() {
    if (!this.sliders) return;
    for (const [index, endpoint] of [this.control, this.endControl].entries()) {
      this.sliders[index].value = endpoint.value || (index ? String(this.options.max) : String(this.options.min));
    }
    this._syncSliderFill(this.sliderWrapper);
  }

  /** Paint the selected interval between the two slider handles. */
  _syncSliderFill(wrapper) {
    if (!wrapper || this.sliders?.length !== 2) return;
    const min = Number(this.options.min);
    const span = Number(this.options.max) - min;
    if (!(span > 0)) return;
    wrapper.style.setProperty('--h-range-from', `${(Number(this.sliders[0].value) - min) / span * 100}%`);
    wrapper.style.setProperty('--h-range-to', `${(Number(this.sliders[1].value) - min) / span * 100}%`);
  }

  /** @returns {number|null} Parsed control value. */
  _number(control) {
    if (!control || control.value === '') return null;
    const value = Number(control.value);
    return Number.isFinite(value) ? value : null;
  }
}
