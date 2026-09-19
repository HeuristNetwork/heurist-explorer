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

/** Edits a single term ID through a dropdown. */
export class HInputEnum extends HInput {
  /**
   * Create a term dropdown from supplied options.
   *
   * @param {HTMLElement} host Control host.
   * @returns {HTMLSelectElement} Dropdown.
   */
  renderControl(host) {
    const select = document.createElement('select');
    select.className = 'h-select h-input-enum';

    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = this.options.emptyLabel || 'Select a value';
    empty.className = 'h-i18n';
    select.append(empty);

    for (const item of this.options.terms || []) {
      const option = document.createElement('option');
      option.value = String(item.id);
      option.textContent = item.label || String(item.id);
      select.append(option);
    }

    this.listen(select, 'change', () => this.notifyChange());
    host.append(select);
    return select;
  }

  /** @returns {number|null} Selected term ID. */
  getValue() {
    const value = this.control?.value;
    return value ? Number(value) : null;
  }

  /**
   * Select a term by ID.
   *
   * @param {number|string|null} value Term ID.
   * @returns {HInputEnum} This input.
   */
  setValue(value) {
    super.setValue(value);
    if (this.control) this.control.value = value == null ? '' : String(value);
    return this;
  }
}
