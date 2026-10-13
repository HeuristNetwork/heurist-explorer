/**
 * @file HInputBoolean.js
 * @brief Yes/no input for boolean fields (stored as "true" / "false").
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

/** Edits a boolean value: a select with empty, Yes and No. */
export class HInputBoolean extends HInput {
  /**
   * Create the select.
   *
   * @param {HTMLElement} host Control host.
   * @returns {HTMLSelectElement} Select control.
   */
  renderControl(host) {
    const control = document.createElement('select');
    control.className = 'h-select h-input-boolean';
    for (const [value, label] of [['', ''], ['true', $HR('Yes')], ['false', $HR('No')]]) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      control.append(option);
    }
    this.listen(control, 'change', () => this.notifyChange());
    host.append(control);
    return control;
  }

  /** @returns {string|null} "true", "false" or null. */
  getValue() {
    const value = this.control ? this.control.value : normalize(this.value);
    return value === '' ? null : value;
  }

  /**
   * Set the value (true/false, "true"/"false", "yes"/"no", 1/0).
   *
   * @param {*} value Boolean value.
   * @returns {HInputBoolean} This input.
   */
  setValue(value) {
    super.setValue(value);
    if (this.control) this.control.value = normalize(value) ?? '';
    return this;
  }
}

/** @returns {string|null} "true", "false" or null for an empty or unknown value. */
function normalize(value) {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value).trim().toLowerCase();
  if (['true', 'yes', 'y', 't', '1'].includes(text)) return 'true';
  if (['false', 'no', 'n', 'f', '0'].includes(text)) return 'false';
  return null;
}
