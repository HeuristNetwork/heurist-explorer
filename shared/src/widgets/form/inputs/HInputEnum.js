/**
 * @file HInputEnum.js
 * @brief Term-ID dropdown input for shared forms.
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
import './HInputEnum.css';

/** Edits one or more term IDs using a dropdown or visible choice list. */
export class HInputEnum extends HInput {
  /**
   * Create a term dropdown or choice list from supplied options.
   *
   * @param {HTMLElement} host Control host.
   * @returns {HTMLSelectElement} Dropdown.
   */
  renderControl(host) {
    if (this.options.mode === 'radio' || this.options.mode === 'checkbox') {
      const list = document.createElement('div');
      list.className = `h-input-enum-list h-input-enum-${this.options.orientation === 'inline' ? 'inline' : 'column'}`;
      this.choices = [];
      const radioName = `h-enum-${Math.random().toString(36).slice(2)}`;

      for (const item of this.options.terms || []) {
        const label = document.createElement('label');
        label.className = 'h-input-enum-choice';
        label.style.paddingInlineStart = `${Math.max(0, Number(item.depth || 1) - 1) * 1.25}em`;
        const control = document.createElement('input');
        control.type = this.options.mode;
        control.name = radioName;
        control.value = String(item.id);
        const text = document.createElement('span');
        text.textContent = item.label || String(item.id);
        label.append(control, text);
        list.append(label);
        this.choices.push(control);
        this.listen(control, 'change', () => this.notifyChange());
      }

      host.append(list);
      return list;
    }

    const select = document.createElement('select');
    select.className = 'h-select h-input-enum';
    select.multiple = this.options.multiple === true;

    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = this.options.emptyLabel || 'Select a value';
    empty.className = 'h-i18n';
    if (!select.multiple) select.append(empty);

    for (const item of this.options.terms || []) {
      const option = document.createElement('option');
      option.value = String(item.id);
      option.textContent = `${'\u00a0\u00a0'.repeat(Math.max(0, Number(item.depth || 1) - 1))}${item.label || String(item.id)}`;
      select.append(option);
    }

    this.listen(select, 'change', () => this.notifyChange());
    host.append(select);
    return select;
  }

  /** @returns {number|number[]|null} Selected term ID or IDs. */
  getValue() {
    if (this.choices) {
      const values = this.choices.filter((choice) => choice.checked).map((choice) => Number(choice.value));
      return this.options.mode === 'checkbox' ? values : values[0] ?? null;
    }

    if (this.control?.multiple) {
      return [...this.control.selectedOptions].map((option) => Number(option.value));
    }

    const value = this.control?.value;
    return value ? Number(value) : null;
  }

  /**
   * Select a term by ID.
   *
   * @param {number|string|Array<number|string>|null} value Term ID or IDs.
   * @returns {HInputEnum} This input.
   */
  setValue(value) {
    super.setValue(value);
    const values = Array.isArray(value) ? value.map(String) : value == null ? [] : [String(value)];

    if (this.choices) {
      for (const choice of this.choices) choice.checked = values.includes(choice.value);
    } else if (this.control?.multiple) {
      for (const option of this.control.options) option.selected = values.includes(option.value);
    } else if (this.control) {
      this.control.value = values[0] || '';
    }

    return this;
  }

  /**
   * Disable the dropdown or all list choices.
   *
   * @param {boolean} readOnly Whether editing is disabled.
   * @returns {HInputEnum} This input.
   */
  setReadOnly(readOnly) {
    super.setReadOnly(readOnly);
    for (const choice of this.choices || []) choice.disabled = Boolean(readOnly);
    return this;
  }

  /** @returns {string[]} Validation errors. */
  validate() {
    const value = this.getValue();
    return this.options.required && (value === null || (Array.isArray(value) && !value.length))
      ? ['A value is required']
      : [];
  }
}
