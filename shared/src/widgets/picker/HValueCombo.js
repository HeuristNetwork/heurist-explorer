/**
 * @file HValueCombo.js
 * @brief Combobox around HValuePicker: a select-like button showing the
 *        selection and a popover holding the picker (plan §4.2).
 *
 * The popover is placed in the nearest `<dialog>` (or the document body) with
 * fixed positioning, so it is not clipped by scrolling panels. Values are
 * loaded on first open (V11).
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
import { $HR } from '../../ui/i18n/HResource.js';
import { HValuePicker, toValues } from './HValuePicker.js';
import './HValuePicker.css';

let nextComboId = 0;

/** Select-like button that opens a filterable value list. */
export class HValueCombo extends HBaseWidget {
  /**
   * @param {HTMLElement} container Combobox host.
   * @param {object} options Combobox options (picker options plus the ones below).
   * @param {object} options.source Value source.
   * @param {boolean} [options.multiple=false] Allow several values.
   * @param {*} [options.value] Initial value.
   * @param {string} [options.emptyLabel] Button text when nothing is selected.
   * @param {Function} [options.onChange] Called with the new value.
   * @returns {HValueCombo} This combobox.
   */
  attach(container, options = {}) {
    super.attach(container, options);
    if (!options.source?.load) throw new TypeError('HValueCombo requires a value source');
    this.source = options.source;
    this._values = toValues(options.value);
    return this;
  }

  /** @returns {HValueCombo} This combobox. */
  render() {
    if (!this.container) throw new Error('HValueCombo must be attached before render');
    this.container.replaceChildren();
    this.container.classList.add('h-value-combo-host');
    const id = `h-value-combo-${++nextComboId}`;

    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.id = id;
    this.button.className = 'h-select h-value-combo';
    this.button.setAttribute('role', 'combobox');
    this.button.setAttribute('aria-haspopup', 'listbox');
    this.button.setAttribute('aria-expanded', 'false');
    this.buttonText = document.createElement('span');
    this.buttonText.className = 'h-value-combo-text';
    const caret = document.createElement('span');
    caret.className = 'fa-solid fa-caret-down h-value-combo-caret';
    caret.setAttribute('aria-hidden', 'true');
    this.button.append(this.buttonText, caret);
    this.container.append(this.button);

    this.popover = document.createElement('div');
    this.popover.className = 'h-value-combo-popover';
    this.popover.hidden = true;
    this.popover.setAttribute('aria-labelledby', id);
    this.picker = new HValuePicker().attach(this.popover, {
      ...this.options,
      value: this.getValue(),
      controlled: false,
      loadOnRender: false,
      onChange: (value) => {
        this._values = toValues(value);
        this._syncButton();
        this.options.onChange?.(value);
        this.container?.dispatchEvent(new CustomEvent('h-value-combo-change', {
          bubbles: true, detail: { combo: this, value }
        }));
      },
      onPick: (item) => {
        this.options.onPick?.(item);
        if (!this.options.multiple) this.close({ focus: true });
      }
    }).render();

    this.listen(this.button, 'click', () => (this.isOpen() ? this.close() : void this.open()));
    this.listen(this.button, 'keydown', (event) => {
      if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        void this.open();
      }
    });
    this.listen(this.popover, 'h-value-picker-escape', () => this.close({ focus: true }));
    this.listen(this.popover, 'h-value-picker-change', (event) => event.stopPropagation());
    this._onOutside = (event) => {
      if (!this.container?.contains(event.target) && !this.popover.contains(event.target)) this.close();
    };
    this._onReposition = () => this._position();

    this._syncButton();
    this.setReadOnly(Boolean(this.options.readOnly));
    this.state = 'rendered';
    return this;
  }

  /** @returns {boolean} Whether the popover is shown. */
  isOpen() {
    return !this.popover?.hidden;
  }

  /** Show the popover and load values on first open. */
  async open() {
    if (this.isOpen() || this.button.disabled) return;
    const parent = this.button.closest('dialog') || document.body;
    if (this.popover.parentElement !== parent) parent.append(this.popover);
    this.popover.hidden = false;
    // a host (HInput) may have re-assigned the button id for its label
    this.popover.setAttribute('aria-labelledby', this.button.id);
    this.button.setAttribute('aria-expanded', 'true');
    this._position();
    document.addEventListener('mousedown', this._onOutside, true);
    window.addEventListener('resize', this._onReposition);
    window.addEventListener('scroll', this._onReposition, true);
    await this.picker.open();
    this._position();
    this.picker.focus();
  }

  /**
   * Hide the popover.
   *
   * @param {{focus?: boolean}} [options] Return focus to the button.
   * @returns {void}
   */
  close({ focus = false } = {}) {
    if (!this.popover || this.popover.hidden) return;
    this.popover.hidden = true;
    this.button.setAttribute('aria-expanded', 'false');
    this._removeGlobalListeners();
    if (focus) this.button.focus();
  }

  /** @returns {*} Selected value, an array when `multiple`. */
  getValue() {
    return this.options.multiple ? this._values.slice() : this._values[0] ?? null;
  }

  /**
   * @param {*} value New value.
   * @returns {HValueCombo} This combobox.
   */
  setValue(value) {
    this._values = toValues(value);
    if (!this.options.multiple) this._values = this._values.slice(0, 1);
    this.picker?.setValue(this.getValue());
    this._syncButton();
    return this;
  }

  /**
   * @param {boolean} readOnly Whether the combobox is disabled.
   * @returns {HValueCombo} This combobox.
   */
  setReadOnly(readOnly) {
    if (this.button) this.button.disabled = Boolean(readOnly);
    if (readOnly) this.close();
    return this;
  }

  /** Reload values from the source (dynamic facets). */
  async refresh() {
    await this.picker?.refresh();
    this._syncButton();
  }

  /**
   * Values changed on the server side (a facet recount): reload now when the
   * list is open, otherwise when it is next opened. The button needs no load.
   *
   * @returns {Promise<void>}
   */
  async markStale() {
    if (this.isOpen()) await this.picker?.load();
    else this.picker?.markStale();
  }

  /** @returns {Promise<void>} Completion after the popover is removed. */
  async destroy() {
    this._removeGlobalListeners();
    await this.picker?.destroy();
    this.popover?.remove();
    await super.destroy();
  }

  /** Show the selected labels on the button. */
  _syncButton() {
    if (!this.buttonText) return;
    const labels = this._values.map((value) => this.picker?.labelFor(value)
      || this.source.labelFor?.(value) || String(value));
    const empty = !labels.length;
    this.buttonText.textContent = empty ? (this.options.emptyLabel || $HR('Select a value')) : labels.join(', ');
    this.button.title = empty ? '' : labels.join(', ');
    this.button.classList.toggle('is-empty', empty);
  }

  /** Place the popover under (or above) the button, inside the viewport. */
  _position() {
    if (!this.popover || this.popover.hidden) return;
    const rect = this.button.getBoundingClientRect();
    const margin = 8;
    const below = window.innerHeight - rect.bottom - margin;
    const above = rect.top - margin;
    const openBelow = below >= 240 || below >= above;
    const height = Math.max(120, Math.min(360, openBelow ? below : above));
    // never wider than the viewport: long labels are cut with an ellipsis instead
    const maxWidth = Math.max(120, window.innerWidth - 2 * margin);
    const width = Math.min(Math.max(rect.width, 220), maxWidth);
    Object.assign(this.popover.style, { position: 'fixed', minWidth: `${width}px`, maxWidth: `${maxWidth}px` });
    // keep the whole popover on screen, using its real (content) width
    const actual = Math.min(Math.max(this.popover.offsetWidth || 0, width), maxWidth);
    Object.assign(this.popover.style, {
      maxHeight: `${height}px`,
      left: `${Math.max(margin, Math.min(rect.left, window.innerWidth - actual - margin))}px`,
      // above: anchor the bottom edge to the button, so a list shorter than
      // maxHeight still touches it (a top edge at rect.top - maxHeight left a gap)
      top: openBelow ? `${rect.bottom + 2}px` : 'auto',
      bottom: openBelow ? 'auto' : `${window.innerHeight - rect.top + 2}px`
    });
  }

  /** Remove document/window listeners added by `open()`. */
  _removeGlobalListeners() {
    if (!this._onOutside) return;
    document.removeEventListener('mousedown', this._onOutside, true);
    window.removeEventListener('resize', this._onReposition);
    window.removeEventListener('scroll', this._onReposition, true);
  }
}
