/**
 * @file ActionReport.js
 * @brief Report of a record action of the Actions tool (plan 33): the result of the job
 *        "record-action" (srv/Records/Actions/RecordActionReport.php), also of a job that
 *        stopped early (Stop, time limit, failure), or of a one-record PATCH.
 *
 *   report: {action, field, fieldName, complete, stage, done, total, lastRecordId,
 *            records: {scope, changed, unchanged, skipped, errors}, skipped: {reason: count},
 *            values: {found, added, removed}, ids: {changed, skipped, errors}, idsTruncated,
 *            errors: [{id, message}], seconds}
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

import { $HR } from '#shared/ui';

/** Reasons of skipped records. */
export const SKIP_REASONS = {
  structure: 'The record type has no such field',
  rights: 'No rights to edit the record',
  required: 'The last value of a required field',
  single_value: 'The field has one value only',
  max: 'More values than the field allows',
  language_exists: 'The translation exists',
  blank: 'The new title would be blank',
  missing: 'The record does not exist any more'
};

/** Statuses of a job that ended without finishing. */
const STOPPED = { cancelled: 'Stopped', timeout: 'Time limit reached', failed: 'Failed', lost: 'Lost' };

/**
 * The report of a one-record change (PATCH or DELETE of RecordEditClient, or its error), in
 * the format of the job report.
 *
 * @param {object} params Action parameters (`action`, `field`, `title`).
 * @param {number} recordId The record.
 * @param {{changed?: object, values?: object, done?: boolean|null, error?: *}} outcome `changed` / `values` =
 *        meta.changed / meta.values of a field PATCH; `done`: the record was changed (ownership: meta.headerChanged;
 *        delete: true); or the error (RecordEditError).
 * @returns {object} Report.
 */
export function singleRecordReport(params, recordId, { changed = null, values = null, done = null, error = null } = {}) {
  const report = {
    action: params.action,
    field: params.field,
    fieldName: params.fieldName || '',
    complete: true,
    stage: 'records',
    done: 1,
    total: 1,
    lastRecordId: recordId,
    records: { scope: 1, changed: 0, unchanged: 0, skipped: 0, errors: 0 },
    skipped: {},
    values: null,
    ids: { changed: [], skipped: [], errors: [] },
    errors: [],
    seconds: 0
  };
  if (error) {
    const status = Number(error?.status || 0);
    const issues = Array.isArray(error?.issues) && error.issues.length ? error.issues : (error?.details?.errors || []);
    const code = issues.find((issue) => SKIP_REASONS[issue?.code])?.code
      || (status === 403 ? 'rights' : (status === 404 ? 'missing' : null));
    if (code) {
      report.records.skipped = 1;
      report.skipped[code] = 1;
      report.ids.skipped.push(recordId);
    } else {
      report.records.errors = 1;
      report.ids.errors.push(recordId);
      report.errors.push({ id: recordId, message: errorText(error) });
    }
    return report;
  }
  const fieldValues = values?.[String(params.field)];
  if (fieldValues) {
    report.values = {
      found: Number(fieldValues.found) || 0, added: Number(fieldValues.added) || 0, removed: Number(fieldValues.removed) || 0
    };
  }
  const isChanged = done !== null ? done === true : Number(changed?.[String(params.field)] ?? 0) > 0;
  if (isChanged) {
    report.records.changed = 1;
    report.ids.changed.push(recordId);
  } else {
    report.records.unchanged = 1;
  }
  return report;
}

/**
 * Report element of a job (or of a one-record change: `{status: 'done', result}`).
 *
 * @param {object} job Job state: `status`, `error`, `result` (the report), `title`, `finishedAt`.
 * @param {{showRecords?: (ids: number[], title: string) => void}} [options]
 * @returns {HTMLElement}
 */
export function renderActionReport(job, { showRecords = null } = {}) {
  const root = element('div', 'h-actions-report');
  const report = job?.result || null;
  const head = element('div', 'h-actions-report-head');
  const title = element('span', 'h-actions-report-title');
  title.textContent = job?.title || $HR('Result');
  head.append(title);
  if (job?.finishedAt) {
    const date = element('span', 'h-muted h-actions-report-date');
    date.textContent = formatDate(job.finishedAt);
    head.append(date);
  }
  root.append(head);

  const stopped = job?.status && job.status !== 'done';
  if (stopped) {
    const note = element('div', 'h-actions-report-stopped');
    let text = $HR(STOPPED[job.status] || job.status);
    if (report && report.stage === 'records') {
      text += `: ${$HR('stopped at record')} ${Math.min(report.done + 1, report.total)} ${$HR('of')} ${report.total}`;
      if (report.lastRecordId) text += ` (${$HR('last record handled')} #${report.lastRecordId})`;
      text += `. ${$HR('The records before it are changed; the current one is not.')}`;
    } else if (report) {
      text += `: ${$HR('stopped while searching the records; no record was changed.')}`;
    }
    note.textContent = text;
    root.append(note);
    if (job.error) {
      const error = element('div', 'h-muted h-actions-report-error');
      error.textContent = job.error;
      root.append(error);
    }
  }
  if (!report) return root;

  const table = element('table', 'h-actions-report-table');
  const records = report.records || {};
  const values = report.values;
  addRow(table, 'Records in scope', records.scope);
  const deleted = report.action === 'delete';
  // deleted records can not be shown
  addRow(table, deleted ? 'Records deleted' : 'Records changed', records.changed, deleted ? null : report.ids?.changed, 'Changed records');
  if (!deleted) {
    addRow(table, report.action?.startsWith?.('field-') ? 'Records unchanged (no matching value)' : 'Records unchanged',
      records.unchanged);
  }
  addRow(table, 'Records skipped', records.skipped, report.ids?.skipped, 'Skipped records');
  for (const [reason, count] of Object.entries(report.skipped || {})) {
    addRow(table, `  ${$HR(SKIP_REASONS[reason] || reason)}`, count, null, '', true);
  }
  addRow(table, 'Records with errors', records.errors, report.ids?.errors, 'Records with errors');
  if (values) {
    addRow(table, report.action === 'field-add' ? 'Values before (existing)' : 'Values found', values.found);
    addRow(table, 'Values added', values.added);
    addRow(table, 'Values removed', values.removed);
  }
  if (report.seconds) addRow(table, 'Time (seconds)', report.seconds);
  root.append(table);

  if (report.idsTruncated) {
    const note = element('div', 'h-muted h-actions-report-note');
    note.textContent = $HR('The lists of records are cut to the first 10,000 records each.');
    root.append(note);
  }
  if ((report.errors || []).length) {
    const list = element('ul', 'h-actions-report-errors');
    for (const item of report.errors) {
      const li = document.createElement('li');
      li.textContent = `#${item.id}: ${item.message}`;
      list.append(li);
    }
    root.append(list);
  }
  return root;

  function addRow(tableElement, label, value, ids = null, listTitle = '', indent = false) {
    if (value == null) return;
    const tr = document.createElement('tr');
    if (indent) tr.className = 'h-actions-report-sub';
    const th = document.createElement('th');
    th.textContent = indent ? label.trim() : $HR(label);
    const td = document.createElement('td');
    td.textContent = String(value);
    const action = document.createElement('td');
    if (showRecords && Array.isArray(ids) && ids.length && Number(value) > 0) {
      const button = element('button', 'h-btn h-btn-small h-actions-report-show');
      button.type = 'button';
      button.textContent = $HR('Show');
      button.title = $HR('Show these records as the current result');
      button.addEventListener('click', () => showRecords(ids, `${$HR(listTitle)}: ${job?.title || ''}`));
      action.append(button);
    }
    tr.append(th, td, action);
    tableElement.append(tr);
  }
}

/** Message of an error: the server's message, else the error text. */
export function errorText(error) {
  const details = error?.details;
  const server = details?.message ?? details?.error?.message;
  if (typeof server === 'string' && server.trim()) return server.trim();
  return String(error?.message || error || '').replace(/^Heurist API request failed:\s*/, '');
}

/** Local date and time of a job time (seconds). */
function formatDate(seconds) {
  const date = new Date(Number(seconds) * 1000);
  return Number.isNaN(date.getTime()) || !seconds ? '' : date.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
}

/** Create an element with a class name. */
function element(tag, className = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}
