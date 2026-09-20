/**
 * @file HInputDate.js
 * @brief Simple-date input using flatpickr, with optional range endpoints.
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

import flatpickr from 'flatpickr';
import 'flatpickr/dist/flatpickr.min.css';
import { HInput } from './HInput.js';
import './HInputDate.css';

/** Edits ISO simple dates; complex temporals use a separate future editor. */
export class HInputDate extends HInput {
  /** Create an unattached date input. */
  constructor() {
    super();
    this.pickers = [];
  }

  /**
   * Create one or two date inputs.
   *
   * @param {HTMLElement} host Control host.
   * @returns {HTMLInputElement} Primary control.
   */
  renderControl(host) {
    const first = this._makeDate(host, this.options.range ? 'From' : 'Date');
    this.control = first;

    if (this.options.range) {
      this.endControl = this._makeDate(host, 'To');
      first.readOnly = this.options.fixedValue?.from != null;
      this.endControl.readOnly = this.options.fixedValue?.to != null;
      host.classList.add('h-input-date-range');
      if (this.options.rangeControl === 'slider' && dateDay(this.options.min) !== null
        && dateDay(this.options.max) !== null) {
        this._addSliders(host);
      }
    }

    return first;
  }

  /** @returns {string|null|{from:string|null,to:string|null}} Date value. */
  getValue() {
    const from = this.control?.value || null;
    return this.options.range
      ? { from, to: this.endControl?.value || null }
      : from;
  }

  /**
   * Set a simple date or range.
   *
   * @param {*} value ISO date or `{from,to}`.
   * @returns {HInputDate} This input.
   */
  setValue(value) {
    super.setValue(value);
    const from = this.options.range ? value?.from || '' : value || '';
    const to = value?.to || '';
    if (this.control) this._setDate(0, from);
    if (this.endControl) this._setDate(1, to);
    this._syncSliders();
    return this;
  }

  /**
   * Disable all date controls.
   *
   * @param {boolean} readOnly Whether editing is disabled.
   * @returns {HInputDate} This input.
   */
  setReadOnly(readOnly) {
    super.setReadOnly(readOnly);
    if (this.endControl) this.endControl.disabled = Boolean(readOnly);
    for (const slider of this.sliders || []) slider.disabled = Boolean(readOnly);
    return this;
  }

  /** @returns {string[]} Validation errors. */
  validate() {
    const value = this.getValue();
    const empty = this.options.range ? !value.from && !value.to : !value;
    const errors = this.options.required && empty ? ['A value is required'] : [];

    if (this.options.range && value.from && value.to && value.from > value.to) {
      errors.push('Range start must not exceed range end');
    }

    if (!this.options.allowLegacyText) {
      const dates = this.options.range ? [value.from, value.to] : [value];
      if (dates.some((date) => date && dateDay(date) === null)) {
        errors.push('Enter a valid date as YYYY-MM-DD');
      }
    }

    return errors;
  }

  /** @returns {Promise<void>} Completion after picker cleanup. */
  async destroy() {
    for (const picker of this.pickers) picker.destroy();
    this.pickers = [];
    await super.destroy();
  }

  /** @returns {HTMLInputElement} Simple-date control. */
  _makeDate(host, placeholder) {
    const input = document.createElement('input');
    input.className = 'h-input h-input-date';
    input.type = 'text';
    input.placeholder = placeholder;
    host.append(input);
    this.pickers.push(flatpickr(input, {
      dateFormat: 'Y-m-d',
      allowInput: true,
      position: 'auto',
      onOpen: (_dates, _text, picker) => positionCalendar(input, picker),
      onChange: () => { this._syncSliders(); this.notifyChange(); }
    }));
    input.addEventListener('change', () => { this._syncSliders(); this.notifyChange(); });
    return input;
  }

  /** Preserve legacy date text that the simple calendar cannot represent. */
  _setDate(index, value) {
    const input = index ? this.endControl : this.control;
    if (value && dateDay(value) !== null) {
      this.pickers[index]?.setDate(value, false, 'Y-m-d');
    } else if (input) {
      this.pickers[index]?.clear(false);
      input.value = String(value || '');
    }
  }

  /** Add date sliders when the designer supplies finite bounds. */
  _addSliders(host) {
    this.sliders = [];
    const wrapper = document.createElement('div');
    wrapper.className = 'h-input-date-sliders';

    for (const [index, endpoint] of [this.control, this.endControl].entries()) {
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = String(dateDay(this.options.min));
      slider.max = String(dateDay(this.options.max));
      slider.step = '1';
      slider.setAttribute('aria-label', endpoint.placeholder);
      slider.disabled = endpoint.readOnly;
      slider.addEventListener('input', () => {
        this.pickers[index].setDate(dayDate(Number(slider.value)), true, 'Y-m-d');
      });
      wrapper.append(slider);
      this.sliders.push(slider);
    }

    host.append(wrapper);
  }

  /** Synchronize slider positions after direct date changes. */
  _syncSliders() {
    if (!this.sliders) return;
    for (const [index, endpoint] of [this.control, this.endControl].entries()) {
      this.sliders[index].value = String(dateDay(endpoint.value)
        ?? dateDay(index ? this.options.max : this.options.min));
    }
  }
}

/** Keep the calendar in the active dialog and choose the side with more space. */
function positionCalendar(input, picker) {
  const calendar = picker.calendarContainer;
  const parent = input.closest('dialog') || document.body;
  if (calendar.parentElement !== parent) parent.append(calendar);
  const rect = input.getBoundingClientRect();
  const dialogRect = input.closest('dialog')?.getBoundingClientRect();
  const topLimit = Math.max(8, dialogRect?.top ?? 8);
  const bottomLimit = Math.min(window.innerHeight - 8, dialogRect?.bottom ?? window.innerHeight - 8);
  const below = bottomLimit - rect.bottom - 4;
  const above = rect.top - topLimit - 4;
  const openBelow = below >= calendar.offsetHeight || below >= above;
  const height = Math.max(80, Math.min(calendar.offsetHeight || 320, openBelow ? below : above));
  calendar.style.maxHeight = `${height}px`;
  calendar.style.overflowY = 'auto';
  calendar.style.position = 'fixed';
  calendar.style.top = `${Math.max(topLimit, openBelow ? rect.bottom + 2 : rect.top - height - 2)}px`;
  calendar.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - calendar.offsetWidth - 8))}px`;
}

/** @returns {number|null} UTC day number for an ISO simple date. */
function dateDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value
    ? Math.floor(time / 86400000)
    : null;
}

/** @returns {string} ISO simple date for a UTC day number. */
function dayDate(day) {
  return new Date(day * 86400000).toISOString().slice(0, 10);
}
