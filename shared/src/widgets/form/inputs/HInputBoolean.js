/**
 * @file HInputBoolean.js
 * @brief Input of boolean fields (stored as "true" / "false"): a select or a checkbox.
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

/**
 * Edits a boolean value. Option `mode` (2026-10-28): `select` (default) - empty, Yes and
 * No, so "no value" differs from No (record fields); `checkbox` - unchecked is "false"
 * (settings that always have a value, plan 29).
 */
export class HInputBoolean extends HInput {
  /** @returns {boolean} Whether the input is a checkbox. */
  get isCheckbox() {
    return this.options.mode === 'checkbox';
  }

  /**
   * Create the select or the checkbox.
   *
   * @param {HTMLElement} host Control host.
   * @returns {HTMLSelectElement|HTMLInputElement} Control.
   */
  renderControl(host) {
    let control;
    if (this.isCheckbox) {
      control = document.createElement('input');
      control.type = 'checkbox';
      control.className = 'h-input-boolean is-checkbox';
      control.checked = normalize(this.value) === 'true';
    } else {
      control = document.createElement('select');
      control.className = 'h-select h-input-boolean';
      for (const [value, label] of [['', ''], ['true', $HR('Yes')], ['false', $HR('No')]]) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        control.append(option);
      }
    }
    this.listen(control, 'change', () => this.notifyChange());
    host.append(control);
    return control;
  }

  /** @returns {string|null} "true", "false" or null (no value; never for a checkbox). */
  getValue() {
    if (!this.control) return normalize(this.value);
    if (this.isCheckbox) return this.control.checked ? 'true' : 'false';
    return this.control.value === '' ? null : this.control.value;
  }

  /**
   * Set the value (true/false, "true"/"false", "yes"/"no", 1/0).
   *
   * @param {*} value Boolean value.
   * @returns {HInputBoolean} This input.
   */
  setValue(value) {
    super.setValue(value);
    if (this.control && this.isCheckbox) this.control.checked = normalize(value) === 'true';
    else if (this.control) this.control.value = normalize(value) ?? '';
    return this;
  }
}

/** @returns {string|null} "true", "false" or null of a loosely written boolean. */
function normalize(value) {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value).trim().toLowerCase();
  if (['true', 'yes', 'y', 't', '1'].includes(text)) return 'true';
  if (['false', 'no', 'n', 'f', '0'].includes(text)) return 'false';
  return null;
}
