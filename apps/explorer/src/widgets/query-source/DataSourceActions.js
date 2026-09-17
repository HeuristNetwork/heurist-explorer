/** Explorer-only persistence/workspace actions for the current DataSource. */
import { HBaseWidget } from '#shared/widgets/HBaseWidget.js';
import { $HR, HMsg } from '#shared/ui';
import { cloneDataSource } from '../../core/DataSource.js';
import './DataSourceActions.css';

export class DataSourceActions extends HBaseWidget {
  constructor({ onSaveFilter, onSaveSource, onUpdateSource, onWorkspaceAdd, onWorkspaceRemove, isInWorkspace } = {}) {
    super();
    Object.assign(this, { onSaveFilter, onSaveSource, onUpdateSource, onWorkspaceAdd, onWorkspaceRemove, isInWorkspace });
    this.dataSource = null;
    this.getDraft = null;
  }

  render() {
    if (!this.container) throw new Error('DataSourceActions must be attached before render');
    this.container.className = 'h-dsa';
    this._status = document.createElement('div'); this._status.className = 'h-dsa-status';
    this._buttons = document.createElement('div'); this._buttons.className = 'h-dsa-buttons';
    this._filter = action($HR('Save as Filter'), () => void this._run('filter'));
    this._source = action($HR('Save as Source'), () => void this._run('source'), 'h-btn h-btn-small h-btn-primary');
    this._workspace = action($HR('Add to Workspace'), () => void this._run('workspace'));
    this._buttons.append(this._filter, this._source, this._workspace);
    this.container.replaceChildren(this._status, this._buttons);
    this.state = 'rendered';
    void this.refresh();
    return this;
  }

  setDataSource(source, { getDraft = null } = {}) { this.dataSource = source ? safeClone(source) : null; this.getDraft = getDraft; if (this.isRendered) void this.refresh(); return this; }

  async refresh() {
    const ds = this.dataSource;
    const sourceId = ds?.reference?.type === 'source' ? ds.reference.id : null;
    let inWorkspace = false;
    try { inWorkspace = ds && typeof this.isInWorkspace === 'function' ? await this.isInWorkspace(ds) : false; } catch { /* status only */ }
    if (this._status) {
      const bits = [];
      if (sourceId) bits.push(`${$HR('Query Source')} #${sourceId}`);
      else bits.push($HR('Unsaved source'));
      if (inWorkspace) bits.push($HR('In Workspace'));
      this._status.textContent = bits.join(' · ');
      this._status.classList.toggle('is-persisted', !!sourceId);
      this._status.classList.toggle('is-workspace', !!inWorkspace);
    }
    if (this._source) this._source.textContent = sourceId ? $HR('Update Source') : $HR('Save as Source');
    if (this._workspace) this._workspace.textContent = inWorkspace ? $HR('Remove from Workspace') : $HR('Add to Workspace');
    this._inWorkspace = inWorkspace;
  }

  async _run(kind) {
    const draft = typeof this.getDraft === 'function' ? this.getDraft() : this.dataSource;
    if (!draft) return;
    try {
      if (kind === 'filter') await this.onSaveFilter?.(draft);
      else if (kind === 'source') {
        const id = draft.reference?.type === 'source' ? draft.reference.id : null;
        await (id ? this.onUpdateSource?.(draft, id) : this.onSaveSource?.(draft));
      } else if (this._inWorkspace) await this.onWorkspaceRemove?.(draft);
      else await this.onWorkspaceAdd?.(draft);
      // Refresh against the exact source acted on. The active DataSource may
      // still be the pre-edit version while the editor holds a dirty draft.
      if (kind === 'workspace') this.dataSource = safeClone(draft);
      await this.refresh();
    } catch (error) {
      HMsg.showMsgErr?.(error?.message || String(error));
      return null;
    }
  }
}
function action(label, handler, className = 'h-btn h-btn-small') { const b = document.createElement('button'); b.type = 'button'; b.className = className; b.textContent = label; b.addEventListener('click', handler); return b; }

function safeClone(source) { try { return cloneDataSource(source); } catch { return source == null ? null : (typeof structuredClone === 'function' ? structuredClone(source) : JSON.parse(JSON.stringify(source))); } }
