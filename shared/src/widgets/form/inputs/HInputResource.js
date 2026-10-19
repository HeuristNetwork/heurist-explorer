/**
 * @file HInputResource.js
 * @brief Record pointer input (plan 21 §5): the chosen record by title, shown as
 *        the presentation of `pointerMode` (`rst_PointerMode`):
 *        - `dropdown_add` / `dropdown`: a value picker over the allowed record types,
 *          with *Browse* (record manager) and, for `dropdown_add`, *Add record* after
 *          its filter input;
 *        - `addorbrowse` / `browseonly`: a button with the title; a click opens the
 *          record manager (with / without its Add buttons);
 *        - `addonly`: a button `Add <type>`; a click on the empty input opens the
 *          editor of a new record.
 *        A field without a type constraint adds through the host's Add record dialog
 *        (`addRecord(null)`, plan 21 Phase 4).
 *        Edit and View of the chosen record are shown on mouse over, when the host
 *        gives these actions. Without the host's `browseRecords` / `addRecord` the
 *        input is the plain value picker.
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
import { POINTER_MODES } from '../../../data/recordEditStructure.js';
import { showPopover } from '../../popover/popover.js';
import { $HR } from '../../../ui/i18n/HResource.js';
import './HInputResource.css';

/** Modes shown as a value picker. */
const DROPDOWN_MODES = new Set(['dropdown_add', 'dropdown']);

/** Edits a record id (pointer field). */
export class HInputResource extends HInput {
  /**
   * @param {HTMLElement} container Input host.
   * @param {object} options HInput options plus: `apiClient` (needed without `source`),
   *        `targetTypes` (allowed record types, empty = any), `source` (value source),
   *        `valueLabel` (title of the initial value), `pointerMode` (one of POINTER_MODES,
   *        default `dropdown`), `browseFilter` (`rst_PointerBrowseFilter`, extra query of the
   *        record manager), `showBrowse` (default false; edit forms set it, plan 21 §9.3),
   *        `showAdd` (default true), `dbdefs` (record type names), and the host actions
   *        `editRecord(id)` (may resolve with `{saved, record}`, the new title is then shown),
   *        `viewRecord(id)`, `browseRecords(options) → Promise<number[]|null>`,
   *        `addRecord(rectypeId) → Promise<{saved, recordId, record}>`.
   * @returns {HInputResource} This input.
   */
  attach(container, options = {}) {
    super.attach(container, options);
    this.source = options.source || new RecordTitleSource(options.apiClient, { rtyId: options.targetTypes || null });
    if (options.valueLabel) this.source.rememberLabel?.(this.value, options.valueLabel);
    this.mode = this._effectiveMode();
    return this;
  }

  /**
   * Create the picker or the button, and the Edit / View buttons.
   *
   * @param {HTMLElement} host Control host.
   * @returns {HTMLElement} Picker button or mode button.
   */
  renderControl(host) {
    // the input is as wide as the picker: the value tools stay beside it (unless a width is set)
    this.container.classList.add('h-form-input-compact');
    const wrap = document.createElement('div');
    wrap.className = `h-input-resource h-input-resource-${this.mode}`;
    const pickerHost = document.createElement('div');
    pickerHost.className = 'h-input-resource-picker';
    wrap.append(pickerHost);
    host.append(wrap);
    const control = DROPDOWN_MODES.has(this.mode) ? this._renderCombo(pickerHost) : this._renderButton(pickerHost);
    this._renderActions(wrap);
    if (this.value != null && !this.source.labelFor?.(this.value)) {
      // title of a value given without it
      void this.source.fetchLabels?.([this.value]).then(() => this._showValue());
    }
    return control;
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
    this._showValue();
    return this;
  }

  /** Disable or enable the picker / button and the Edit button. */
  setReadOnly(readOnly) {
    this._readOnly = Boolean(readOnly);
    this.combo?.setReadOnly(readOnly);
    if (this.modeButton) this.modeButton.disabled = this._readOnly;
    this._syncActions();
    return this;
  }

  /** @returns {Promise<void>} Completion after the picker is removed. */
  async destroy() {
    await this.combo?.destroy();
    await super.destroy();
  }

  /**
   * The mode in use: the record manager and Add need the host actions; without them
   * the input is the value picker.
   */
  _effectiveMode() {
    const mode = POINTER_MODES.includes(this.options.pointerMode) ? this.options.pointerMode : 'dropdown';
    if ((mode === 'addorbrowse' || mode === 'browseonly') && !this._canBrowse()) return 'dropdown';
    if (mode === 'addonly' && !this._canAdd()) return 'dropdown';
    return mode;
  }

  /** @returns {boolean} Whether the record manager can be opened. */
  _canBrowse() {
    return typeof this.options.browseRecords === 'function' && this.options.showBrowse === true;
  }

  /** Record types a new record can be added of (the allowed types), only with the host's `addRecord`. */
  _addTypes() {
    if (typeof this.options.addRecord !== 'function' || this.options.showAdd === false) return [];
    return (this.options.targetTypes || []).map(Number).filter((id) => id > 0);
  }

  /** @returns {boolean} Whether a record can be added: of an allowed type, or (no constraint) of any. */
  _canAdd() {
    if (typeof this.options.addRecord !== 'function' || this.options.showAdd === false) return false;
    return this._addTypes().length > 0 || this._unconstrained();
  }

  /** @returns {boolean} Whether the field allows any record type. */
  _unconstrained() {
    return !(this.options.targetTypes || []).some((id) => Number(id) > 0);
  }

  /** Value picker with Browse / Add after its filter input. */
  _renderCombo(host) {
    const actions = [];
    if (this._canBrowse()) {
      actions.push({ id: 'browse', icon: 'fa-table', title: 'Browse', run: () => this._browse() });
    }
    if (this.mode === 'dropdown_add' && this._canAdd()) {
      actions.push({ id: 'add', icon: 'fa-plus-circle', title: 'Add record', run: () => this._chooseTypeAndAdd(this.combo?.button) });
    }
    this.combo = new HValueCombo().attach(host, {
      source: this.source,
      multiple: false,
      value: this.value,
      emptyLabel: $HR('Select record…'),
      actions,
      onChange: (value) => {
        this.value = value ?? null;
        this._syncActions();
        this.notifyChange();
      }
    }).render();
    return this.combo.button;
  }

  /** Button with the title: opens the record manager, or (addonly, empty) a new record. */
  _renderButton(host) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'h-select h-input-resource-button';
    this.modeButton = button;
    this.modeButtonText = document.createElement('span');
    this.modeButtonText.className = 'h-input-resource-button-text';
    button.append(this.modeButtonText);
    if (this.mode !== 'addonly') {
      const icon = document.createElement('i');
      icon.className = 'fa-solid fa-table h-input-resource-button-icon';
      icon.setAttribute('aria-hidden', 'true');
      button.append(icon);
    }
    host.append(button);
    this.listen(button, 'click', () => {
      if (this.mode === 'addonly') {
        if (!this.getValue()) void this._chooseTypeAndAdd(button);
      } else void this._browse();
    });
    this._showValue();
    return button;
  }

  /** Show the current value on the picker or the button. */
  _showValue() {
    this.combo?.setValue(this.value);
    if (this.modeButtonText) {
      const id = this.getValue();
      const title = id ? (this.source.labelFor?.(id) || `#${id}`) : '';
      this.modeButtonText.textContent = title || this._emptyText();
      this.modeButton.title = title;
      this.modeButton.classList.toggle('is-empty', !title);
      this.modeButton.classList.toggle('is-clickable', !(this.mode === 'addonly' && id));
    }
    this._syncActions();
  }

  /** Text of the empty button: `Add <type>` / `Add record` (addonly), else "Select record…". */
  _emptyText() {
    if (this.mode !== 'addonly') return $HR('Select record…');
    const types = this._addTypes();
    const name = types.length === 1 ? this.options.dbdefs?.rectypeName?.(types[0]) : '';
    return name ? `${$HR('Add')} ${name}` : $HR('Add record');
  }

  /** Choose the record in the record manager (Select); its title is fetched for the picker. */
  async _browse() {
    const ids = await this.options.browseRecords({
      recordTypes: this.options.targetTypes || [],
      selectMode: 'select',
      allowAddition: this.mode !== 'browseonly' && this.mode !== 'dropdown' && this._canAdd(),
      query: this.options.browseFilter || null
    });
    const id = Number(ids?.[0]) || 0;
    if (!(id > 0) || id === this.getValue()) return;
    if (!this.source.labelFor?.(id)) await this.source.fetchLabels?.([id]);
    this._pick(id);
  }

  /** Add a record of the only allowed type, of one chosen from a menu, or (no constraint) of any type. */
  async _chooseTypeAndAdd(anchor) {
    if (this._unconstrained()) return this._canAdd() ? this._add(null) : null;
    const types = this._addTypes();
    if (types.length === 1) return this._add(types[0]);
    if (!types.length || !anchor) return null;
    const menu = document.createElement('div');
    menu.className = 'h-menu h-input-resource-type-menu';
    let popover = null;
    for (const id of types) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'h-menu-item';
      item.dataset.rectypeId = String(id);
      item.textContent = this.options.dbdefs?.rectypeName?.(id) || `#${id}`;
      item.addEventListener('click', () => {
        popover?.close();
        void this._add(id);
      });
      menu.append(item);
    }
    popover = showPopover(anchor, menu, { className: 'h-input-resource-type-popover' });
    return null;
  }

  /** New record in the host editor (null type: the host's Add record dialog); a saved one becomes the value. */
  async _add(rectypeId) {
    const result = await this.options.addRecord(rectypeId);
    const id = Number(result?.recordId ?? result?.record?.rec_ID) || 0;
    if (!result?.saved || !(id > 0)) return;
    const title = result.record?.rec_Title;
    if (title) this.source.rememberLabel?.(id, String(title).replace(/<[^>]*>/g, ''));
    else if (!this.source.labelFor?.(id)) await this.source.fetchLabels?.([id]);
    this._pick(id);
  }

  /** Set a chosen / new record and notify. */
  _pick(id) {
    this.value = id;
    this._showValue();
    this.notifyChange();
  }

  /** Edit and View of the chosen record (each only when the host gives the action; shown on mouse over). */
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
      this._showValue();
    }
  }

  /** The buttons only with a chosen record; no Edit in read-only mode. */
  _syncActions() {
    const empty = !(this.getValue() > 0);
    if (this.editButton) this.editButton.hidden = empty || this._readOnly === true;
    if (this.viewButton) this.viewButton.hidden = empty;
  }
}
