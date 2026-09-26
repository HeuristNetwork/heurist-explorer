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
   */
  constructor(options = {}) {
    this.options = options;
    this.container = null;
    this.editor = null;
    this.actions = null;
    this.dataSource = null;
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
    const editorHost = document.createElement('div'); editorHost.className = 'h-query-source-editor-host';
    const actionsHost = document.createElement('div'); actionsHost.className = 'h-data-source-actions-host';
    const formHost = document.createElement('div');
    formHost.className = 'h-query-source-form-host';
    formHost.addEventListener('h-filter-form-reset', () => void this.options.onClearResults?.());
    this.container.replaceChildren(editorHost, actionsHost, formHost);
    this.editorHost = editorHost;
    this.actionsHost = actionsHost;
    this.formHost = formHost;
    this.editor = new QuerySourceEditor({
      dbdefs: this.options.dbdefs, lang: this.options.lang,
      openFilterBuilder: this.options.openFilterBuilder,
      editRules: this.options.editRules, describeRules: this.options.describeRules,
      onExecute: (source) => hasQueryParameters(source?.request?.q)
        ? this.openFilterForm() : this.options.onExecute?.(source),
      onApply: (source) => this.options.onApply?.(source),
      onDirtyChange: (dirty, draft) => {
        this._updateFormAction(draft);
        this.actions?.setDataSource(draft || this.dataSource, { getDraft: () => this.editor.getDraftDataSource() });
        this.actions?.setDirty(dirty);
        this.options.onDirtyChange?.(dirty, draft);
      }
    });
    this.editor.attach(editorHost).render();
    this.actions = new DataSourceActions({
      ...this.options,
      prepareSourceDraft: () => this.editor?.prepareDraftForSave?.() || this.editor?.getDraftDataSource?.()
    });
    this.actions.attach(actionsHost).render();
    this.setDataSource(this.dataSource);
    this._updateFormAction();
    return this;
  }
  /**
   * @param {object|null} source DataSource to load into the editor and actions.
   * @returns {QuerySourcePanel} this, for chaining.
   */
  setDataSource(source) {
    this.dataSource = source;
    this.editor?.setDataSource(source);
    this.actions?.setDataSource(source, { getDraft: () => this.editor?.getDraftDataSource() });
    this.actions?.setDirty(false);
    this._updateFormAction();
    if (hasQueryParameters(source?.request?.q)) void this.openFilterForm();
    else void this.closeFilterForm();
    return this;
  }

  /** Open the Explorer map's extent selector for a geographic filter value. */
  selectExtent(current = null) {
    return this.options.selectExtent?.(current) ?? Promise.resolve(null);
  }

  /** Show the runtime form for the editor's parameterized query. */
  async openFilterForm() {
    const source = this.getDraftDataSource();
    const query = source?.request?.q;
    if (!hasQueryParameters(query)) return;
    this.options.onShow?.();
    await this.options.onClearResults?.();
    this._setFilterFormVisible(true);
    await this.closeFilterForm({ restoreEditor: false });
    this.form = new HFilterForm();
    this.form.attach(this.formHost, {
      definition: { query, filterForm: source.presentation?.filterForm || null },
      dbdefs: this.options.dbdefs,
      apiClient: this.options.apiClient,
      selectExtent: this.options.selectExtent,
      composeQuery: (item, values) => resolveQueryParameters(item.query, values, item.filterForm),
      runtimeMode: 'main',
      onOpenBuilder: () => this._openFilterFormBuilder(),
      onClose: () => void this.closeFilterForm(),
      onSubmit: ({ query }) => {
        const runtimeSource = structuredClone(source);
        runtimeSource.request.q = query.q;
        if (query.extent) runtimeSource.request.extent = query.extent;
        this.setLoading(true);
        Promise.resolve(this.options.onExecute?.(runtimeSource)).finally(() => this.setLoading(false));
      }
    }).render();
    this.formHost.classList.add('h-query-source-form-host');
    this._setFilterFormVisible(true);
    this._updateFormAction();
  }

  /**
   * Show or hide a loading veil over the runtime Filter Form while its
   * submitted search is in flight. The form's own inputs/engine have no
   * visibility into that - it's a host-owned widget, not part of the data
   * module - so this is set directly around the onSubmit -> onExecute call.
   *
   * @param {boolean} loading Whether a load is in progress.
   * @returns {void}
   */
  setLoading(loading) {
    this.formHost?.classList.toggle('is-loading', Boolean(loading));
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
    if (restoreEditor) this._setFilterFormVisible(false);
    if (this.formHost) this.formHost.replaceChildren();
    this._updateFormAction();
  }

  /** Show either the runtime Filter Form or the Query Source editing controls. */
  _setFilterFormVisible(visible) {
    this.container?.classList.toggle('is-filter-form-open', visible);
    for (const host of [this.editorHost, this.actionsHost]) {
      if (!host) continue;
      host.hidden = visible;
      if (visible) host.style.setProperty('display', 'none', 'important');
      else host.style.removeProperty('display');
    }
    if (this.formHost) {
      this.formHost.hidden = !visible;
      if (visible) this.formHost.style.removeProperty('display');
    }
    this.options.onModeChange?.(visible ? 'form' : 'editor');
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
