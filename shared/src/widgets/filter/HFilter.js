/**
 * @file HFilter.js
 * @brief The filters of a published page (plan 27b §11.3): a list of saved filters and
 *        query sources shown as buttons, a list or a select; choosing one runs it, a
 *        parameterized one shows its Filter Form (HFilterForm, without Builder) above the list.
 *
 * The Filter Form has Close (back to the list only). One item only: no list. A
 * parameterized single item shows its Filter Form alone, without Close; the
 * host does not show the pane at all for a single item without parameters (`needsPane`).
 * The items are references: the host resolves each one when it is chosen (`resolve`), so
 * the latest version of the filter is used. Also the Filter widget of a website page (plan 27l §3).
 *
 * With a `requestMonitor` (plan 27l §4) a loading veil covers the whole widget while requests run, with a Stop button
 * above it, as the query panel of Explorer (after a short delay, so quick requests do not make it flicker; review
 * 2026-11-16); Stop ends them all (`abortAll`: fetches aborted, the server asked to stop the SQL).
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
import { HFilterForm } from './HFilterForm.js';
import { hasQueryParameters, resolveQueryParameters } from '../../data/queryParameters.js';
import { $HR } from '../../ui/i18n/HResource.js';
import './HFilter.css';

/** Presentations of the list. */
const MODES = ['buttons', 'list', 'select'];

/** Milliseconds before Stop is shown (as the rail of Explorer). */
export const STOP_DELAY = 300;

/** List of filters of a page and the Filter Form of the chosen one. */
export class HFilter extends HBaseWidget {
  /**
   * @param {HTMLElement} container Widget host.
   * @param {object} options
   * @param {Array<{key: string, title: string, parameterized?: boolean}>} options.items Filters in their order.
   * @param {'buttons'|'list'|'select'} [options.mode='buttons'] Presentation of the list.
   * @param {(item: object) => Promise<object|null>} options.resolve The DataSource of an item
   *        (`{request: {q}, presentation: {filterForm}}`), null when it can not be read.
   * @param {(dataSource: object) => Promise<*>|*} options.onRun Run a DataSource (parameters resolved).
   * @param {object} [options.dbdefs] HDbDefs for the Filter Form.
   * @param {object} [options.apiClient] HeuristApiClient for the value lists and counts of the Filter Form.
   * @param {(error: Error) => void} [options.onError] An item could not be read or run.
   * @param {import('../../api/RequestMonitor.js').RequestMonitor|null} [options.requestMonitor] The requests of the
   *        page / Explorer: Stop while they run.
   * @returns {HFilter}
   */
  attach(container, options = {}) {
    super.attach(container, options);
    this.items = Array.isArray(options.items) ? options.items : [];
    this.mode = MODES.includes(options.mode) ? options.mode : 'buttons';
    this.selectedKey = null;
    this.form = null;
    this._run = 0;
    return this;
  }

  /**
   * @param {Array<object>} items Filter items.
   * @param {(key: string) => boolean} [isParameterized] Known parameterized items.
   * @returns {boolean} Whether a pane is needed: more than one item, or one parameterized item.
   */
  static needsPane(items, isParameterized = () => false) {
    if (!Array.isArray(items) || !items.length) return false;
    return items.length > 1 || isParameterized(items[0].key) === true;
  }

  /** @returns {HFilter} Render the form host and below it the list (one item: none). */
  render() {
    if (!this.container) throw new Error('HFilter must be attached before render');
    this.container.classList.add('h-widget', 'h-filter', `h-filter-${this.mode}`);
    this.container.replaceChildren();
    this._renderStop();
    this.formHost = document.createElement('div');
    this.formHost.className = 'h-filter-form-host';
    this.formHost.hidden = true;
    this.container.append(this.formHost);
    this.listElement = null;
    if (this.items.length > 1) {
      this.listElement = this.mode === 'select' ? this._renderSelect() : this._renderList();
      this.container.append(this.listElement);
    }
    this.state = 'rendered';
    return this;
  }

  /**
   * Choose an item: run it, or show its Filter Form when it has parameters.
   *
   * @param {string} key Item key.
   * @returns {Promise<boolean>} False when the item is unknown or could not be read.
   */
  async select(key) {
    const item = this.items.find((entry) => entry.key === key);
    if (!item) return false;
    const run = ++this._run;
    this.selectedKey = key;
    this._markSelected();
    let source;
    try {
      source = await this.options.resolve(item);
    } catch (error) {
      if (run === this._run) this.options.onError?.(error);
      return false;
    }
    if (run !== this._run) return false;
    if (!source?.request?.q) {
      this.options.onError?.(new Error(`${item.title}: ${$HR('this filter can not be read')}`));
      return false;
    }
    await this._closeForm();
    if (hasQueryParameters(source.request.q)) {
      this._showForm(source);
      return true;
    }
    await this.options.onRun(source);
    return true;
  }

  /**
   * The Filter Form of a source that is not one of the items, filled in with values (a Saved filter of a website page
   * with values still missing, plan 27j). A source without parameters runs at once.
   *
   * @param {object} source DataSource with `request.q` (with `$NAME$` parameters) and `presentation.filterForm`.
   * @param {object} [values] Values by parameter name.
   * @param {{key?: string|null}} [options] `key`: the item of this source, marked in the list.
   * @returns {Promise<boolean>}
   */
  async showSource(source, values = {}, { key = null } = {}) {
    if (!source?.request?.q) return false;
    ++this._run;
    // the item of the source, when it is one of the list (a Saved filter of the page URL, plan 27l §3)
    this.selectedKey = this.items.some((item) => item.key === key) ? key : null;
    this._markSelected();
    await this._closeForm();
    if (hasQueryParameters(source.request.q)) {
      this._showForm(source, values);
      return true;
    }
    await this.options.onRun(source);
    return true;
  }

  /**
   * Mark an item of the list without running it (its records are shown already).
   *
   * @param {string|null} key
   */
  mark(key) {
    this.selectedKey = this.items.some((item) => item.key === key) ? key : null;
    this._markSelected();
  }

  /** @inheritdoc */
  async destroy() {
    clearTimeout(this._stopTimer);
    this._unwatch?.();
    await this._closeForm();
    await super.destroy();
  }

  /**
   * The Stop button (hidden) and its watch of the request monitor: shown after STOP_DELAY while requests run.
   *
   * @private
   */
  _renderStop() {
    const monitor = this.options.requestMonitor;
    this._unwatch?.();
    this._unwatch = null;
    this.stopButton = null;
    if (!monitor?.addEventListener) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'h-btn h-btn-small h-btn-danger h-filter-stop';
    button.hidden = true;
    button.title = $HR('Stop the running search');
    const icon = document.createElement('span');
    icon.className = 'fa-solid fa-circle-stop';
    icon.setAttribute('aria-hidden', 'true');
    const caption = document.createElement('span');
    caption.className = 'h-i18n';
    caption.textContent = $HR('Stop');
    button.append(icon, ' ', caption);
    this.listen(button, 'click', () => {
      monitor.abortAll();
      this._showStop(false);
    });
    this.stopButton = button;
    this.container.append(button);
    const update = () => {
      if (!monitor.inFlightCount) {
        clearTimeout(this._stopTimer);
        this._stopTimer = null;
        this._showStop(false);
        return;
      }
      if (!this.stopButton.hidden || this._stopTimer) return;
      this._stopTimer = setTimeout(() => {
        this._stopTimer = null;
        this._showStop(monitor.inFlightCount > 0);
      }, STOP_DELAY);
    };
    monitor.addEventListener('change', update);
    this._unwatch = () => monitor.removeEventListener('change', update);
    update();
  }

  /** The loading veil over the widget and its Stop button. @private */
  _showStop(on) {
    if (this.stopButton) this.stopButton.hidden = !on;
    this.container?.classList.toggle('is-loading', Boolean(on && this.stopButton));
  }

  _renderList() {
    const list = document.createElement('div');
    list.className = this.mode === 'list' ? 'h-filter-list' : 'h-filter-buttons';
    list.setAttribute('role', 'listbox');
    for (const item of this.items) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = this.mode === 'list' ? 'h-filter-item' : 'h-btn h-filter-item';
      button.dataset.key = item.key;
      button.setAttribute('role', 'option');
      button.textContent = item.title;
      button.title = item.title;
      this.listen(button, 'click', () => void this.select(item.key));
      list.append(button);
    }
    return list;
  }

  _renderSelect() {
    const select = document.createElement('select');
    select.className = 'h-select h-filter-select';
    select.setAttribute('aria-label', $HR('Filter'));
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = $HR('Select a filter...');
    select.append(empty);
    for (const item of this.items) {
      const option = document.createElement('option');
      option.value = item.key;
      option.textContent = item.title;
      select.append(option);
    }
    this.listen(select, 'change', () => { if (select.value) void this.select(select.value); });
    return select;
  }

  _markSelected() {
    if (!this.listElement) return;
    if (this.mode === 'select') {
      this.listElement.value = this.selectedKey || '';
      return;
    }
    for (const button of this.listElement.children) {
      const on = button.dataset.key === this.selectedKey;
      button.classList.toggle('is-selected', on);
      button.setAttribute('aria-selected', on ? 'true' : 'false');
    }
  }

  /**
   * The Filter Form of a parameterized source: no Builder (no `onOpenBuilder`); Close only
   * with a list. The list is hidden while the form is open, Close shows it again.
   */
  _showForm(source, values = {}) {
    this.formHost.hidden = false;
    if (this.listElement) this.listElement.hidden = true;
    const host = document.createElement('div');
    this.formHost.replaceChildren(host);
    this.form = new HFilterForm().attach(host, {
      definition: { query: source.request.q, filterForm: source.presentation?.filterForm || null },
      values,
      dbdefs: this.options.dbdefs,
      apiClient: this.options.apiClient || null,
      composeQuery: (item, values) => resolveQueryParameters(item.query, values, item.filterForm),
      selectExtent: this.options.selectExtent || null,
      runtimeMode: 'published',
      onClose: this.listElement ? () => void this._closeForm() : null,
      onSubmit: ({ query }) => {
        const resolved = structuredClone(source);
        resolved.request.q = query.q;
        if (query.extent) resolved.request.extent = query.extent;
        return this.options.onRun(resolved);
      }
    }).render();
  }

  async _closeForm() {
    await this.form?.destroy();
    this.form = null;
    if (this.formHost) {
      this.formHost.replaceChildren();
      this.formHost.hidden = true;
    }
    if (this.listElement) this.listElement.hidden = false;
  }
}
