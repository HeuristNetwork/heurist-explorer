/**
 * @file HInputTemporal.js
 * @brief Date field of an edit form (plan 19): the simple date input, plus
 *        "Edit" (the temporal editor popup) and "Show raw" (a small link shown on
 *        mouse over), before the value tools.
 *
 * The value is the stored text: a plain date (`1969-05-03`, `1624`, `-375`) is
 * edited in the date input; a temporal object (JSON: circa, ranges, radiometric...)
 * shows its readable text in place of the input, and clearing it brings the input
 * back. "Show raw" shows the stored text in a text area (it can be changed there);
 * "Edit" opens the temporal editor (loaded on first use).
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

import { HInputDate } from './HInputDate.js';
import { temporalToHuman } from '../../../utils/temporal.js';
import { isTemporalObject } from '../../temporal/temporalValues.js';
import { $HR } from '../../../ui/i18n/HResource.js';
import './HInputTemporal.css';

/** Date input with the temporal editor. */
export class HInputTemporal extends HInputDate {
  /** Create an unattached input. */
  constructor() {
    super();
    this._text = '';
  }

  /**
   * The date input and the readable text of a temporal object.
   *
   * @param {HTMLElement} host Control host.
   * @returns {HTMLInputElement} Date control.
   */
  renderControl(host) {
    this.options.range = false;
    const control = super.renderControl(host);
    host.classList.add('h-input-temporal');
    this.summary = document.createElement('div');
    this.summary.className = 'h-input-temporal-summary';
    this.summary.hidden = true;
    host.append(this.summary);
    return control;
  }

  /**
   * Edit and Show raw right after the control, before the value tools (clear, visibility).
   *
   * @returns {HInputTemporal} This input, with the Edit / Show raw buttons and the raw text.
   */
  render() {
    super.render();
    const controlHost = this.container.querySelector('.h-form-input-control');
    const buttons = document.createElement('span');
    buttons.className = 'h-input-temporal-buttons';
    this.editButton = editButton();
    this.rawButton = rawToggle();
    buttons.append(this.editButton, this.rawButton);
    const wrap = controlHost?.querySelector('.h-form-input-control-wrap');
    if (wrap) wrap.after(buttons);
    else controlHost?.append(buttons);

    this.raw = document.createElement('textarea');
    this.raw.className = 'h-input h-input-temporal-raw';
    this.raw.rows = 4;
    this.raw.hidden = true;
    this.raw.setAttribute('aria-label', $HR('Raw value'));
    (controlHost || this.container).after(this.raw);

    this.listen(this.rawButton, 'click', () => {
      this.raw.hidden = !this.raw.hidden;
      this.rawButton.textContent = this.raw.hidden ? $HR('Show raw') : $HR('Hide raw');
      this.rawButton.setAttribute('aria-expanded', String(!this.raw.hidden));
    });
    this.listen(this.raw, 'change', () => {
      this.setValue(this.raw.value);
      this.notifyChange();
    });
    this.listen(this.editButton, 'click', () => void this._edit());
    this.setReadOnly(Boolean(this.options.readOnly));
    this._syncView();
    return this;
  }

  /** @returns {string|null} The stored text: the date input, or the temporal JSON. */
  getValue() {
    if (isTemporalObject(this._text)) return this._text;
    return super.getValue();
  }

  /**
   * Set a plain date or a temporal object.
   *
   * @param {string|object|null} value Stored value.
   * @returns {HInputTemporal} This input.
   */
  setValue(value) {
    let text = value === null || value === undefined ? '' : value;
    if (typeof text === 'object') text = JSON.stringify(text);
    this._text = String(text).trim();
    super.setValue(isTemporalObject(this._text) ? '' : this._text);
    this.value = this._text || null;
    this._syncView();
    return this;
  }

  /**
   * @param {boolean} readOnly Whether editing is disabled.
   * @returns {HInputTemporal} This input.
   */
  setReadOnly(readOnly) {
    super.setReadOnly(readOnly);
    if (this.editButton) this.editButton.hidden = Boolean(readOnly);
    if (this.raw) this.raw.readOnly = Boolean(readOnly);
    return this;
  }

  /** @returns {string[]} Validation errors (the JSON of a temporal object). */
  validate() {
    const errors = super.validate();
    if (isTemporalObject(this._text)) {
      try {
        JSON.parse(this._text);
      } catch {
        errors.push('The raw value is not valid JSON');
      }
    }
    return errors;
  }

  /** Keep the raw text in step with a typed date. */
  notifyChange() {
    if (!isTemporalObject(this._text)) this._text = String(super.getValue() ?? '');
    this._syncView();
    super.notifyChange();
  }

  /** The date input for a plain date, the readable text for a temporal object. */
  _syncView() {
    if (!this.summary) return;
    const complex = isTemporalObject(this._text);
    if (this.control) this.control.hidden = complex;
    this.summary.hidden = !complex;
    this.summary.textContent = complex ? temporalToHuman(this._text) : '';
    this.summary.title = this.summary.textContent;
    if (this.raw && document.activeElement !== this.raw) this.raw.value = this.getValue() ?? '';
  }

  /** Open the temporal editor with the current value. */
  async _edit() {
    const { openTemporalEditor } = await import('../../temporal/HTemporalEditor.js');
    const next = await openTemporalEditor(this.getValue());
    if (next === undefined) return;
    this.setValue(next);
    this.notifyChange();
  }
}

/** @returns {HTMLButtonElement} Edit: opens the temporal editor (icon and caption). */
function editButton() {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = 'h-btn h-btn-small h-input-temporal-edit';
  const icon = document.createElement('span');
  icon.className = 'fa-solid fa-calendar-days';
  icon.setAttribute('aria-hidden', 'true');
  const caption = document.createElement('span');
  caption.className = 'h-i18n';
  caption.textContent = $HR('Edit');
  element.append(icon, caption);
  element.title = $HR('Temporal object / compound date: uncertain, range, fuzzy, radiometric');
  return element;
}

/** @returns {HTMLButtonElement} Show / Hide raw: a small muted link, shown on mouse over (HInputTemporal.css). */
function rawToggle() {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = 'h-link-button h-input-raw-toggle h-i18n';
  element.textContent = $HR('Show raw');
  element.title = $HR('Show the stored value');
  return element;
}
