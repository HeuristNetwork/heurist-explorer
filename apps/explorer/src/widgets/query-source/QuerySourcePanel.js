/** Explorer-owned host combining QuerySourceEditor and DataSourceActions. */
import { QuerySourceEditor } from './QuerySourceEditor.js';
import { DataSourceActions } from './DataSourceActions.js';
import './QuerySourcePanel.css';

export class QuerySourcePanel {
  constructor(options = {}) { this.options = options; this.container = null; this.editor = null; this.actions = null; this.dataSource = null; }
  attach(container) { this.container = container; return this; }
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
      onDirtyChange: (dirty, draft) => { this.actions?.setDataSource(draft || this.dataSource, { getDraft: () => this.editor.getDraftDataSource() }); this.options.onDirtyChange?.(dirty, draft); }
    });
    this.editor.attach(editorHost).render();
    this.actions = new DataSourceActions(this.options);
    this.actions.attach(actionsHost).render();
    this.setDataSource(this.dataSource);
    return this;
  }
  setDataSource(source) { this.dataSource = source; this.editor?.setDataSource(source); this.actions?.setDataSource(source, { getDraft: () => this.editor?.getDraftDataSource() }); return this; }
  getDraftDataSource() { return this.editor?.getDraftDataSource() || this.dataSource; }
  isDirty() { return this.editor?.isDirty?.() === true; }
  markCommitted(source = null) { this.editor?.markCommitted(source); if (source) this.dataSource = source; this.actions?.setDataSource(this.dataSource, { getDraft: () => this.editor?.getDraftDataSource() }); }
  async destroy() { await this.editor?.destroy?.(); await this.actions?.destroy?.(); this.container?.replaceChildren(); }
}
