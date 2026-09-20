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
import { composeFilterRequest } from '../../utils/queryModel.js';
import queryVocabulary from '../../utils/queryVocabulary.json' with { type: 'json' };
import './QuerySourcePanel.css';

/** Explorer-owned host combining QuerySourceEditor and DataSourceActions. */
export class QuerySourcePanel {
  /** @param {object} [options] Forwarded to QuerySourceEditor and DataSourceActions; see their constructors. */
  constructor(options = {}) { this.options = options; this.container = null; this.editor = null; this.actions = null; this.dataSource = null; }

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
    const formHeader = document.createElement('div');
    formHeader.className = 'h-query-source-form-header';
    const openForm = document.createElement('button');
    openForm.type = 'button';
    openForm.className = 'h-btn h-btn-small h-i18n';
    openForm.textContent = 'Open Filter Form';
    openForm.addEventListener('click', () => void this.openFilterForm());
    const closeForm = document.createElement('button');
    closeForm.type = 'button';
    closeForm.className = 'h-btn h-btn-small h-i18n';
    closeForm.textContent = 'Close Filter Form';
    closeForm.addEventListener('click', () => this.closeFilterForm());
    formHeader.append(openForm, closeForm);
    const formHost = document.createElement('div');
    formHost.className = 'h-query-source-form-host';
    this.container.replaceChildren(formHeader, editorHost, formHost, actionsHost);
    this.editorHost = editorHost;
    this.formHost = formHost;
    this.openFormButton = openForm;
    this.closeFormButton = closeForm;
    this.editor = new QuerySourceEditor({
      dbdefs: this.options.dbdefs, lang: this.options.lang,
      openFilterBuilder: this.options.openFilterBuilder,
      editRules: this.options.editRules, describeRules: this.options.describeRules,
      onExecute: (source) => this.options.onExecute?.(source),
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
  setDataSource(source) { this.closeFilterForm(); this.dataSource = source; this.editor?.setDataSource(source); this.actions?.setDataSource(source, { getDraft: () => this.editor?.getDraftDataSource() }); this.actions?.setDirty(false); this._updateFormAction(); return this; }

  /** Open the Explorer map's extent selector for a geographic filter value. */
  selectExtent(current = null) {
    return this.options.selectExtent?.(current) ?? Promise.resolve(null);
  }

  /** Show the runtime form for the editor's parameterized query. */
  async openFilterForm() {
    const source = this.getDraftDataSource();
    const definition = source?.request?.q;
    if (!definition?.parameters || !definition?.builderModel) return;
    await this.closeFilterForm();
    this.form = new HFilterForm();
    this.form.attach(this.formHost, {
      definition,
      dbdefs: this.options.dbdefs,
      selectExtent: this.options.selectExtent,
      composeQuery: (item, values) => composeFilterRequest(item.builderModel, values, queryVocabulary),
      onSubmit: ({ query }) => {
        const runtimeSource = structuredClone(source);
        runtimeSource.request.q = query.q;
        if (query.extent) runtimeSource.request.extent = query.extent;
        void this.options.onExecute?.(runtimeSource);
      }
    }).render();
    this.editorHost.hidden = true;
    this._updateFormAction();
  }

  /** Hide the runtime form and return to the Query Source editor. */
  async closeFilterForm() {
    if (this.form) await this.form.destroy();
    this.form = null;
    if (this.editorHost) this.editorHost.hidden = false;
    if (this.formHost) this.formHost.replaceChildren();
    this._updateFormAction();
  }

  /** Update form action visibility from the current draft. */
  _updateFormAction(source = this.editor?.draft || this.dataSource) {
    // setDataSource notifies listeners before the textarea is synchronized.
    // Reading getDraftDataSource here would commit its old value over request.q.
    const query = source?.request?.q;
    if (this.openFormButton) this.openFormButton.hidden = Boolean(this.form) || !query?.parameters;
    if (this.closeFormButton) this.closeFormButton.hidden = !this.form;
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
  async destroy() { await this.closeFilterForm(); await this.editor?.destroy?.(); await this.actions?.destroy?.(); this.container?.replaceChildren(); }
}
