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
    this.container.replaceChildren(editorHost, actionsHost);
    this.editor = new QuerySourceEditor({
      dbdefs: this.options.dbdefs, lang: this.options.lang,
      openFilterBuilder: this.options.openFilterBuilder,
      editRules: this.options.editRules, describeRules: this.options.describeRules,
      onExecute: (source) => this.options.onExecute?.(source),
      onApply: (source) => this.options.onApply?.(source),
      onDirtyChange: (dirty, draft) => {
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
    if (this.dataSource) this.setDataSource(this.dataSource);
    return this;
  }
  /**
   * @param {object|null} source DataSource to load into the editor and actions.
   * @returns {QuerySourcePanel} this, for chaining.
   */
  setDataSource(source) { this.dataSource = source; this.editor?.setDataSource(source); this.actions?.setDataSource(source, { getDraft: () => this.editor?.getDraftDataSource() }); this.actions?.setDirty(false); return this; }

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
  async destroy() { await this.editor?.destroy?.(); await this.actions?.destroy?.(); this.container?.replaceChildren(); }
}
