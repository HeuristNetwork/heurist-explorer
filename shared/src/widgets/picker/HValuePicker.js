/**
 * @file HValuePicker.js
 * @brief Filterable value list: a replacement for `<select>` over long or
 *        uncertain option lists (plan §4.2).
 *
 * Layout: a sticky filter row (filter icon | input | clear) above the list.
 * The filter row appears when the list is incomplete or longer than
 * `filterThreshold`. Values come from a value source (`load()` contract); a
 * complete source is filtered locally, an incomplete one is asked again with
 * the filter text (debounced, the previous request aborted).
 *
 * In controlled mode (`controlled: true`) there is no filter row: a host that
 * keeps focus elsewhere (the inline helper) drives it through
 * `setFilterText()`, `moveActive()` and `commitActive()`.
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

import { HBaseWidget } from '../HBaseWidget.js';
import { $HR } from '../../ui/i18n/HResource.js';
import {
  FILTER_ROW_THRESHOLD, MAX_RENDERED_ROWS, filterItems, limitRows, needsFilterRow
} from '../../data/valueSources/valueList.js';
import './HValuePicker.css';

const SEARCH_DELAY = 250;
let nextPickerId = 0;

/** Filterable, keyboard-driven list of values from a value source. */
export class HValuePicker extends HBaseWidget {
  /** Create an unattached picker. */
  constructor() {
    super();
    this._values = [];
    this._items = [];
    this._rows = [];
    this._total = 0;
    this._complete = true;
    this._text = '';
    this._active = -1;
    this._loaded = false;
    this._status = 'idle';
  }

  /**
   * @param {HTMLElement} container Picker host.
   * @param {object} options Picker options.
   * @param {object} options.source Value source (`load`, optional `labelFor`, `invalidate`).
   * @param {boolean} [options.multiple=false] Allow several values.
   * @param {*} [options.value] Initial value (array when multiple).
   * @param {boolean} [options.controlled=false] No own filter row; host-driven.
   * @param {boolean} [options.loadOnRender=false] Load at render (inline lists)
   *        instead of on first `open()`/`load()` (V11).
   * @param {number} [options.filterThreshold=30] Items above which the filter row shows.
   * @param {number} [options.maxRows=200] Rows rendered at most.
   * @param {string} [options.placeholder] Filter input placeholder.
   * @param {Function} [options.onPick] Called with the picked item.
   * @param {Function} [options.onChange] Called with the new value.
   * @returns {HValuePicker} This picker.
   */
  attach(container, options = {}) {
    super.attach(container, options);
    if (!options.source?.load) throw new TypeError('HValuePicker requires a value source');
    this.source = options.source;
    this._values = toValues(options.value);
    return this;
  }

  /** @returns {HValuePicker} This picker. */
  render() {
    if (!this.container) throw new Error('HValuePicker must be attached before render');
    this.container.replaceChildren();
    this.container.classList.add('h-widget', 'h-value-picker');
    const id = `h-value-picker-${++nextPickerId}`;

    this.filterRow = document.createElement('div');
    this.filterRow.className = 'h-value-picker-filter';
    this.filterRow.hidden = true;
    const icon = document.createElement('span');
    icon.className = 'fa-solid fa-filter h-value-picker-filter-icon';
    icon.setAttribute('aria-hidden', 'true');
    this.input = document.createElement('input');
    this.input.type = 'search';
    this.input.className = 'h-input h-value-picker-input';
    this.input.placeholder = this.options.placeholder || $HR('Filter values');
    this.input.setAttribute('aria-label', $HR('Filter values'));
    this.input.setAttribute('aria-controls', `${id}-list`);
    this.input.setAttribute('autocomplete', 'off');
    this.clearButton = document.createElement('button');
    this.clearButton.type = 'button';
    this.clearButton.className = 'heurist-icon-button h-value-picker-clear';
    this.clearButton.textContent = '×';
    this.clearButton.title = $HR('Clear filter');
    this.clearButton.setAttribute('aria-label', $HR('Clear filter'));
    this.clearButton.hidden = true;
    this.filterRow.append(icon, this.input, this.clearButton);

    this.list = document.createElement('ul');
    this.list.id = `${id}-list`;
    this.list.className = 'h-value-picker-list';
    this.list.setAttribute('role', 'listbox');
    if (this.options.multiple) this.list.setAttribute('aria-multiselectable', 'true');

    this.container.append(this.filterRow, this.list);

    if (!this.options.controlled) {
      this.listen(this.input, 'input', () => this._setText(this.input.value));
      this.listen(this.input, 'keydown', (event) => this._onKeyDown(event));
      this.listen(this.clearButton, 'click', () => {
        this.input.value = '';
        this._setText('');
        this.input.focus();
      });
    }
    // keep focus in the filter input (or the host's own input) while clicking a row
    this.listen(this.list, 'mousedown', (event) => event.preventDefault());
    this.delegate(this.list, 'click', '.h-value-picker-item', (_event, row) => {
      const item = this._rows[Number(row.dataset.index)];
      if (item) this.pick(item);
    });

    this.state = 'rendered';
    this._renderList();
    if (this.options.loadOnRender) void this.load();
    return this;
  }

  /** Load values once (first open, V11); later calls reuse them. */
  async open() {
    if (!this._loaded) await this.load();
    if (!this.options.controlled && !this.filterRow.hidden) this.input.focus();
  }

  /**
   * Forget the loaded list without loading: the next `open()` loads it (a
   * facet recount for a closed picker). A pending load is cancelled.
   *
   * @returns {void}
   */
  markStale() {
    this._abort?.abort();
    this._loaded = false;
    this._complete = true;
  }

  /**
   * (Re)load the list with the current filter text.
   *
   * @returns {Promise<void>}
   */
  async load() {
    this._abort?.abort();
    const controller = new AbortController();
    this._abort = controller;
    this._status = 'loading';
    this._renderList();
    try {
      const text = this._complete && this._loaded ? '' : this._text;
      const result = await this.source.load({ text, signal: controller.signal });
      if (controller.signal.aborted || this.state !== 'rendered') return;
      this._items = Array.isArray(result?.items) ? result.items : [];
      this._total = Number(result?.total) || this._items.length;
      this._complete = result?.complete !== false;
      this._loaded = true;
      this._status = 'ready';
    } catch (error) {
      if (controller.signal.aborted || error?.name === 'AbortError') return;
      this._items = [];
      this._total = 0;
      this._status = 'error';
      this.container?.dispatchEvent(new CustomEvent('h-value-picker-error', {
        bubbles: true, detail: { picker: this, error }
      }));
    }
    this._renderList();
  }

  /** Reload from the source, discarding its cache (dynamic facets). */
  async refresh() {
    this.source.invalidate?.();
    this._loaded = false;
    this._complete = true;
    await this.load();
  }

  /** @returns {boolean} Whether the last load failed. */
  hasError() {
    return this._status === 'error';
  }

  /** @returns {Array<object>} Items as loaded (unfiltered). */
  getItems() {
    return this._items;
  }

  /** @returns {{total: number, complete: boolean}} Size of the loaded list. */
  getInfo() {
    return { total: this._total, complete: this._complete };
  }

  /** @returns {*} Selected value, an array when `multiple`. */
  getValue() {
    return this.options.multiple ? this._values.slice() : this._values[0] ?? null;
  }

  /**
   * @param {*} value New value (array when multiple).
   * @returns {HValuePicker} This picker.
   */
  setValue(value) {
    this._values = toValues(value);
    if (!this.options.multiple) this._values = this._values.slice(0, 1);
    this._renderList();
    return this;
  }

  /**
   * Label of a value from the loaded items or the source.
   *
   * @param {*} value A value.
   * @returns {string} Label, or the value as text.
   */
  labelFor(value) {
    const item = this._items.find((candidate) => String(candidate.value) === String(value));
    return item?.label || this.source.labelFor?.(value) || String(value ?? '');
  }

  /**
   * Select (or, when multiple, toggle) an item.
   *
   * @param {object} item Item from the list.
   * @returns {void}
   */
  pick(item) {
    const key = String(item.value);
    if (this.options.multiple) {
      const index = this._values.findIndex((value) => String(value) === key);
      if (index >= 0) this._values.splice(index, 1);
      else this._values.push(item.value);
    } else {
      this._values = [item.value];
    }
    this._renderList();
    this.options.onPick?.(item);
    this._notify();
  }

  /** Clear the selection. */
  clear() {
    if (!this._values.length) return;
    this._values = [];
    this._renderList();
    this._notify();
  }

  /**
   * Set the filter text (controlled mode, or programmatically).
   *
   * @param {string} text Filter text.
   * @returns {void}
   */
  setFilterText(text) {
    if (this.input && this.input.value !== text) this.input.value = text ?? '';
    this._setText(text ?? '');
  }

  /**
   * Move the keyboard highlight.
   *
   * @param {number} delta Rows to move (negative is up).
   * @returns {void}
   */
  moveActive(delta) {
    if (!this._rows.length) return;
    const last = this._rows.length - 1;
    this._active = this._active < 0
      ? (delta > 0 ? 0 : last)
      : Math.max(0, Math.min(last, this._active + delta));
    this._syncActive();
  }

  /** @returns {object|null} Highlighted item, if any. */
  activeItem() {
    return this._rows[this._active] || null;
  }

  /**
   * Pick the highlighted item.
   *
   * @returns {boolean} True when an item was picked.
   */
  commitActive() {
    const item = this.activeItem();
    if (!item) return false;
    this.pick(item);
    return true;
  }

  /** Focus the filter input. */
  focus() {
    if (!this.filterRow?.hidden) this.input?.focus();
  }

  /** @returns {Promise<void>} Completion after aborting a pending request. */
  async destroy() {
    clearTimeout(this._searchTimer);
    this._abort?.abort();
    await super.destroy();
  }

  /** Apply a new filter text: locally when complete, otherwise ask the source. */
  _setText(text) {
    this._text = String(text ?? '');
    if (this.clearButton) this.clearButton.hidden = !this._text;
    this._active = -1;
    if (!this._loaded || this._complete) {
      this._renderList();
      return;
    }
    clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => void this.load(), SEARCH_DELAY);
  }

  /** Keyboard handling for the own filter input. */
  _onKeyDown(event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      this.moveActive(event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key === 'Home' || event.key === 'End') {
      if (!this._rows.length || event.shiftKey) return;
      event.preventDefault();
      this._active = event.key === 'Home' ? 0 : this._rows.length - 1;
      this._syncActive();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (this._active < 0 && this._rows.length === 1) this._active = 0;
      this.commitActive();
    } else if (event.key === 'Escape') {
      this.container?.dispatchEvent(new CustomEvent('h-value-picker-escape', { bubbles: true }));
    }
  }

  /** Render the visible rows and the status row. */
  _renderList() {
    if (!this.list) return;
    const visible = this._complete ? filterItems(this._items, this._text) : this._items;
    const threshold = Number(this.options.filterThreshold) || FILTER_ROW_THRESHOLD;
    this.filterRow.hidden = Boolean(this.options.controlled)
      || !(this._loaded && needsFilterRow({ complete: this._complete, total: this._total }, threshold))
        && !this._text;
    const { rows, shown, total } = limitRows(visible, Number(this.options.maxRows) || MAX_RENDERED_ROWS);
    this._rows = rows;
    if (this._active >= rows.length) this._active = rows.length - 1;
    const selected = new Set(this._values.map(String));
    const showCounts = this.options.showCounts ?? rows.some((item) => item.count != null);

    const nodes = [];
    let group = rows[0]?.group;
    rows.forEach((item, index) => {
      if (index && item.group !== group) {
        const separator = document.createElement('li');
        separator.className = 'h-value-picker-separator';
        separator.setAttribute('role', 'separator');
        nodes.push(separator);
      }
      group = item.group;
      nodes.push(this._row(item, index, selected.has(String(item.value)), showCounts));
    });

    const status = this._statusText(visible, shown, total);
    if (status) {
      const row = document.createElement('li');
      row.className = `h-value-picker-status h-i18n${this._status === 'error' ? ' is-error' : ''}`;
      row.setAttribute('role', 'presentation');
      row.textContent = status;
      nodes.push(row);
    }
    this.list.replaceChildren(...nodes);
    this._syncActive();
  }

  /** @returns {HTMLLIElement} One option row. */
  _row(item, index, isSelected, showCounts) {
    const row = document.createElement('li');
    row.className = 'h-value-picker-item';
    row.id = `${this.list.id}-${index}`;
    row.dataset.index = String(index);
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', String(isSelected));
    row.classList.toggle('is-selected', isSelected);
    row.classList.toggle('is-context', Boolean(item.context));
    if (this.options.multiple) {
      const mark = document.createElement('span');
      mark.className = `h-value-picker-check fa-regular ${isSelected ? 'fa-square-check' : 'fa-square'}`;
      mark.setAttribute('aria-hidden', 'true');
      row.append(mark);
    }
    const label = document.createElement('span');
    label.className = 'h-value-picker-label';
    label.textContent = item.label ?? String(item.value);
    label.title = label.textContent;
    if (item.depth) label.style.paddingInlineStart = `${Number(item.depth) * 1.25}em`;
    row.append(label);
    if (showCounts && item.count != null) {
      const count = document.createElement('span');
      count.className = 'h-value-picker-count';
      count.textContent = String(item.count);
      row.append(count);
    }
    return row;
  }

  /** @returns {string} Status row text, or `''` when none is needed. */
  _statusText(visible, shown, total) {
    if (this._status === 'loading') return $HR('Loading…');
    if (this._status === 'error') return $HR('Values could not be loaded');
    if (!this._loaded) return '';
    if (!visible.length) return this._text ? $HR('Nothing matches the filter') : $HR('No values');
    const all = this._complete ? total : Math.max(this._total, total);
    if (shown < all) return `${shown} ${$HR('of')} ${all} ${$HR('entries shown')}`;
    return '';
  }

  /** Mark the highlighted row and keep it scrolled into view. */
  _syncActive() {
    const rows = this.list?.querySelectorAll('.h-value-picker-item') || [];
    rows.forEach((row, index) => row.classList.toggle('is-active', index === this._active));
    const active = rows[this._active];
    const owner = this.options.controlled ? null : this.input;
    if (active) {
      owner?.setAttribute('aria-activedescendant', active.id);
      active.scrollIntoView?.({ block: 'nearest' });
    } else {
      owner?.removeAttribute('aria-activedescendant');
    }
  }

  /** Tell the host that the value changed. */
  _notify() {
    const value = this.getValue();
    this.options.onChange?.(value);
    this.container?.dispatchEvent(new CustomEvent('h-value-picker-change', {
      bubbles: true, detail: { picker: this, value }
    }));
  }
}

/** @returns {Array<*>} A value as a list of non-blank values. */
export function toValues(value) {
  const list = Array.isArray(value) ? value : value == null || value === '' ? [] : [value];
  return list.filter((item) => item != null && item !== '');
}
