/**
 * @file DataSourceActions.js
 * @brief Explorer-only persistence/workspace actions for the current DataSource.
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

import { HBaseWidget } from '#shared/widgets/HBaseWidget.js';
import { $HR, HMsg } from '#shared/ui';
import { cloneDataSource } from '../../core/DataSource.js';
import './DataSourceActions.css';

/** Explorer-only persistence/workspace actions for the current DataSource. */
export class DataSourceActions extends HBaseWidget {
  /**
   * @param {object} [options] Widget configuration.
   * @param {Function} [options.onSaveFilter] Called with the draft DataSource to save it as a Filter.
   * @param {Function} [options.onSaveSource] Called with the prepared draft to persist it as a new Query Source.
   * @param {Function} [options.onUpdateSource] Called with the prepared draft and source id to update an existing Query Source.
   * @param {Function} [options.onWorkspaceAdd] Called with the draft DataSource to add it to the Workspace.
   * @param {Function} [options.onWorkspaceRemove] Called with the draft DataSource to remove it from the Workspace.
   * @param {Function} [options.isInWorkspace] Predicate resolving whether a DataSource is currently in the Workspace.
   * @param {Function} [options.prepareSourceDraft] Returns a save-ready draft, e.g. with an auto-generated title.
   */
  constructor({ onSaveFilter, onSaveSource, onUpdateSource, onWorkspaceAdd, onWorkspaceRemove, isInWorkspace, prepareSourceDraft } = {}) {
    super();
    Object.assign(this, { onSaveFilter, onSaveSource, onUpdateSource, onWorkspaceAdd, onWorkspaceRemove, isInWorkspace, prepareSourceDraft });
    this.dataSource = null;
    this.getDraft = null;
    this.dirty = false;
  }

  /** @returns {DataSourceActions} this, for chaining. */
  render() {
    if (!this.container) throw new Error('DataSourceActions must be attached before render');
    this.container.className = 'h-dsa';
    this._status = document.createElement('div'); this._status.className = 'h-dsa-status';
    this._buttons = document.createElement('div'); this._buttons.className = 'h-dsa-buttons';
    this._filter = action($HR('Save as Filter'), () => void this._run('filter'));
    this._filter.title = $HR('Save only the reusable search definition.');
    this._source = action($HR('Save as Source'), () => void this._run('source'), 'h-btn h-btn-small h-btn-primary');
    this._source.title = $HR('Save the query together with presentation settings for reuse.');
    this._workspace = action($HR('Add to Workspace'), () => void this._run('workspace'));
    this._buttons.append(this._filter, this._source, this._workspace);
    this.container.replaceChildren(this._status, this._buttons);
    this.state = 'rendered';
    void this.refresh();
    return this;
  }

  /**
   * @param {object|null} source DataSource to act on, or null to clear it.
   * @param {object} [options]
   * @param {Function|null} [options.getDraft] Returns the live draft DataSource, if one is being edited.
   * @returns {DataSourceActions} this, for chaining.
   */
  setDataSource(source, { getDraft = null } = {}) { this.dataSource = source ? safeClone(source) : null; this.getDraft = getDraft; if (this.isRendered) void this.refresh(); return this; }

  /**
   * @param {boolean} value Whether the current draft has unsaved changes.
   * @returns {DataSourceActions} this, for chaining.
   */
  setDirty(value) { this.dirty = value === true; if (this.isRendered) void this.refresh(); return this; }

  /** Re-evaluate persistence/workspace status and update button labels and enabled state. */
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
    const hasQuery = queryDefined((typeof this.getDraft === 'function' ? this.getDraft() : ds)?.request?.q);
    if (this._filter) this._filter.disabled = !hasQuery;
    if (this._source) {
      this._source.textContent = sourceId ? $HR('Update Source') : $HR('Save as Source');
      this._source.disabled = !hasQuery;
    }
    if (this._workspace) {
      this._workspace.textContent = inWorkspace ? $HR('Remove from Workspace') : $HR('Add to Workspace');
      this._workspace.disabled = !(sourceId > 0) || (!inWorkspace && this.dirty);
      this._workspace.title = sourceId > 0
        ? (inWorkspace ? $HR('Remove this saved Query Source from Workspace.') : $HR('Add this saved Query Source to Workspace.'))
        : $HR('Save as Source before adding it to Workspace.');
      if (sourceId > 0 && !inWorkspace && this.dirty) this._workspace.title = $HR('Update Source before adding it to Workspace.');
    }
    this._inWorkspace = inWorkspace;
  }

  /** @param {'filter'|'source'|'workspace'} kind Action to run. */
  async _run(kind) {
    const draft = typeof this.getDraft === 'function' ? this.getDraft() : this.dataSource;
    if (!draft) return;
    try {
      if (kind === 'filter') await this.onSaveFilter?.(draft);
      else if (kind === 'source') {
        const prepared = typeof this.prepareSourceDraft === 'function' ? (this.prepareSourceDraft() || draft) : draft;
        const id = prepared.reference?.type === 'source' ? prepared.reference.id : null;
        await (id ? this.onUpdateSource?.(prepared, id) : this.onSaveSource?.(prepared));
      } else {
        const sourceId = draft.reference?.type === 'source' ? Number(draft.reference.id) : 0;
        if (!(sourceId > 0)) return;
        if (this._inWorkspace) await this.onWorkspaceRemove?.(draft);
        else await this.onWorkspaceAdd?.(draft);
      }
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

function queryDefined(q) { return q != null && (typeof q !== 'string' || q.trim().length > 0); }
