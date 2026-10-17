/**
 * @file HInputResource.js
 * @brief Record pointer input: one record chosen by title from the allowed
 *        record types (a value picker over `GET /records/`), with Edit and View
 *        buttons for the chosen record when the host gives these actions.
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
import './HInputResource.css';

/** Edits a record id (pointer field). */
export class HInputResource extends HInput {
  /**
   * @param {HTMLElement} container Input host.
   * @param {object} options HInput options plus: `apiClient` (needed without `source`),
   *        `targetTypes` (allowed record types, empty = any), `source` (value source),
   *        `valueLabel` (title of the initial value), `editRecord(id)` (host editor; may
   *        resolve with `{saved, record}`, the new title is then shown), `viewRecord(id)`.
   * @returns {HInputResource} This input.
   */
  attach(container, options = {}) {
    super.attach(container, options);
    this.source = options.source || new RecordTitleSource(options.apiClient, { rtyId: options.targetTypes || null });
    if (options.valueLabel) this.source.rememberLabel?.(this.value, options.valueLabel);
    return this;
  }

  /**
   * Create the record picker and the Edit / View buttons.
   *
   * @param {HTMLElement} host Control host.
   * @returns {HTMLElement} Picker button.
   */
  renderControl(host) {
    // the input is as wide as the picker: the value tools stay beside it (unless a width is set)
    this.container.classList.add('h-form-input-compact');
    const wrap = document.createElement('div');
    wrap.className = 'h-input-resource';
    const comboHost = document.createElement('div');
    comboHost.className = 'h-input-resource-picker';
    wrap.append(comboHost);
    host.append(wrap);
    this.combo = new HValueCombo().attach(comboHost, {
      source: this.source,
      multiple: false,
      value: this.value,
      emptyLabel: $HR('Select record…'),
      onChange: (value) => {
        this.value = value ?? null;
        this._syncActions();
        this.notifyChange();
      }
    }).render();
    this._renderActions(wrap);
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
    this._syncActions();
    return this;
  }

  /** Disable or enable the picker and the Edit button. */
  setReadOnly(readOnly) {
    this._readOnly = Boolean(readOnly);
    this.combo?.setReadOnly(readOnly);
    this._syncActions();
    return this;
  }

  /** @returns {Promise<void>} Completion after the picker is removed. */
  async destroy() {
    await this.combo?.destroy();
    await super.destroy();
  }

  /** Edit and View of the chosen record (each only when the host gives the action). */
  _renderActions(wrap) {
    const actions = document.createElement('span');
    actions.className = 'h-input-resource-actions';
    const make = (icon, title, run) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'h-input-resource-action';
      button.title = $HR(title);
      button.setAttribute('aria-label', button.title);
      const glyph = document.createElement('i');
      glyph.className = `fa-solid ${icon}`;
      glyph.setAttribute('aria-hidden', 'true');
      button.append(glyph);
      this.listen(button, 'click', () => void run());
      actions.append(button);
      return button;
    };
    this.editButton = typeof this.options.editRecord === 'function'
      ? make('fa-pen', 'Edit', () => this._edit()) : null;
    this.viewButton = typeof this.options.viewRecord === 'function'
      ? make('fa-circle-info', 'View', () => this.options.viewRecord(this.getValue())) : null;
    if (actions.children.length) wrap.append(actions);
    this._syncActions();
  }

  /** Open the chosen record in the host editor; show its new title after a save. */
  async _edit() {
    const id = this.getValue();
    if (!id) return;
    const result = await this.options.editRecord(id);
    const title = result?.record?.rec_Title;
    if (result?.saved && title) {
      this.source.rememberLabel?.(id, String(title).replace(/<[^>]*>/g, ''));
      this.combo?.setValue(id);
    }
  }

  /** The buttons only with a chosen record; no Edit in read-only mode. */
  _syncActions() {
    const empty = !(this.getValue() > 0);
    if (this.editButton) this.editButton.hidden = empty || this._readOnly === true;
    if (this.viewButton) this.viewButton.hidden = empty;
  }
}
