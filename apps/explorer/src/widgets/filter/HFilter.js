/**
 * @file HFilter.js
 * @brief Compact direct-query entry widget.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-explorer
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */
// Explorer owns HFilter and its local layout refinements. HBaseWidget, HMsg,
// i18n and the common HFilter baseline remain shared in client-core.
import { HBaseWidget } from '#shared/widgets';
import { HMsg, $HR } from '#shared/ui';
import { normalizeDataSource } from '../../core/DataSource.js';
import { isEmptySearchRequest } from '../../core/SavedFilterManager.js';
//import '#shared/widgets/HFilter.css';
import './HFilter.css';

const DEFAULT_OPTIONS = Object.freeze({
  showFilterBuilder: true,
  onFilterBuilder: null,
  describeQuery: null,
  onDataSource: null,
  editSavedFilter: null,
});

const SENTENCE_IDLE_MS = 700;

/**
 * Produces validated DataSource objects from direct queries.
 * The widget deliberately knows nothing about module/layout synchronisation.
 */
export class HFilter extends HBaseWidget {
  /**
   * @param {object} [options] Widget configuration.
   * @param {import('#shared/api').HeuristApiClient|null} [options.apiClient] Heurist API client; may also be supplied via `attach`.
   */
  constructor({ apiClient = null } = {}) {
    super();
    this.id = 'filter';
    this.type = 'filter';
    this.apiClient = apiClient;
    this.dataSource = null;
    this._countController = null;
    this._sentenceTimer = null;
    this._sentenceToken = 0;
  }

  /**
   * Attach the widget to its container and merge in default options.
   *
   * @param {HTMLElement} container Container element.
   * @param {object} [options] Widget options; see `DEFAULT_OPTIONS`.
   * @returns {HFilter} This instance, for chaining.
   * @throws {TypeError} When no `apiClient` is configured.
   */
  attach(container, options = {}) {
    super.attach(container, { ...DEFAULT_OPTIONS, ...options });
    this.apiClient = options.apiClient ?? this.apiClient;
    if (!this.apiClient) throw new TypeError('HFilter requires apiClient');
    return this;
  }

  /**
   * Render the widget's markup and bind its event handlers.
   *
   * @returns {Promise<HFilter>} This instance, for chaining.
   * @throws {Error} When the widget has not been attached yet.
   */
  async render() {
    if (!this.container) throw new Error('HFilter must be attached before render');
    this.clearListeners();
    this.container.classList.add('h-widget', 'h-filter');
    this.container.innerHTML = this._template();
    this._bindEvents();
    this.state = 'rendered';
    return this;
  }

  /**
   * Build the widget's inner HTML.
   *
   * @private
   * @returns {string}
   */
  _template() {
    return `
      <div class="h-filter-query-row">
        <textarea class="h-input h-grow h-filter-query" rows="2"
                  placeholder="${escapeHtml($HR('Enter query'))}" aria-label="${escapeHtml($HR('Search query'))}"></textarea>
        <div class="h-filter-query-actions">
          <div class="h-filter-query-actions-row">
            <button class="h-btn h-btn-primary" type="button" data-action="filter">
              <span class="fa-solid fa-filter" aria-hidden="true"></span> ${escapeHtml($HR('Filter'))}
            </button>
            ${this.options.showFilterBuilder ? `<button class="h-btn" type="button" data-action="filter-builder">${escapeHtml($HR('Filter Builder'))}</button>` : ''}
          </div>
          <div class="h-filter-query-actions-row">
            <button class="h-btn h-btn-small" type="button" data-action="save-reuse">${escapeHtml($HR('Save for re-use'))}</button>
          </div>
        </div>
        <div class="h-fih-sentence" data-role="sentence" hidden>
          <span class="h-fih-sentence-text" data-role="sentence-text"></span>
        </div>
      </div>
      <div class="h-filter-status h-muted" data-role="query-status" aria-live="polite"></div>
      `;
  }

  /**
   * Wire up query-box, filter/builder/save-for-reuse button event handlers.
   *
   * @private
   * @returns {void}
   */
  _bindEvents() {
    const queryInput = this.$('.h-filter-query');
    this.listen(queryInput, 'keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        this._emit('searchstart', { query: this.getQueryValue() });
        void this.executeDirectQuery();
      }
    });
    this.listen(queryInput, 'input', () => {
      this._hideSentence();
      clearTimeout(this._sentenceTimer);
      this._sentenceTimer = setTimeout(() => this._updateSentence(), SENTENCE_IDLE_MS);
    });
    this.listen(queryInput, 'blur', () => {
      clearTimeout(this._sentenceTimer);
      void this._updateSentence();
    });
    this.listen(this.$('[data-action="filter"]'), 'click', () => {
      this._emit('searchstart', { query: this.getQueryValue() });
      void this.executeDirectQuery();
    });
    this.listen(this.$('[data-action="filter-builder"]'), 'click', () => this.openFilterBuilder());
    this.listen(this.$('[data-action="save-reuse"]'), 'click', () => this._saveForReuse());
  }

  /**
   * Save the current query box content as a new saved filter.
   *
   * @private
   * @returns {Promise<object|null>} Saved-filter editor result, or `null` when the query is empty or saving failed.
   */
  async _saveForReuse() {
    const request = normalizeDirectQuery(this.getQueryValue());
    if (!request || isEmptySearchRequest(request)) {
      this._setQueryStatus($HR('Enter query'));
      return null;
    }
    return this._runSavedFilterEditor(null, request);
  }

  /**
   * Delegate to the host's Saved Filter editor.
   *
   * @private
   * @param {number|string|null} id Existing saved-filter id, or `null` to create one.
   * @param {object} request Seed request for the editor.
   * @returns {Promise<object|null>} Editor result, or `null` when unavailable or it failed.
   */
  async _runSavedFilterEditor(id, request) {
    if (typeof this.options.editSavedFilter !== 'function') {
      HMsg.showMsgErr($HR('Saved Filter editor is not available'));
      return null;
    }
    try {
      const result = await this.options.editSavedFilter(id, request);
      return result || null;
    } catch (error) {
      HMsg.showMsgErr(error?.message || String(error));
      return null;
    }
  }

  // --------------------------------------------------------------- query box ---

  /**
   * Read the raw query box text.
   *
   * @returns {string}
   */
  getQueryValue() {
    return this.$('.h-filter-query')?.value ?? '';
  }

  /**
   * Set the query box text from a string or a request-like object.
   *
   * @param {string|object|null} value Raw query text, or an object carrying `.q`/`.query`.
   * @param {{focus?: boolean}} [options] Pass `focus: false` to avoid moving focus into the box.
   * @returns {boolean} True when the query box exists and was updated.
   */
  setQueryValue(value, { focus = true } = {}) {
    const input = this.$('.h-filter-query');
    if (!input) return false;
    const normalized = value && typeof value === 'object'
      ? (value.q !== undefined ? value.q : value.query !== undefined ? value.query : value)
      : value;
    input.value = typeof normalized === 'string' ? normalized : JSON.stringify(normalized ?? '');
    this._setQueryStatus('');
    if (focus) input.focus();
    return true;
  }

  /**
   * SyncEngine datasource target: reflect only the executable q value.
   *
   * @param {object|null} source Datasource to display, or `null` to clear.
   * @returns {Promise<object|null>} The normalized, applied datasource.
   */
  async setDataSource(source) {
    this.dataSource = source == null ? null : normalizeDataSource(source);
    this.setQueryValue(this.dataSource?.request?.q ?? '', { focus: false });
    this.refreshSentence();
    return this.dataSource;
  }

  /**
   * Add a DOM event listener to the widget's container.
   *
   * @param {string} type Event type.
   * @param {Function} handler Event handler.
   * @param {object|boolean} [options] `addEventListener` options.
   * @returns {void}
   */
  addEventListener(type, handler, options) {
    this.container?.addEventListener(type, handler, options);
  }

  /**
   * Remove a DOM event listener from the widget's container.
   *
   * @param {string} type Event type.
   * @param {Function} handler Event handler.
   * @param {object|boolean} [options] `removeEventListener` options.
   * @returns {void}
   */
  removeEventListener(type, handler, options) {
    this.container?.removeEventListener(type, handler, options);
  }

  /**
   * Open the visual Filter Builder seeded with the current query box text.
   *
   * @returns {void}
   */
  openFilterBuilder() {
    if (typeof this.options.onFilterBuilder === 'function') {
      this.options.onFilterBuilder({ widget: this, query: this.$('.h-filter-query')?.value ?? '' });
      return;
    }
    this._emit('filterbuilder', { query: this.$('.h-filter-query')?.value ?? '' });
  }

  /**
   * Validate the query box (or a supplied value), fetch its result count, and publish a DataSource.
   *
   * @param {string|object|null} [value] Query to execute; defaults to the current query box text.
   * @returns {Promise<object|null>} The published DataSource, or `null` when empty, invalid, or aborted.
   */
  async executeDirectQuery(value = null) {
    const input = this.$('.h-filter-query');
    const raw = value ?? input?.value ?? '';
    const request = normalizeDirectQuery(raw);
    if (!request || isEmptySearchRequest(request)) {
      this._setQueryStatus($HR('Enter query'));
      return null;
    }
    this._setQueryStatus($HR('Checking') + '…');
    try {
      const count = await this._count(request);
      const dataSource = normalizeDataSource({
        reference: { type: 'query' },
        title: null,
        request,
        presentation: {},
        meta: { count, origin: 'search' }
      });
      this._setQueryStatus(formatCount(count));
      this._publish(dataSource);
      return dataSource;
    } catch (error) {
      if (error?.name === 'AbortError') return null;
      this._setQueryStatus($HR('Invalid query'));
      HMsg.showMsgErr(error?.message || String(error));
      return null;
    }
  }

  /**
   * Fetch a request's result count, aborting any previous in-flight count.
   *
   * @private
   * @param {object} request Executable request.
   * @returns {Promise<number>} Result count.
   * @throws {Error} When the count cannot be determined.
   */
  async _count(request) {
    this._countController?.abort();
    this._countController = new AbortController();
    // /records is the validation/count endpoint for the base record query.
    // Expansion rules stay in the emitted DataSource for consumers that support
    // them; they are not silently executed by /records.
    const query = { q: request?.q, detail: 'count' };
    if (request?.filter != null) query.filter = request.filter;
    if (request?.sort != null) query.sort = request.sort;
    const payload = await this.apiClient.get('/records', { query, signal: this._countController.signal });
    const value = Number(payload?.count ?? payload?.total ?? payload?.records_count ?? (typeof payload === 'number' ? payload : NaN));
    if (!Number.isFinite(value) || value < 0) throw new Error($HR('Cannot determine result count'));
    return value;
  }

  // ---------------------------------------------------------------- sentence ---

  /**
   * Force the described sentence to refresh now (e.g. after the builder writes back).
   *
   * @returns {HFilter} This instance, for chaining.
   */
  refreshSentence() {
    void this._updateSentence();
    return this;
  }

  /**
   * Re-describe the current query box text and show/hide the sentence readout accordingly.
   *
   * @private
   * @returns {Promise<void>}
   */
  async _updateSentence() {
    if (!this.isRendered) return;
    const panel = this.$('[data-role="sentence"]');
    if (!panel) return;
    const text = this.getQueryValue().trim();
    if (!text || typeof this.options.describeQuery !== 'function') {
      this._hideSentence();
      return;
    }
    const token = ++this._sentenceToken;
    let sentence = '';
    try {
      sentence = (await this.options.describeQuery(text)) || '';
    } catch {
      sentence = '';
    }
    if (token !== this._sentenceToken) return; // superseded by a newer request
    if (!sentence) { this._hideSentence(); return; }
    const textEl = this.$('[data-role="sentence-text"]');
    if (textEl) textEl.textContent = sentence;
    panel.hidden = false;
  }

  /**
   * Hide the sentence readout panel.
   *
   * @private
   * @returns {void}
   */
  _hideSentence() {
    const panel = this.$('[data-role="sentence"]');
    if (panel) panel.hidden = true;
  }

  /**
   * Invoke the `onDataSource` callback and emit a `datasourcechange` event.
   *
   * @private
   * @param {object} dataSource Published datasource.
   * @returns {void}
   */
  _publish(dataSource) {
    this.options.onDataSource?.(dataSource, this);
    this._emit('datasourcechange', dataSource);
  }

  /**
   * Dispatch a bubbling CustomEvent from the widget's container.
   *
   * @private
   * @param {string} name Event name.
   * @param {*} detail Event detail payload.
   * @returns {void}
   */
  _emit(name, detail) {
    this.container?.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));
  }

  /**
   * Set the status line text below the query box.
   *
   * @private
   * @param {string} text Status text; clears the line when empty.
   * @returns {void}
   */
  _setQueryStatus(text) { const el = this.$('[data-role="query-status"]'); if (el) el.textContent = text || ''; }

  /**
   * Abort any in-flight count request and clear the sentence-refresh timer.
   *
   * @returns {Promise<void>}
   */
  async destroy() {
    this._countController?.abort();
    clearTimeout(this._sentenceTimer);
    await super.destroy();
  }
}

/**
 * Normalize a raw query box value (string or request-like object) to an executable request.
 *
 * @param {string|object|null} value Raw query text, JSON text, or a request-like object.
 * @returns {object|null} Executable request, or `null` when empty.
 */
export function normalizeDirectQuery(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if ('q' in value || 'rules' in value || 'rulesonly' in value) return normalizeSearchRequest(value);
    return { q: value };
  }
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        if ('q' in parsed || 'rules' in parsed || 'rulesonly' in parsed) return normalizeSearchRequest(parsed);
        return { q: parsed };
      }
    } catch { /* ordinary Heurist query string */ }
  }
  return { q: text };
}

/** Normalize a request-like object's known fields into an executable request. */
function normalizeSearchRequest(value) {
  const request = {};
  if (value.q !== undefined) request.q = value.q;
  if (value.query !== undefined && request.q === undefined) request.q = value.query;
  if (value.rules !== undefined && value.rules !== null) request.rules = value.rules;
  if (value.rulesonly !== undefined && value.rulesonly !== null) request.rulesonly = value.rulesonly;
  if (value.w !== undefined && value.w !== null && value.w !== '') request.w = value.w;
  if (value.filter !== undefined && value.filter !== null && value.filter !== '') request.filter = value.filter;
  if (value.sort !== undefined && value.sort !== null && value.sort !== '') request.sort = value.sort;
  return request;
}

export { executableRequest, parseSavedFilterDefinition } from '../../core/SavedFilterManager.js';

/** Format a result count as a localized "N record(s)" string. */
function formatCount(count) { return `${count.toLocaleString()} ${$HR(count === 1 ? 'record' : 'records')}`; }

/** Escape HTML-significant characters in a string for safe interpolation into markup. */
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c])); }
