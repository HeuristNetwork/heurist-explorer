/**
 * @file HInputColor.js
 * @brief Colour value input: a swatch with the browser's colour picker and the
 *        colour text (`#rrggbb`), empty allowed (inherit).
 *
 * Replaces the legacy colour picker (evol.colorpicker / Spectrum) of the symbology
 * editors (plan 17 §3).
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
import { $HR } from '../../../ui/i18n/HResource.js';
import './HInputColor.css';

const HEX = /^#[0-9a-f]{6}$/i;
const SHORT_HEX = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i;

/** Edits a colour; `''` means no colour (inherited). */
export class HInputColor extends HInput {
  /**
   * Create the swatch (native colour picker) and the colour text.
   *
   * @param {HTMLElement} host Control host.
   * @returns {HTMLElement} The colour text.
   */
  renderControl(host) {
    const group = document.createElement('div');
    group.className = 'h-input-color';
    this.picker = document.createElement('input');
    this.picker.type = 'color';
    this.picker.className = 'h-input-color-swatch';
    this.picker.title = $HR('Choose colour');
    this.picker.setAttribute('aria-label', this.picker.title);
    const text = document.createElement('input');
    text.type = 'text';
    text.className = 'h-input h-input-color-text';
    text.placeholder = this.options.placeholder || '';
    text.maxLength = 32;
    this.listen(this.picker, 'input', () => {
      text.value = this.picker.value;
      this._syncSwatch();
    });
    this.listen(this.picker, 'change', () => {
      text.value = this.picker.value;
      this._syncSwatch();
      this.notifyChange();
    });
    this.listen(text, 'input', () => this._syncSwatch());
    this._commitOnEnterOrBlur(text);
    group.append(this.picker, text);
    host.append(group);
    this.text = text;
    return text;
  }

  /** @returns {string} The colour (`#rrggbb` when it is a hex colour), or `''`. */
  getValue() {
    return normalizeColor(this.text?.value ?? this.value ?? '');
  }

  /**
   * Set the colour.
   *
   * @param {*} value Colour text, or empty.
   * @returns {HInputColor} This input.
   */
  setValue(value) {
    super.setValue(value);
    if (this.text) this.text.value = normalizeColor(value);
    this._syncSwatch();
    return this;
  }

  /** Disable or enable both controls. */
  setReadOnly(readOnly) {
    super.setReadOnly(readOnly);
    if (this.picker) this.picker.disabled = Boolean(readOnly);
    return this;
  }

  /** @returns {string[]} Validation errors. */
  validate() {
    const value = this.getValue();
    if (!value) return this.options.required ? ['A value is required'] : [];
    return HEX.test(value) || typeof CSS === 'undefined' || CSS.supports?.('color', value) !== false
      ? [] : ['Invalid colour'];
  }

  /** Show the colour on the swatch (grey and marked empty without a colour). */
  _syncSwatch() {
    if (!this.picker) return;
    const value = normalizeColor(this.text?.value);
    this.picker.value = HEX.test(value) ? value : '#808080';
    this.picker.classList.toggle('is-empty', !HEX.test(value));
    this._syncClearButton?.();
  }
}

/** `#abc` → `#aabbcc`, trimmed and lower case for hex colours; other colour names as they are. */
export function normalizeColor(value) {
  const text = String(value ?? '').trim();
  const short = SHORT_HEX.exec(text);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase();
  return HEX.test(text) ? text.toLowerCase() : text;
}
