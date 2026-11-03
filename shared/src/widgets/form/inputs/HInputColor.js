/**
 * @file HInputColor.js
 * @brief Colour value input: a swatch with the browser's colour picker and the
 *        colour text (`#rrggbb`), empty allowed (inherit).
 *
 * Replaces the legacy colour picker (evol.colorpicker / Spectrum) of the symbology
 * editors (plan 17 §3). With `palette` a dropdown button lists named colours (e.g. the base
 * colours of a website, `var(--h-color-primary)`); the swatch shows the colour of such a value.
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
import { showPopover } from '../../popover/popover.js';
import './HInputColor.css';

const HEX = /^#[0-9a-f]{6}$/i;
const SHORT_HEX = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i;

/** Edits a colour; `''` means no colour (inherited). */
export class HInputColor extends HInput {
  /**
   * Create the swatch (native colour picker), the colour text and, with the option `palette`
   * (`Array<{value, label, color}>` or a function returning it; `color` = what the swatch shows),
   * the dropdown of named colours.
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
    if (this.options.palette) group.append(this._renderPaletteButton());
    host.append(group);
    this.text = text;
    return text;
  }

  /** @returns {Array<{value: string, label: string, color?: string}>} The named colours. */
  _palette() {
    const palette = typeof this.options.palette === 'function' ? this.options.palette() : this.options.palette;
    return Array.isArray(palette) ? palette : [];
  }

  /** The dropdown button of the named colours; a choice is the value of the input. */
  _renderPaletteButton() {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'h-btn h-compact h-input-color-palette';
    button.title = $HR('Choose a named colour');
    button.setAttribute('aria-label', button.title);
    button.setAttribute('aria-haspopup', 'true');
    const icon = document.createElement('i');
    icon.className = 'fa-solid fa-caret-down';
    icon.setAttribute('aria-hidden', 'true');
    button.append(icon);
    this.listen(button, 'click', () => {
      if (this._readOnly) return;
      const menu = document.createElement('div');
      menu.className = 'h-menu h-input-color-menu';
      let popover = null;
      for (const entry of this._palette()) {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'h-menu-item';
        item.title = entry.value;
        const swatch = document.createElement('span');
        swatch.className = 'h-input-color-menu-swatch';
        swatch.style.background = toHex(entry.color) || 'transparent';
        item.append(swatch, document.createTextNode(entry.label || entry.value));
        item.addEventListener('click', () => {
          popover?.close();
          this.text.value = entry.value;
          this._syncSwatch();
          this.notifyChange();
        });
        menu.append(item);
      }
      popover = showPopover(button, menu, { className: 'h-input-color-popover', align: 'right' });
    });
    this.paletteButton = button;
    return button;
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
    if (this.paletteButton) this.paletteButton.disabled = Boolean(readOnly);
    return this;
  }

  /** @returns {string[]} Validation errors. */
  validate() {
    const value = this.getValue();
    if (!value) return this.options.required ? ['A value is required'] : [];
    return HEX.test(value) || typeof CSS === 'undefined' || CSS.supports?.('color', value) !== false
      ? [] : ['Invalid colour'];
  }

  /** Show the colour on the swatch (a named colour: its colour; grey and marked empty without a colour). */
  _syncSwatch() {
    if (!this.picker) return;
    const value = normalizeColor(this.text?.value);
    const named = !HEX.test(value) && value ? this._palette().find((entry) => entry.value === value) : null;
    const shown = HEX.test(value) ? value : toHex(named?.color);
    this.picker.value = shown || '#808080';
    this.picker.classList.toggle('is-empty', !shown);
    this._syncClearButton?.();
  }
}

/** A colour as `#rrggbb` (hex, or any CSS colour through the browser), or '' when it is not one. */
function toHex(color) {
  const text = normalizeColor(color);
  if (!text || HEX.test(text)) return text;
  if (typeof document === 'undefined' || !document.body || typeof getComputedStyle !== 'function') return '';
  const probe = document.createElement('span');
  probe.style.color = text;
  if (!probe.style.color) return '';
  document.body.append(probe);
  const rgb = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(getComputedStyle(probe).color || '');
  probe.remove();
  return rgb ? `#${rgb.slice(1, 4).map((part) => Number(part).toString(16).padStart(2, '0')).join('')}` : '';
}

/** `#abc` → `#aabbcc`, trimmed and lower case for hex colours; other colour names as they are. */
export function normalizeColor(value) {
  const text = String(value ?? '').trim();
  const short = SHORT_HEX.exec(text);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase();
  return HEX.test(text) ? text.toLowerCase() : text;
}
