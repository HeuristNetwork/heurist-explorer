/**
 * @file HInputEnum.js
 * @brief Value-list input for shared forms: term IDs, or (for text fields in a
 *        list presentation) exact text values.
 *
 * Presentations (plan §3):
 * - `select` (default): an HValueCombo - a filterable picker, single or multiple;
 * - `radio` / `checkbox`: an explicit list when there are fewer than
 *   `listThreshold` values, otherwise the first `listThreshold` values and a
 *   picker below for the rest (a value picked there joins the list, checked).
 *
 * Values come from a value source (`options.source`) or, as before, from
 * `options.terms` (`{id, label, depth}`, depth 1 = top level).
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
import { toValues } from '../../picker/HValuePicker.js';
import { StaticSource } from '../../../data/valueSources/localSources.js';
import { FILTER_ROW_THRESHOLD, truncateForList } from '../../../data/valueSources/valueList.js';
import './HInputEnum.css';

/** Edits one or more values using a picker or a visible choice list. */
export class HInputEnum extends HInput {
  /**
   * @param {HTMLElement} container Input host.
   * @param {object} options Input options; besides the HInput ones:
   *        `source`, `terms`, `mode` (`select`|`radio`|`checkbox`), `multiple`,
   *        `orientation` (`column`|`inline`), `listThreshold`, `numeric`
   *        (values are numbers; default true unless a source says otherwise),
   *        `fallbackSource` (used when `source` fails), `emptyLabel`,
   *        `countsMode` (`brackets` default | `badge` | `none`),
   *        `countsAlign` (`label` default | `right`; column lists only).
   * @returns {HInputEnum} This input.
   */
  attach(container, options = {}) {
    super.attach(container, options);
    this.source = options.source || termsSource(options.terms);
    this.numeric = options.numeric !== false;
    this._selected = toValues(this.value).map((value) => this._cast(value));
    return this;
  }

  /** @returns {boolean} Whether several values may be chosen. */
  get isMultiple() {
    return this.options.mode === 'checkbox' || (this.options.mode !== 'radio' && this.options.multiple === true);
  }

  /**
   * Create the picker, or the explicit choice list.
   *
   * @param {HTMLElement} host Control host.
   * @returns {HTMLElement} Primary control.
   */
  renderControl(host) {
    this.host = host;
    if (this.options.mode === 'radio' || this.options.mode === 'checkbox') {
      this.listHost = document.createElement('div');
      this.listHost.className = `h-input-enum-list h-input-enum-${this.options.orientation === 'inline' ? 'inline' : 'column'}`
        + ` h-input-enum-counts-${countsMode(this.options.countsMode)}`
        + (this.options.countsAlign === 'right' ? ' h-input-enum-counts-right' : '');
      this.listHost.setAttribute('role', this.options.mode === 'radio' ? 'radiogroup' : 'group');
      host.append(this.listHost);
      void this._loadChoices();
      return this.listHost;
    }
    return this._renderCombo(host, { value: this.getValue() }).button;
  }

  /** @returns {number|string|Array|null} Selected value, or values when multiple. */
  getValue() {
    if (this.combo && !this.listHost) return this.combo.getValue();
    return this.isMultiple ? this._selected.slice() : this._selected[0] ?? null;
  }

  /**
   * Select a value or values.
   *
   * @param {*} value Value or values.
   * @returns {HInputEnum} This input.
   */
  setValue(value) {
    super.setValue(value);
    this._selected = toValues(value).map((item) => this._cast(item));
    if (!this.isMultiple) this._selected = this._selected.slice(0, 1);
    if (this.listHost) this._renderChoices();
    else this.combo?.setValue(this.getValueFromSelection());
    return this;
  }

  /** @returns {*} The internal selection shaped like `getValue()`. */
  getValueFromSelection() {
    return this.isMultiple ? this._selected.slice() : this._selected[0] ?? null;
  }

  /**
   * Disable the picker or all list choices.
   *
   * @param {boolean} readOnly Whether editing is disabled.
   * @returns {HInputEnum} This input.
   */
  setReadOnly(readOnly) {
    this._readOnly = Boolean(readOnly);
    this.combo?.setReadOnly(readOnly);
    for (const choice of this.choices || []) choice.disabled = this._readOnly;
    return this;
  }

  /** Reload values from the source (dynamic facets, V15). */
  async refresh() {
    this.source.invalidate?.();
    if (this.listHost) await this._loadChoices();
    else await this.combo?.refresh();
  }

  /** @returns {string[]} Validation errors. */
  validate() {
    const value = this.getValue();
    return this.options.required && (value === null || (Array.isArray(value) && !value.length))
      ? ['A value is required']
      : [];
  }

  /** @returns {Promise<void>} Completion after the pickers are removed. */
  async destroy() {
    await this.combo?.destroy();
    await this.moreCombo?.destroy();
    await super.destroy();
  }

  /** Build the combobox (the `select` presentation). */
  _renderCombo(host, { value }) {
    const wrap = document.createElement('div');
    wrap.className = 'h-input-enum-combo';
    host.append(wrap);
    this.combo = new HValueCombo().attach(wrap, {
      source: this.source,
      multiple: this.isMultiple,
      value,
      emptyLabel: this.options.emptyLabel,
      filterThreshold: this.options.filterThreshold,
      ...(this.options.countsMode === 'none' ? { showCounts: false } : {}),
      onChange: (next) => {
        this._selected = toValues(next);
        this.notifyChange();
      }
    }).render();
    this.listen(wrap, 'h-value-picker-error', () => this._useFallback());
    return this.combo;
  }

  /** Load the list items, then render the explicit list. */
  async _loadChoices() {
    try {
      const result = await this.source.load({});
      this._items = result?.items || [];
    } catch (error) {
      if (this._useFallback()) return this._loadChoices();
      this._items = [];
      this.container?.dispatchEvent(new CustomEvent('h-input-error', { bubbles: true, detail: { input: this, error } }));
    }
    if (this.state !== 'destroyed') this._renderChoices();
    return undefined;
  }

  /** Render the explicit radio/checkbox list and, when truncated, a picker below it. */
  _renderChoices() {
    if (!this.listHost || !this._items) return;
    const threshold = Number(this.options.listThreshold) || FILTER_ROW_THRESHOLD;
    const selectedKeys = new Set(this._selected.map(String));
    const { explicit, truncated } = truncateForList(this._items, threshold, this._selected);
    this.choices = [];
    this._radioName ||= `h-enum-${Math.random().toString(36).slice(2)}`;
    const nodes = [];

    for (const item of explicit) {
      const label = document.createElement('label');
      label.className = 'h-input-enum-choice';
      label.style.paddingInlineStart = `${Math.max(0, Number(item.depth) || 0) * 1.25}em`;
      const control = document.createElement('input');
      control.type = this.options.mode;
      control.name = this._radioName;
      control.value = String(item.value);
      control.checked = selectedKeys.has(String(item.value));
      control.disabled = Boolean(this._readOnly);
      const text = document.createElement('span');
      text.textContent = item.label ?? String(item.value);
      label.append(control, text);
      if (item.count != null) {
        const count = document.createElement('span');
        count.className = 'h-input-enum-count';
        count.textContent = String(item.count);
        label.append(count);
      }
      nodes.push(label);
      this.choices.push(control);
      this.listen(control, 'change', () => {
        const value = this._cast(item.value);
        if (this.options.mode === 'radio') this._selected = control.checked ? [value] : [];
        else if (control.checked) this._selected.push(value);
        else this._selected = this._selected.filter((selected) => String(selected) !== String(value));
        this.notifyChange();
      });
    }
    this.listHost.replaceChildren(...nodes);

    if (truncated) {
      if (!this.moreHost) {
        this.moreHost = document.createElement('div');
        this.moreHost.className = 'h-value-list-more';
        this.listHost.after(this.moreHost);
        this.moreCombo = new HValueCombo().attach(this.moreHost, {
          source: this.source,
          multiple: false,
          value: null,
          emptyLabel: this.options.moreLabel || 'More values…',
          filterThreshold: this.options.filterThreshold,
          ...(this.options.countsMode === 'none' ? { showCounts: false } : {}),
          onChange: (value) => {
            if (value == null) return;
            const cast = this._cast(value);
            if (this.options.mode === 'radio') this._selected = [cast];
            else if (!this._selected.some((selected) => String(selected) === String(cast))) this._selected.push(cast);
            this.moreCombo.setValue(null);
            this._renderChoices();
            this.notifyChange();
          }
        }).render();
      }
      this.moreHost.hidden = false;
      this.moreCombo.setReadOnly(Boolean(this._readOnly));
    } else if (this.moreHost) {
      this.moreHost.hidden = true;
    }
  }

  /** Switch to `fallbackSource` after the source failed; true when switched. */
  _useFallback() {
    const fallback = this.options.fallbackSource;
    if (!fallback || this.source === fallback) return false;
    this.source = fallback;
    if (this.combo && !this.listHost) {
      const value = this.combo.getValue();
      void this.combo.destroy();
      this.combo = null;
      this.host?.querySelector('.h-input-enum-combo')?.remove();
      this._renderCombo(this.host, { value });
    }
    return true;
  }

  /** @returns {number|string} A value in this input's value type. */
  _cast(value) {
    if (!this.numeric) return String(value);
    const number = Number(value);
    return Number.isFinite(number) && String(value).trim() !== '' ? number : value;
  }
}

/** @returns {string} A supported counts style; unknown values keep the default. */
function countsMode(mode) {
  return mode === 'badge' || mode === 'none' ? mode : 'brackets';
}

/** @returns {StaticSource} Source over legacy `{id, label, depth}` terms (depth 1 = top). */
function termsSource(terms = []) {
  return new StaticSource((terms || []).map((term) => ({
    value: Number(term.id ?? term.value),
    label: term.label || String(term.id ?? term.value),
    depth: Math.max(0, (Number(term.depth) || 1) - 1)
  })));
}
