/**
 * @file QuerySourcePanel.js
 * @brief Explorer-owned host combining QuerySourceEditor and DataSourceActions.
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

import { QuerySourceEditor } from './QuerySourceEditor.js';
import { DataSourceActions } from './DataSourceActions.js';
import { $HR } from '#shared/ui';
import { HFilterForm } from '#shared/widgets/filter/HFilterForm.js';
import { hasQueryParameters, resolveQueryParameters } from '#shared/data/queryParameters.js';
import './QuerySourcePanel.css';

/**
 * Explorer-owned host combining QuerySourceEditor and DataSourceActions, or the
 * runtime Filter Form in their place. Placement and visibility belong to the host
 * (ExplorerAuthoringDock), reached through the `onShow` and `onModeChange` options.
 */
export class QuerySourcePanel {
  /**
   * @param {object} [options] Forwarded to QuerySourceEditor and DataSourceActions; see their constructors.
   * @param {Function} [options.onShow] Asks the host to make the panel visible.
   * @param {Function} [options.onModeChange] Receives `'editor'` or `'form'` when the panel switches.
   * @param {Function} [options.onStop] Stops the running queries (Stop button on the loading veil).
   * @param {'vertical'|'horizontal'} [options.orientation='vertical'] Editor layout (west or north pane).
   * @param {Function} [options.onFormPlacement] Called with `'west'` when a vertical Filter Form opens in the
   *        horizontal layout (it needs height), and with `null` when it closes.
   * @param {Function} [options.onFormVisible] Called with `true`/`false` when the Filter Form opens or closes.
   * Editor layout options (`expanded`, `onExpandedChange`, `onLayoutChange`, `canChangeLayout`, `onHelp`)
   * are forwarded to QuerySourceEditor.
   */
  constructor(options = {}) {
    this.options = options;
    this.container = null;
    this.editor = null;
    this.actions = null;
    this.dataSource = null;
    this.orientation = options.orientation === 'horizontal' ? 'horizontal' : 'vertical';
    /** Last Filter Form values per DataSource key (this session): a reopened form is filled with them. */
    this._lastValues = new Map();
  }

  /**
   * @param {HTMLElement} container Element to render into.
   * @returns {QuerySourcePanel} this, for chaining.
   */
  attach(container) { this.container = container; return this; }

  /** @returns {QuerySourcePanel} this, for chaining. */
  render() {
    if (!this.container) throw new Error('QuerySourcePanel must be attached before render');
    this.container.className = 'h-query-source-panel';
    this.container.classList.toggle('is-horizontal', this.orientation === 'horizontal');
    const editorHost = document.createElement('div'); editorHost.className = 'h-query-source-editor-host';
    const formHost = document.createElement('div');
    formHost.className = 'h-query-source-form-host';
    formHost.addEventListener('h-filter-form-reset', () => void this.options.onClearResults?.());
    // Stop button on the loading veil, for the editor and the Filter Form
    const stop = document.createElement('button');
    stop.type = 'button';
    stop.className = 'h-btn h-btn-small h-btn-danger h-query-source-stop';
    stop.innerHTML = '<span class="fa-solid fa-circle-stop" aria-hidden="true"></span> ';
    stop.append($HR('Stop'));
    stop.title = $HR('Stop the running query');
    stop.hidden = true;
    stop.addEventListener('click', () => void this.options.onStop?.());
    this.container.replaceChildren(editorHost, formHost, stop);
    this.editorHost = editorHost;
    this.formHost = formHost;
    this.stopButton = stop;
    this.editor = new QuerySourceEditor({
      dbdefs: this.options.dbdefs, lang: this.options.lang,
      openFilterBuilder: this.options.openFilterBuilder,
      editRules: this.options.editRules, describeRules: this.options.describeRules,
      orientation: this.orientation, expanded: this.options.expanded,
      onExpandedChange: this.options.onExpandedChange, onLayoutChange: this.options.onLayoutChange,
      canChangeLayout: this.options.canChangeLayout, onHelp: this.options.onHelp,
      onExecute: (source) => hasQueryParameters(source?.request?.q)
        ? this.openFilterForm() : this._execute(source),
      onApply: (source) => this.options.onApply?.(source),
      onDirtyChange: (dirty, draft) => {
        this._updateFormAction(draft);
        this.actions?.setDataSource(draft || this.dataSource, { getDraft: () => this.editor.getDraftDataSource() });
        this.actions?.setDirty(dirty);
        this.options.onDirtyChange?.(dirty, draft);
      }
    });
    this.editor.attach(editorHost).render();
    // Save and Add sit beside Filter and Builder in the editor (p2)
    this.actions = new DataSourceActions({
      ...this.options,
      inline: true,
      prepareSourceDraft: () => this.editor?.prepareDraftForSave?.() || this.editor?.getDraftDataSource?.()
    });
    this.actions.attach(this.editor.actionsSlot).render();
    this.setDataSource(this.dataSource);
    this._updateFormAction();
    return this;
  }
  /**
   * Lay the panel out for the west pane (vertical) or the north pane (horizontal).
   *
   * @param {'vertical'|'horizontal'} orientation Layout.
   * @returns {QuerySourcePanel} this, for chaining.
   */
  setOrientation(orientation) {
    this.orientation = orientation === 'horizontal' ? 'horizontal' : 'vertical';
    this.container?.classList.toggle('is-horizontal', this.orientation === 'horizontal');
    this.editor?.setOrientation(this.orientation);
    return this;
  }

  /**
   * @param {object|null} source DataSource to load into the editor and actions.
   * @param {object} [formOptions] For a parameterized query; see `openFilterForm`.
   * @returns {QuerySourcePanel} this, for chaining.
   */
  setDataSource(source, formOptions = {}) {
    this.dataSource = source;
    this.editor?.setDataSource(source);
    this.actions?.setDataSource(source, { getDraft: () => this.editor?.getDraftDataSource() });
    this.actions?.setDirty(false);
    this._updateFormAction();
    if (hasQueryParameters(source?.request?.q)) void this.openFilterForm(formOptions);
    else void this.closeFilterForm();
    return this;
  }

  /**
   * @param {string} key DataSource reference key.
   * @returns {object|null} Values of the last Filter Form search of that source, if any.
   */
  lastParameterValues(key) {
    const values = key ? this._lastValues.get(key) : null;
    return values ? structuredClone(values) : null;
  }

  /** Open the Explorer map's extent selector for a geographic filter value. */
  selectExtent(current = null) {
    return this.options.selectExtent?.(current) ?? Promise.resolve(null);
  }

  /**
   * Show the runtime form for the editor's parameterized query.
   *
   * @param {object} [options]
   * @param {object|null} [options.values] Values to fill in; default: the last search of this source.
   * @param {boolean} [options.keepResults=false] Keep the current result (it is the search of these values).
   */
  async openFilterForm({ values = null, keepResults = false } = {}) {
    const source = this.getDraftDataSource();
    const query = source?.request?.q;
    if (!hasQueryParameters(query)) return;
    const key = source.reference?.key || null;
    this.options.onShow?.();
    if (!keepResults) await this.options.onClearResults?.();
    // a vertical form needs height: in the horizontal layout it opens in the west pane
    const horizontalForm = source.presentation?.filterForm?.settings?.orientation === 'horizontal';
    // reopened while already moved: the panel is vertical now, but still returns on close
    if (!this._formPlaced && !horizontalForm && this.orientation === 'horizontal') {
      this._formPlaced = true;
      this.options.onFormPlacement?.('west');
    }
    this._setFilterFormVisible(true);
    await this.closeFilterForm({ restoreEditor: false });
    this.form = new HFilterForm();
    this.form.attach(this.formHost, {
      definition: { query, filterForm: source.presentation?.filterForm || null },
      values: values || this.lastParameterValues(key) || {},
      dbdefs: this.options.dbdefs,
      apiClient: this.options.apiClient,
      selectExtent: this.options.selectExtent,
      composeQuery: (item, values) => resolveQueryParameters(item.query, values, item.filterForm),
      runtimeMode: 'main',
      onOpenBuilder: () => this._openFilterFormBuilder(),
      onClose: () => void this.closeFilterForm(),
      onSubmit: ({ query, values: submitted }) => {
        if (key) this._lastValues.set(key, structuredClone(submitted || {}));
        const runtimeSource = structuredClone(source);
        runtimeSource.request.q = query.q;
        if (query.extent) runtimeSource.request.extent = query.extent;
        // returned: the form recounts its facets when the search is done
        return this._execute(runtimeSource);
      }
    }).render();
    this.formHost.classList.add('h-query-source-form-host');
    this._setFilterFormVisible(true);
    this._updateFormAction();
  }

  /**
   * Run a search from the editor or the Filter Form with the loading veil shown.
   *
   * @private
   * @param {object} source DataSource to execute.
   * @returns {Promise<*>} Resolves when the search is done (or stopped).
   */
  _execute(source) {
    this.setLoading(true);
    return Promise.resolve(this.options.onExecute?.(source)).finally(() => this.setLoading(false));
  }

  /**
   * Show or hide a loading veil over the whole panel while a submitted search
   * is in flight. The veil blocks the editor and the Filter Form; the Stop
   * button stays usable above it.
   *
   * @param {boolean} loading Whether a load is in progress.
   * @returns {void}
   */
  setLoading(loading) {
    this._loadingCount = Math.max(0, (this._loadingCount || 0) + (loading ? 1 : -1));
    const active = this._loadingCount > 0;
    this.container?.classList.toggle('is-loading', active);
    if (this.stopButton) this.stopButton.hidden = !active;
  }

  /** Open the Filter Builder on the runtime Filter Form's current query source, then refresh the form. */
  async _openFilterFormBuilder() {
    if (typeof this.options.openFilterBuilder !== 'function') return;
    const current = this.getDraftDataSource();
    const result = await this.options.openFilterBuilder(
      structuredClone(current.request.q),
      structuredClone(current.presentation?.filterForm || null)
    );
    if (result == null) return;
    this.editor?.setQuery(result);
    const updated = this.getDraftDataSource();
    if (hasQueryParameters(updated?.request?.q)) await this.openFilterForm();
    else void this.options.onExecute?.(updated);
  }

  /** Hide the runtime form and return to the Query Source editor. */
  async closeFilterForm({ restoreEditor = true } = {}) {
    if (this.form) await this.form.destroy();
    this.form = null;
    if (restoreEditor) {
      this._setFilterFormVisible(false);
      if (this._formPlaced) this.options.onFormPlacement?.(null);
      this._formPlaced = false;
    }
    if (this.formHost) this.formHost.replaceChildren();
    this._updateFormAction();
  }

  /** Show either the runtime Filter Form or the Query Source editing controls. */
  _setFilterFormVisible(visible) {
    this.container?.classList.toggle('is-filter-form-open', visible);
    if (this.editorHost) {
      this.editorHost.hidden = visible;
      if (visible) this.editorHost.style.setProperty('display', 'none', 'important');
      else this.editorHost.style.removeProperty('display');
    }
    if (this.formHost) {
      this.formHost.hidden = !visible;
      if (visible) this.formHost.style.removeProperty('display');
    }
    this.options.onModeChange?.(visible ? 'form' : 'editor');
    this.options.onFormVisible?.(visible);
  }

  /** Whether the runtime Filter Form is currently open. */
  isFilterFormOpen() { return this.container?.classList.contains('is-filter-form-open') === true; }

  /** Update form action visibility from the current draft. */
  _updateFormAction(source = this.editor?.draft || this.dataSource) {
    // setDataSource notifies listeners before the textarea is synchronized.
    // Reading getDraftDataSource here would commit its old value over request.q.
    void source;
  }

  /** @returns {object|null} The editor's current draft DataSource, or the last committed one. */
  getDraftDataSource() { return this.editor?.getDraftDataSource() || this.dataSource; }

  /** Replace the draft's expansion rules; see QuerySourceEditor#setRules. */
  setRules(rules) { this.editor?.setRules(rules); }

  /** @returns {object|null} A save-ready draft, e.g. with an auto-generated title when blank. */
  prepareDraftForSave() { return this.editor?.prepareDraftForSave?.() || this.getDraftDataSource(); }

  /** @returns {boolean} Whether the draft has unsaved changes. */
  isDirty() { return this.editor?.isDirty?.() === true; }

  /** @returns {boolean} Whether the draft has Query Source-specific configuration worth protecting on navigation. */
  hasConfiguredFields() { return this.editor?.hasConfiguredFields?.() === true; }

  /** @param {object|null} [source] DataSource to adopt as committed; defaults to the current draft. */
  markCommitted(source = null) { this.editor?.markCommitted(source); if (source) this.dataSource = source; this.actions?.setDataSource(this.dataSource, { getDraft: () => this.editor?.getDraftDataSource() }); this.actions?.setDirty(false); }

  /** Tear down the editor and actions widgets and empty the container. */
  async destroy() {
    await this.closeFilterForm();
    await this.editor?.destroy?.();
    await this.actions?.destroy?.();
    this.container?.replaceChildren();
  }
}
