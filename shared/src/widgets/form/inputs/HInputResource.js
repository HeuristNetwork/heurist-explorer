/**
 * @file HInputResource.js
 * @brief Record pointer input: one record chosen by title from the allowed
 *        record types (a value picker over `GET /records/`).
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
import { HValueCombo } from '../../picker/HValueCombo.js';
import { RecordTitleSource } from '../../../data/valueSources/FieldValueSource.js';
import { $HR } from '../../../ui/i18n/HResource.js';

/** Edits a record id (pointer field). */
export class HInputResource extends HInput {
  /**
   * @param {HTMLElement} container Input host.
   * @param {object} options HInput options plus: `apiClient` (needed without `source`),
   *        `targetTypes` (allowed record types, empty = any), `source` (value source),
   *        `valueLabel` (title of the initial value).
   * @returns {HInputResource} This input.
   */
  attach(container, options = {}) {
    super.attach(container, options);
    this.source = options.source || new RecordTitleSource(options.apiClient, { rtyId: options.targetTypes || null });
    if (options.valueLabel) this.source.rememberLabel?.(this.value, options.valueLabel);
    return this;
  }

  /**
   * Create the record picker.
   *
   * @param {HTMLElement} host Control host.
   * @returns {HTMLElement} Picker button.
   */
  renderControl(host) {
    const wrap = document.createElement('div');
    wrap.className = 'h-input-resource';
    host.append(wrap);
    this.combo = new HValueCombo().attach(wrap, {
      source: this.source,
      multiple: false,
      value: this.value,
      emptyLabel: $HR('Select record…'),
      onChange: (value) => {
        this.value = value ?? null;
        this.notifyChange();
      }
    }).render();
    if (this.value != null && !this.source.labelFor?.(this.value)) {
      // title of a value given without it
      void this.source.fetchLabels?.([this.value]).then(() => this.combo?.setValue(this.value));
    }
    return this.combo.button;
  }

  /** @returns {number|null} Record id. */
  getValue() {
    const value = this.combo ? this.combo.getValue() : this.value;
    return Number(value) > 0 ? Number(value) : null;
  }

  /**
   * Select a record.
   *
   * @param {number|string|null} value Record id.
   * @returns {HInputResource} This input.
   */
  setValue(value) {
    super.setValue(Number(value) > 0 ? Number(value) : null);
    this.combo?.setValue(this.value);
    return this;
  }

  /** Disable or enable the picker. */
  setReadOnly(readOnly) {
    this.combo?.setReadOnly(readOnly);
    return this;
  }

  /** @returns {Promise<void>} Completion after the picker is removed. */
  async destroy() {
    await this.combo?.destroy();
    await super.destroy();
  }
}
