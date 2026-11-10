/**
 * @file ActionsTool.js
 * @brief Actions tool of Explorer (a pane module): actions over a set of records (plan 33).
 *
 * Loaded lazily when the Actions tool module is first shown, like the Export tool. Two panes:
 * 1. the list of actions by group (Name | Description); not implemented actions are disabled;
 * 2. the pane of the chosen action: help text, Scope (as Export: current result, selection,
 *    one record type of the result), the form of the action (Field values: FieldValuesAction;
 *    Ownership: OwnershipAction; titles, calculated fields: none; Delete: DeleteAction with the
 *    server password above 10 records and a warning icon) and Run.
 * A set of records runs as the background job "record-action" (srv/Records/Actions): while
 * it runs only HJobMonitor (progress, Stop) is shown; then the report (ActionReport), also
 * for a job that stopped early. One record (a selection of one) is changed by PATCH or DELETE
 * /records/{id} at once (titles and calculated fields: always the job). After a change Explorer
 * runs the current result again (`onRecordsChanged`). A running job is shown again after a page reload; one job at a
 * time. Toolbar: Back to the list, Last result (the report of the newest finished job).
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

import { JobClient, ACTIVE_JOB_STATUSES } from '#shared/api/JobClient.js';
import { RecordEditClient } from '#shared/data/RecordEditClient.js';
import { HJobMonitor } from '#shared/widgets/job/HJobMonitor.js';
import { HBaseWidget } from '#shared/widgets/HBaseWidget.js';
import { $HR, HMsg } from '#shared/ui';
import {
  fillScopeSelect, loadScopeRecordTypes, scopeCount, scopeParams, scopeProblems, scopeRecordType, scopeResultTotal
} from '../toolScope.js';
import { ACTION_GROUPS, ACTIONS, actionDescription } from './actionCatalog.js';
import { errorText, renderActionReport, singleRecordReport } from './ActionReport.js';
import { FieldValuesAction } from './FieldValuesAction.js';
import { fieldValuePatch } from './fieldValueParams.js';
import { OwnershipAction } from './OwnershipAction.js';
import { DeleteAction, NoFormAction } from './simpleActions.js';
import './ActionsTool.css';

/** Job type of every action. */
export const ACTION_JOB_TYPE = 'record-action';

/** Actions tool widget. */
export class ActionsTool extends HBaseWidget {
  /**
   * @param {object} options Tool options.
   * @param {import('#shared/api').HeuristApiClient} options.apiClient API client of Explorer.
   * @param {function(): Promise<object>} options.getDbDefs Database definitions (HDbDefs).
   * @param {function(): object|null} options.getDataSource Current DataSource.
   * @param {function(): number[]} options.getSelection Selected record ids.
   * @param {function(number[], string): void} [options.showRecords] Show records as the current result.
   * @param {function(): void} [options.onRecordsChanged] Records were changed or deleted: Explorer runs the
   *        current result again.
   * @param {string} [options.language] UI language.
   * @param {JobClient} [options.jobClient] Jobs API (tests).
   * @param {RecordEditClient} [options.recordClient] Record writes (tests).
   */
  constructor({ apiClient, getDbDefs, getDataSource, getSelection, showRecords = null, onRecordsChanged = null,
    language = 'eng', jobClient = null, recordClient = null } = {}) {
    super();
    this.apiClient = apiClient;
    this.getDbDefs = getDbDefs;
    this.getDataSource = getDataSource;
    this.getSelection = getSelection;
    this.showRecords = showRecords;
    this.onRecordsChanged = onRecordsChanged;
    this.language = language;
    this.jobs = jobClient || new JobClient({ apiClient });
    this.records = recordClient || null;
    this.dbdefs = null;
    this.source = null;
    this.selection = [];
    this.recordTypes = [];
    this.resultTotal = null;
    this.scope = 'result';
    this.action = null;
    this.form = null;
    this.monitor = null;
    this.runningJob = null;
  }

  /**
   * Build the list of actions and restore a running job.
   *
   * @returns {Promise<ActionsTool>} this.
   */
  async render() {
    if (!this.container) throw new Error('ActionsTool must be attached before render');
    const root = this.container;
    root.classList.add('h-actions-tool');
    root.replaceChildren();

    this._toolbar = element('div', 'h-actions-toolbar');
    this._backButton = button('h-btn h-actions-back', 'fa-solid fa-arrow-left', $HR('All actions'), () => void this._showList());
    this._title = element('span', 'h-actions-title');
    this._lastButton = button('h-btn h-actions-last', 'fa-solid fa-clipboard-list', $HR('Last result'), () => void this._showLastResult());
    this._toolbar.append(this._backButton, this._title, this._lastButton);
    this._monitorBox = element('div', 'h-actions-monitor');
    this._monitorBox.hidden = true;
    this._reportBox = element('div', 'h-actions-report-box');
    this._reportBox.hidden = true;
    this._body = element('div', 'h-actions-body');
    this._body.textContent = $HR('Loading...');
    root.append(this._toolbar, this._monitorBox, this._reportBox, this._body);

    // a running job is shown without waiting for the definitions and counts
    const restoring = this._restoreJob();
    try {
      this.dbdefs = await this.getDbDefs();
    } catch (error) {
      this.dbdefs = null;
      console.warn('Actions: database definitions are not available', error);
    }
    this.source = this.getDataSource() || null;
    this.selection = [...(this.getSelection?.() || [])];
    await this._loadRecordTypes();
    this._showList();
    this.state = 'rendered';
    await restoring;
    this._setRunning(this.isRunning());
    return this;
  }

  /**
   * The DataSource changed: record types of the new result, scope and form again.
   *
   * @param {object|null} source New DataSource.
   * @returns {Promise<void>}
   */
  async setDataSource(source) {
    this.source = source || null;
    if (!this.isRendered) return;
    await this._loadRecordTypes();
    await this._scopeChanged();
  }

  /**
   * The selection changed: counts and availability of the "Selection" scope.
   *
   * @param {number[]} ids Selected record ids.
   * @returns {Promise<void>}
   */
  async setSelection(ids) {
    this.selection = [...(ids || [])];
    if (!this.isRendered) return;
    await this._scopeChanged();
  }

  /** True while an action job of this user runs (it continues when the tool closes). */
  isRunning() {
    return Boolean(this.runningJob && ACTIVE_JOB_STATUSES.includes(this.runningJob.status));
  }

  /** Stop polling; a running job continues on the server and is shown again on the next open. */
  async destroy() {
    await this.form?.destroy?.();
    this.form = null;
    await this.monitor?.destroy?.();
    await super.destroy();
  }

  // ------------------------------------------------------------------ data

  /** Record types of the current result with counts. */
  async _loadRecordTypes() {
    this.recordTypes = [];
    this.resultTotal = null;
    try {
      ({ recordTypes: this.recordTypes, total: this.resultTotal } = await loadScopeRecordTypes(
        this.apiClient, this._query(), this.dbdefs));
    } catch (error) {
      console.warn('Actions: record type counts are not available', error);
    }
  }

  _query() {
    return this.source?.request?.q ?? null;
  }

  _total() {
    return scopeResultTotal({ total: this.resultTotal, source: this.source, recordTypes: this.recordTypes });
  }

  _scopeContext() {
    return { query: this._query(), selection: this.selection };
  }

  /** Record types of the chosen scope (the selection: asked from the server). */
  async _scopeRecordTypes() {
    const rectype = scopeRecordType(this.scope);
    if (rectype) return [rectype];
    if (this.scope !== 'selection') return this.recordTypes.map((item) => item.id);
    if (!this.selection.length) return [];
    try {
      const { recordTypes } = await loadScopeRecordTypes(this.apiClient, [{ ids: this.selection.join(',') }], this.dbdefs);
      return recordTypes.map((item) => item.id);
    } catch (error) {
      console.warn('Actions: record types of the selection are not available', error);
      return [];
    }
  }

  // ------------------------------------------------------------------ list

  /** The list of actions by group. */
  async _showList() {
    await this.form?.destroy?.();
    this.form = null;
    this.action = null;
    this._backButton.hidden = true;
    this._title.textContent = $HR('Actions');
    const list = element('div', 'h-actions-list');
    for (const group of ACTION_GROUPS) {
      const actions = ACTIONS.filter((action) => action.group === group.id);
      if (!actions.length) continue;
      const heading = element('h3', 'h-actions-group');
      heading.textContent = $HR(group.name);
      const table = element('div', 'h-actions-group-list');
      for (const action of actions) {
        const row = element('button', 'h-actions-entry');
        row.type = 'button';
        row.dataset.action = action.id;
        row.disabled = !action.implemented;
        if (!action.implemented) row.title = $HR('Not implemented yet');
        const name = element('span', 'h-actions-entry-name');
        if (action.danger) name.append(dangerIcon());
        name.append(document.createTextNode($HR(action.name)));
        const description = element('span', 'h-actions-entry-description');
        description.textContent = actionDescription(action, $HR);
        row.append(name, description);
        row.addEventListener('click', () => void this._openAction(action));
        table.append(row);
      }
      list.append(heading, table);
    }
    this._body.replaceChildren(list);
  }

  // ------------------------------------------------------------------ action pane

  /** The pane of an action: help, scope, form, Run. */
  async _openAction(action) {
    if (!action?.implemented) return;
    await this.form?.destroy?.();
    this.action = action;
    this._backButton.hidden = false;
    this._title.replaceChildren();
    if (action.danger) this._title.append(dangerIcon());
    this._title.append(document.createTextNode(
      `${$HR(ACTION_GROUPS.find((group) => group.id === action.group)?.name || '')} · ${$HR(action.name)}`));
    const pane = element('div', 'h-actions-pane');

    const help = element('div', `h-actions-help${action.danger ? ' is-danger' : ''}`);
    if (action.danger) help.append(dangerIcon());
    help.append(document.createTextNode(actionDescription(action, $HR)));

    const scope = fieldset($HR('Scope'));
    this._scopeSelect = element('select', 'h-select h-actions-scope');
    this._scopeSelect.addEventListener('change', () => {
      this.scope = this._scopeSelect.value;
      void this._scopeChanged();
    });
    const scopeRow = element('label', 'h-actions-row');
    const scopeCaption = element('span', 'h-actions-row-label');
    scopeCaption.textContent = $HR('Records to change');
    scopeRow.append(scopeCaption, this._scopeSelect);
    scope.append(scopeRow);

    const formSection = fieldset($HR(action.name));
    const formHost = element('div', 'h-actions-form');
    formSection.append(formHost);

    this._problems = element('div', 'h-actions-problems');
    const bottom = element('div', 'h-actions-bottom');
    this._runButton = button('h-btn h-btn-primary h-actions-run', 'fa-solid fa-play', $HR('Run'), () => void this._run());
    bottom.append(this._runButton);
    pane.append(help, scope, formSection, this._problems, bottom);
    this._body.replaceChildren(pane);

    this.form = this._createForm(action).attach(formHost);
    this._fillScope();
    await this.form.setRecordTypes(await this._scopeRecordTypes());
    this._refresh();
  }

  /** The form of an action (catalog `form`). */
  _createForm(action) {
    const onChange = () => this._refresh();
    if (action.form === 'ownership') return new OwnershipAction({ dbdefs: this.dbdefs, onChange });
    if (action.form === 'delete') return new DeleteAction({ dbdefs: this.dbdefs, onChange });
    if (action.form === 'none') return new NoFormAction({ action: action.id, name: action.name });
    return new FieldValuesAction({
      mode: action.mode, dbdefs: this.dbdefs, apiClient: this.apiClient, language: this.language, onChange
    });
  }

  _fillScope() {
    if (!this._scopeSelect) return;
    this.scope = fillScopeSelect(this._scopeSelect, {
      total: this._total(), selection: this.selection, recordTypes: this.recordTypes, value: this.scope
    });
    this.form?.setScope?.({ count: this._scopeCount() });
  }

  /** Scope, result or selection changed: the select and the field list again. */
  async _scopeChanged() {
    if (!this.action || !this.form) return;
    this._fillScope();
    await this.form.setRecordTypes(await this._scopeRecordTypes());
    this._refresh();
  }

  /** @returns {number} Records in the chosen scope. */
  _scopeCount() {
    return scopeCount(this.scope, { total: this._total(), selection: this.selection, recordTypes: this.recordTypes });
  }

  /** @returns {string[]} Problems that prevent a run. */
  _currentProblems() {
    if (!this.form) return [];
    const problems = [...scopeProblems(this.scope, this._scopeContext()), ...this.form.problems()];
    if (!problems.length && this._scopeCount() < 1) problems.push('There are no records in the scope');
    return problems;
  }

  /** Problems and the Run button. */
  _refresh() {
    if (!this._runButton || !this._problems) return;
    const problems = this._currentProblems();
    this._problems.replaceChildren(...problems.map((text) => {
      const item = element('div', 'h-actions-problem');
      item.textContent = $HR(text);
      return item;
    }));
    this._runButton.disabled = problems.length > 0 || this.isRunning();
  }

  // ------------------------------------------------------------------ run

  /** Confirm, then PATCH one record or start the job. */
  async _run() {
    if (!this.form || this._currentProblems().length || this.isRunning()) return;
    const count = this._scopeCount();
    const params = { ...this.form.params(), scope: scopeParams(this.scope, this._scopeContext()) };
    const question = this.action.danger
      ? `${$HR('Delete records')}: ${count}?\n${$HR('This cannot be undone.')}`
      : `${$HR(this.action.name)}: ${params.title}\n${$HR('Change the records of the scope')}: ${count}?`;
    if (!(await confirmDialog(question, this.action.danger ? 'Delete' : 'Run'))) return;
    this._runButton.disabled = true;
    try {
      // one selected record: PATCH or DELETE at once (titles and calculated fields: always the job)
      if (this.scope === 'selection' && this.selection.length === 1 && !['titles', 'calculations'].includes(params.action)) {
        await this._runOne(params, this.selection[0]);
      } else {
        const job = await this.jobs.start(ACTION_JOB_TYPE, params);
        this._follow(job);
      }
    } catch (error) {
      this._showError(error);
    }
    this._refresh();
  }

  /** One record: PATCH (field values, ownership) or DELETE at once, the report from its answer. */
  async _runOne(params, recordId) {
    const client = this.records || new RecordEditClient({ apiClient: this.apiClient });
    const reportParams = { ...params, fieldName: this.form?.field?.name || '' };
    let report;
    try {
      if (params.action === 'delete') {
        await client.remove(recordId, { force: true });
        report = singleRecordReport(reportParams, recordId, { done: true });
      } else if (params.action === 'ownership') {
        const saved = await client.patch(recordId, {
          rec_OwnerUGrpID: params.owner,
          rec_NonOwnerVisibility: params.visibility,
          rec_NonOwnerVisibilityGroups: params.viewGroups
        }, { force: true, fields: 'rec_ID,rec_Modified' });
        report = singleRecordReport(reportParams, recordId, { done: saved.headerChanged === true });
      } else {
        const saved = await client.patch(recordId, fieldValuePatch(params), { force: true, fields: 'rec_ID,rec_Modified' });
        report = singleRecordReport(reportParams, recordId, { changed: saved.changed, values: saved.values });
      }
    } catch (error) {
      report = singleRecordReport(reportParams, recordId, { error });
    }
    const job = { status: 'done', title: params.title, finishedAt: Math.floor(Date.now() / 1000), result: report };
    this._showReport(job);
    this._notifyChanged(job);
  }

  /** Records were changed or deleted: Explorer runs the current result again. */
  _notifyChanged(job) {
    if ((Number(job?.result?.records?.changed) || 0) > 0) this.onRecordsChanged?.();
  }

  /** Show a job with progress and Stop; the list / form is hidden while it runs. */
  _follow(job) {
    this.runningJob = job;
    this._reportBox.hidden = true;
    this._monitorBox.hidden = false;
    this.monitor?.destroy?.();
    this.monitor = new HJobMonitor();
    this.monitor.attach(this._monitorBox, {
      jobClient: this.jobs,
      onFinish: (finished) => {
        this.runningJob = finished;
        this._setRunning(false);
        void this._finished(finished);
      }
    });
    this.monitor.follow(job).catch((error) => {
      this._showError(error);
      this.runningJob = null;
      this._setRunning(false);
    });
    this._setRunning(this.isRunning());
  }

  /** A job ended: its report (the monitor answer may be brief: read the job). */
  async _finished(job) {
    let full = job;
    if (!full?.result && full?.id) {
      try {
        full = await this.jobs.get(full.id);
      } catch {
        // the monitor state is shown
      }
    }
    this._monitorBox.hidden = true;
    this._showReport(full);
    this._notifyChanged(full);
  }

  /** While a job runs only the job monitor is shown. */
  _setRunning(running) {
    if (this._toolbar) this._toolbar.hidden = running;
    if (this._body) this._body.hidden = running;
    if (running && this._reportBox) this._reportBox.hidden = true;
    this._refresh();
  }

  /** The report above the list or form, with a close button. */
  _showReport(job) {
    const box = this._reportBox;
    box.replaceChildren();
    const close = element('button', 'heurist-icon-button h-actions-report-close');
    close.type = 'button';
    close.title = $HR('Close');
    close.innerHTML = '<span class="fa-solid fa-xmark" aria-hidden="true"></span>';
    close.addEventListener('click', () => { box.hidden = true; });
    box.append(close, renderActionReport(job, {
      showRecords: this.showRecords ? (ids, title) => this.showRecords(ids, title) : null
    }));
    box.hidden = false;
  }

  /** The report of the newest finished job of the user. */
  async _showLastResult() {
    try {
      const jobs = await this._actionJobs();
      const last = jobs.find((job) => !ACTIVE_JOB_STATUSES.includes(job.status));
      if (!last) {
        HMsg.showMsgFlash?.($HR('There is no previous result'));
        return;
      }
      this._showReport(last.result ? last : await this.jobs.get(last.id));
    } catch (error) {
      this._showError(error);
    }
  }

  /** After a page reload: show the user's running action job. */
  async _restoreJob() {
    try {
      const running = (await this._actionJobs()).find((job) => ACTIVE_JOB_STATUSES.includes(job.status));
      if (running) this._follow(running);
    } catch (error) {
      console.warn('Actions: running jobs are not available', error);
    }
  }

  /** Action jobs of the user, newest first, without their parameters. */
  async _actionJobs() {
    const jobs = await this.jobs.list({ type: ACTION_JOB_TYPE, brief: true });
    return (Array.isArray(jobs) ? jobs : []).filter((job) => job.type === ACTION_JOB_TYPE);
  }

  /** Warning with an icon (e.g. "one action at a time"). */
  _showError(error) {
    const box = element('div', 'h-actions-problem h-actions-error');
    const icon = element('span', 'fa-solid fa-triangle-exclamation');
    icon.setAttribute('aria-hidden', 'true');
    box.append(icon, document.createTextNode(` ${errorText(error)}`));
    this._monitorBox.hidden = false;
    this._monitorBox.replaceChildren(box);
  }
}

/** Create an element with a class name. */
function element(tag, className = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

/** A button with an icon and a caption. */
function button(className, icon, text, onClick) {
  const node = element('button', className);
  node.type = 'button';
  node.innerHTML = `<span class="${icon}" aria-hidden="true"></span> `;
  node.append(document.createTextNode(text));
  node.addEventListener('click', onClick);
  return node;
}

/** The warning icon of a dangerous action. */
function dangerIcon() {
  const icon = element('span', 'fa-solid fa-triangle-exclamation h-actions-danger-icon');
  icon.setAttribute('aria-hidden', 'true');
  return icon;
}

/** A form section with a legend. */
function fieldset(title) {
  const section = element('fieldset', 'h-actions-section');
  const legend = document.createElement('legend');
  legend.textContent = title;
  section.append(legend);
  return section;
}

/**
 * Heurist confirmation dialog (HMsg): resolves true for the confirm button.
 *
 * @param {string} message Question.
 * @param {string} [confirmLabel] Caption of the confirm button.
 * @returns {Promise<boolean>}
 */
function confirmDialog(message, confirmLabel = 'Run') {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
      try {
        HMsg.closeMsgDlg?.();
      } catch {
        // the dialog is gone already
      }
    };
    const text = element('div', 'h-actions-confirm');
    text.textContent = message;
    const dialog = HMsg.showMsgDlg(text, {
      message: true,
      title: 'Please confirm',
      buttons: [
        { label: $HR(confirmLabel), class: confirmLabel === 'Delete' ? 'h-btn h-btn-danger' : 'h-btn h-btn-primary', onClick: () => finish(true) },
        { label: $HR('Cancel'), class: 'h-btn', onClick: () => finish(false) }
      ]
    });
    dialog?.addEventListener?.('close', () => finish(false), { once: true });
  });
}
