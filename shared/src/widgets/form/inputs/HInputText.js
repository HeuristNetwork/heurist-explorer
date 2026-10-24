/**
 * @file HInputText.js
 * @brief Single-line and multiline text input for shared forms. A URL input
 *        (`inputType: 'url'`) has an icon after it that opens the address.
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
import './HInputText.css';

/** Edits a plain text value. */
export class HInputText extends HInput {
  /**
   * Create a text box or text area.
   *
   * @param {HTMLElement} host Control host.
   * @returns {HTMLElement} Text control.
   */
  renderControl(host) {
    const multiline = this.options.multiline === true;
    const control = document.createElement(multiline ? 'textarea' : 'input');
    control.className = `h-input h-input-text${multiline ? ' h-input-text-multiline' : ''}`;

    if (multiline) {
      control.rows = Math.max(2, Number(this.options.rows) || 3);
    } else {
      control.type = ['url', 'password'].includes(this.options.inputType) ? this.options.inputType : 'text';
      if (this.options.inputType === 'password') control.autocomplete = 'new-password';
    }

    this.listen(control, 'input', () => {
      this._syncClearButton();
      this._syncLink();
    });
    this._commitOnEnterOrBlur(control, { enter: !multiline });
    host.append(control);
    if (!multiline && this.options.inputType === 'url') {
      // the address opens in a new tab (also read only: e.g. a download URL)
      this.link = document.createElement('a');
      this.link.className = 'h-input-url-open';
      this.link.target = '_blank';
      this.link.rel = 'noopener noreferrer';
      this.link.title = $HR('Open the link');
      this.link.setAttribute('aria-label', this.link.title);
      const icon = document.createElement('i');
      icon.className = 'fa-solid fa-arrow-up-right-from-square';
      icon.setAttribute('aria-hidden', 'true');
      this.link.append(icon);
      host.after(this.link);
    }
    return control;
  }

  /** Show the link icon for an http(s) address only. */
  _syncLink() {
    if (!this.link) return;
    const url = this.getValue().trim();
    const usable = /^https?:\/\/\S+$/i.test(url);
    this.link.hidden = !usable;
    if (usable) this.link.href = url;
    else this.link.removeAttribute('href');
  }

  /** @returns {string} Current text. */
  getValue() {
    return this.control?.value ?? String(this.value ?? '');
  }

  /**
   * Set the displayed text.
   *
   * @param {*} value Text value.
   * @returns {HInputText} This input.
   */
  setValue(value) {
    super.setValue(value);
    if (this.control) this.control.value = String(value ?? '');
    this._syncLink();
    return this;
  }

  /** @returns {string[]} Validation errors. */
  validate() {
    return this.options.required && !this.getValue().trim() ? ['A value is required'] : [];
  }
}
