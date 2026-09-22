/**
 * @file HInputText.js
 * @brief Single-line and multiline text input for shared forms.
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
      control.type = this.options.inputType === 'url' ? 'url' : 'text';
    }

    this.listen(control, 'input', () => this._syncClearButton());
    this._commitOnEnterOrBlur(control, { enter: !multiline });
    host.append(control);
    return control;
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
    return this;
  }

  /** @returns {string[]} Validation errors. */
  validate() {
    return this.options.required && !this.getValue().trim() ? ['A value is required'] : [];
  }
}
