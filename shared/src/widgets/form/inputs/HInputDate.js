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
    const first = this._makeDate(host, this.options.range ? 'Date From' : 'Date');
    this.control = first;

    if (this.options.range) {
      this.endControl = this._makeDate(host, 'Date To');
      first.readOnly = this.options.fixedValue?.from != null;
      this.endControl.readOnly = this.options.fixedValue?.to != null;
      host.classList.add('h-input-date-range');
      this._rangeHost = host;
      if (this.options.rangeControl === 'slider' && sliderDay(this.options.min) !== null
        && sliderDay(this.options.max) !== null) {
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
    for (const [index, slider] of (this.sliders || []).entries()) {
      const endpoint = index ? 'to' : 'from';
      slider.disabled = Boolean(readOnly) || this.options.fixedValue?.[endpoint] != null;
    }
    return this;
  }

  /**
   * Set the slider bounds after render (bounds requested from the server).
   * The sliders appear once the bounds are dates making a non-empty interval,
   * negative years included (-YYYY-MM-DD, within JavaScript's range of about
   * ±271 000 years); deeper time leaves the direct inputs only.
   *
   * @param {string|null} min Lower bound, YYYY-MM-DD.
   * @param {string|null} max Upper bound, YYYY-MM-DD.
   * @returns {HInputDate} This input.
   */
  setBounds(min, max) {
    this.options.min = min;
    this.options.max = max;
    this.setNote(boundsNote(min, max));
    const from = sliderDay(min);
    const to = sliderDay(max);
    if (from === null || to === null || from >= to || this.options.rangeControl !== 'slider' || !this._rangeHost) {
      return this;
    }
    if (!this.sliders) this._addSliders(this._rangeHost);
    else for (const slider of this.sliders) { slider.min = String(from); slider.max = String(to); }
    this._syncSliders();
    this.setReadOnly(Boolean(this.options.readOnly));
    return this;
  }

  /** @returns {string[]} Validation errors. */
  validate() {
    const value = this.getValue();
    const empty = this.options.range ? !value.from && !value.to : !value;
    const errors = this.options.required && empty ? ['A value is required'] : [];

    const fromDay = this.options.range ? sliderDay(value.from) : null;
    const toDay = this.options.range ? sliderDay(value.to) : null;
    if (fromDay !== null && toDay !== null && fromDay > toDay) {
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
      onOpen: (_dates, _text, picker) => {
        if (input.readOnly) picker.close();
        else positionCalendar(input, picker);
      },
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

  /** Add one date range track with independent start and end handles. */
  _addSliders(host) {
    this.sliders = [];
    const wrapper = document.createElement('div');
    wrapper.className = 'h-input-date-sliders h-input-dual-slider';

    for (const [index, endpoint] of [this.control, this.endControl].entries()) {
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = String(sliderDay(this.options.min));
      slider.max = String(sliderDay(this.options.max));
      slider.step = '1';
      slider.setAttribute('aria-label', endpoint.placeholder);
      slider.disabled = endpoint.readOnly;
      slider.addEventListener('input', () => {
        const other = this.sliders[index ? 0 : 1];
        if (other) slider.value = String(index
          ? Math.max(Number(slider.value), Number(other.value))
          : Math.min(Number(slider.value), Number(other.value)));
        // Update the date without triggering flatpickr's onChange (which
        // calls notifyChange) on every intermediate drag tick. The calendar
        // cannot hold years before 0000 or after 9999: those are set as text.
        const text = sliderDate(Number(slider.value));
        if (dateDay(text) !== null) this.pickers[index].setDate(text, false, 'Y-m-d');
        else { this.pickers[index].clear(false); endpoint.value = text; }
        this._syncSliderFill(wrapper);
      });
      // 'change' fires once when the drag/keypress commits.
      slider.addEventListener('change', () => this.notifyChange());
      wrapper.append(slider);
      this.sliders.push(slider);
    }

    host.append(wrapper);
    this.sliderWrapper = wrapper;
    this._syncSliderFill(wrapper);
  }

  /** Synchronize slider positions after direct date changes. */
  _syncSliders() {
    if (!this.sliders) return;
    for (const [index, endpoint] of [this.control, this.endControl].entries()) {
      this.sliders[index].value = String(sliderDay(endpoint.value)
        ?? sliderDay(index ? this.options.max : this.options.min));
    }
    this._syncSliderFill(this.sliderWrapper);
  }

  /** Paint the selected interval between the two slider handles. */
  _syncSliderFill(wrapper) {
    if (!wrapper || this.sliders?.length !== 2) return;
    const min = sliderDay(this.options.min);
    const span = sliderDay(this.options.max) - min;
    if (!(span > 0)) return;
    wrapper.style.setProperty('--h-range-from', `${(Number(this.sliders[0].value) - min) / span * 100}%`);
    wrapper.style.setProperty('--h-range-to', `${(Number(this.sliders[1].value) - min) / span * 100}%`);
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

/**
 * Note for the range of a field's dates. A bound on a year boundary shows the
 * year alone (`-1000000000 – 2026-09-18`), which also keeps prehistoric years readable.
 *
 * @returns {string} Note text, or '' without bounds.
 */
export function boundsNote(min, max) {
  if (min == null || max == null || min === '' || max === '') return '';
  const short = (value, suffix) => (String(value).endsWith(suffix) ? String(value).slice(0, -suffix.length) : String(value));
  const from = short(min, '-01-01');
  const to = short(max, '-12-31');
  return from === to ? from : `${from} – ${to}`;
}

/**
 * UTC day number of a date with a signed year (`1850-07-15`, `-0500-01-01`,
 * `-12000-06-01`), as used by the slider scale. JavaScript dates reach about
 * ±271 000 years; beyond that (and for anything but a full date) null.
 *
 * @param {*} value Date text.
 * @returns {number|null} Day number.
 */
export function sliderDay(value) {
  const match = typeof value === 'string' ? /^(-?)(\d{4,6})-(\d{2})-(\d{2})$/.exec(value.trim()) : null;
  if (!match) return null;
  const [, sign, year, month, day] = match;
  // extended ISO years (±YYYYYY) for years outside 0000-9999
  const iso = sign || year.length > 4 ? `${sign || '+'}${year.padStart(6, '0')}` : year;
  const time = Date.parse(`${iso}-${month}-${day}T00:00:00Z`);
  if (!Number.isFinite(time)) return null;
  const result = Math.floor(time / 86400000);
  // reject overflowing days (2023-02-30) by formatting back
  return sliderDate(result) === `${sign}${year.replace(/^0+(?=\d{4})/, '')}-${month}-${day}` ? result : null;
}

/**
 * Date with a signed year (at least 4 digits) for a UTC day number: the
 * inverse of sliderDay (`-0500-01-01`, `1850-07-15`).
 *
 * @param {number} day Day number.
 * @returns {string} Date text.
 */
export function sliderDate(day) {
  const iso = new Date(day * 86400000).toISOString();
  const match = /^([+-]?)(\d+)-(\d{2})-(\d{2})/.exec(iso);
  const year = match[2].replace(/^0+(?=\d{4})/, '');
  return `${match[1] === '-' ? '-' : ''}${year}-${match[3]}-${match[4]}`;
}
