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

/** Explorer-owned host combining QuerySourceEditor and DataSourceActions. */
export class QuerySourcePanel {
  /** @param {object} [options] Forwarded to QuerySourceEditor and DataSourceActions; see their constructors. */
  constructor(options = {}) {
    this.options = options;
    this.container = null;
    this.editor = null;
    this.actions = null;
    this.dataSource = null;
    this._resizeObserver = null;
    this._responsiveFrame = null;
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
    this._observeResponsiveLayout();
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
    this.show();
    await this.options.onClearResults?.();
    this._setFilterFormVisible(true);
    await this.closeFilterForm({ restoreEditor: false });
    this.form = new HFilterForm();
    this.form.attach(this.formHost, {
      definition: { query, filterForm: source.presentation?.filterForm || null },
      dbdefs: this.options.dbdefs,
      selectExtent: this.options.selectExtent,
      composeQuery: (item, values) => resolveQueryParameters(item.query, values),
      runtimeMode: 'main',
      onOpenBuilder: () => this._openFilterFormBuilder(),
      onClose: () => void this.closeFilterForm(),
      onSubmit: ({ query }) => {
        const runtimeSource = structuredClone(source);
        runtimeSource.request.q = query.q;
        if (query.extent) runtimeSource.request.extent = query.extent;
        void this.options.onExecute?.(runtimeSource);
      }
    }).render();
    this.formHost.classList.add('h-query-source-form-host');
    this._setFilterFormVisible(true);
    this._updateFormAction();
    this._scheduleResponsiveLayout();
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
    this._scheduleResponsiveLayout();
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
    this._scheduleResponsiveLayout();
  }

  /** Show the Query Source panel. */
  show() { if (this.container) this.container.hidden = false; return this; }

  /** Hide the Query Source panel, including any open runtime form. */
  hide() { if (this.container) this.container.hidden = true; this._scheduleResponsiveLayout(); return this; }

  /** Whether the editor/form panel is currently visible. */
  isVisible() { return this.container?.hidden !== true; }

  /** Whether the runtime Filter Form is currently open. */
  isFilterFormOpen() { return this.container?.classList.contains('is-filter-form-open') === true; }

  /**
   * Toggle editor/actions visibility. An open Filter Form always returns to the
   * visible editor instead of hiding the whole authoring area.
   */
  async toggleEditor() {
    if (this.isFilterFormOpen()) {
      this.show();
      await this.closeFilterForm();
      return true;
    }
    if (this.isVisible()) this.hide();
    else this.show();
    return this.isVisible();
  }

  _observeResponsiveLayout() {
    const shell = this.container?.closest?.('.h-explorer-module-shell');
    if (!shell || typeof ResizeObserver !== 'function') return;
    this._resizeObserver?.disconnect();
    this._resizeObserver = new ResizeObserver(() => this._scheduleResponsiveLayout());
    this._resizeObserver.observe(shell);
    if (this.formHost) this._resizeObserver.observe(this.formHost);
  }

  _scheduleResponsiveLayout() {
    const shell = this.container?.closest?.('.h-explorer-module-shell');
    if (!shell) return;
    const cancel = globalThis.cancelAnimationFrame || clearTimeout;
    const schedule = globalThis.requestAnimationFrame || ((callback) => setTimeout(callback, 0));
    if (this._responsiveFrame != null) cancel(this._responsiveFrame);
    this._responsiveFrame = schedule(() => {
      this._responsiveFrame = null;
      const vertical = this.formHost?.classList.contains('h-filter-form-vertical') === true;
      const formHeight = this.formHost?.scrollHeight || 0;
      const availableHeight = shell.clientHeight || window.innerHeight || 0;
      const enoughWidth = (shell.clientWidth || 0) >= 700;
      shell.classList.toggle('has-side-filter-form', this.isVisible() && this.isFilterFormOpen()
        && vertical && enoughWidth && formHeight > availableHeight / 3);
    });
  }

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
    this._resizeObserver?.disconnect();
    if (this._responsiveFrame != null) (globalThis.cancelAnimationFrame || clearTimeout)(this._responsiveFrame);
    this.container?.closest?.('.h-explorer-module-shell')?.classList.remove('has-side-filter-form');
    await this.closeFilterForm();
    await this.editor?.destroy?.();
    await this.actions?.destroy?.();
    this.container?.replaceChildren();
  }
}
