/**
 * @file OutputsDialog.js
 * @brief The generated reports (output records, plan 30): the dialog with all of them, one per report
 *        or all, and the choice shown by Generate when outputs with the same query exist.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-reports
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { HJobMonitor } from '#shared/widgets';
import { $HR, HMsg } from '#shared/ui';
import { intervalLabel } from '../core/ReportsApplication.js';
import { confirmDialog } from './formDialog.js';
import { formatDate, formatSize, LARGE_FILE } from './GeneratedFiles.js';

const DIALOG_ID = 'h-reports-outputs';
const CHOICE_ID = 'h-reports-output-choice';

/**
 * Open the dialog of the generated reports.
 *
 * @param {import('../core/ReportsApplication.js').ReportsApplication} app Controller.
 * @param {object|null} report Report whose outputs are shown first (filter); null for all.
 * @param {{onShow?: function(string): void}} [options] `onShow`: shows the URL of a file in the output frame.
 * @returns {Promise<void>}
 */
export async function openOutputsDialog(app, report = null, { onShow = null } = {}) {
  const root = el('div', 'h-reports-schedules');
  const controls = el('div', 'h-reports-schedules-controls', root);
  const search = el('input', 'h-input', controls);
  search.type = 'search';
  search.placeholder = $HR('Search generated reports');
  const filter = el('select', 'h-select', controls);
  filter.setAttribute('aria-label', $HR('Report'));
  const add = el('button', 'h-btn h-btn-small', controls);
  add.type = 'button';
  el('i', 'fa-solid fa-plus', add).setAttribute('aria-hidden', 'true');
  add.append(` ${$HR('Add generated report')}`);
  const jobHost = el('div', 'h-reports-job', root);
  jobHost.hidden = true;
  const table = el('table', 'h-reports-table', root);
  let outputs = [];
  let monitor = null;

  const filterReport = () => (filter.value ? app.findReport(filter.value) : null);

  const fillFilter = () => {
    const ids = new Set(outputs.map((output) => String(output.reportId)));
    if (report?.id != null) ids.add(String(report.id));
    const current = filter.value || (report?.id != null ? String(report.id) : '');
    filter.replaceChildren(option($HR('All reports'), ''));
    const reports = [...ids].map((id) => app.findReport(id)).filter(Boolean)
      .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
    for (const item of reports) filter.append(option(item.title, item.id));
    filter.value = reports.some((item) => String(item.id) === current) ? current : '';
  };

  const render = () => {
    const text = search.value.trim().toLowerCase();
    const shown = outputs.filter((output) => (!filter.value || String(output.reportId) === filter.value)
      && (!text || `${output.title} ${output.reportTitle || ''}`.toLowerCase().includes(text)));
    const target = filterReport();
    add.disabled = !(target && target.id != null && app.host.canEditRecords());
    add.title = add.disabled ? $HR('Choose a report in the list above') : $HR('Add a generated report of this report');
    table.replaceChildren();
    const head = el('tr', '', el('thead', '', table));
    for (const label of ['', 'Language', 'Name', 'Report', 'Query', 'Scheduled', 'Generated', 'Size', '']) el('th', '', head).textContent = label ? $HR(label) : '';
    const body = el('tbody', '', table);
    if (!shown.length) {
      const cell = el('td', 'h-muted', el('tr', '', body));
      cell.colSpan = 9;
      cell.textContent = $HR('No generated reports');
      return;
    }
    for (const output of shown) {
      const row = el('tr', '', body);
      const generate = el('td', '', row);
      if (output.canEdit) iconButton(generate, 'fa-solid fa-bolt', 'Generate now', () => execute(output));
      languageCell(row, output);
      const name = el('td', 'h-reports-schedule-name', row);
      if (output.generated && onShow) {
        const link = el('button', 'h-reports-generated-name', name);
        link.type = 'button';
        link.textContent = output.title;
        link.title = $HR('show here');
        link.addEventListener('click', () => run(() => show(output)));
      } else {
        name.textContent = output.title;
      }
      el('td', 'h-muted', row).textContent = output.reportTitle || '';
      const query = el('td', 'h-reports-schedule-query', row);
      query.textContent = app.host.describeQuery(output.query);
      query.title = output.query || '';
      el('td', '', row).textContent = intervalLabel(output.intervalMinutes);
      generatedCells(row, output);
      const actions = el('td', 'h-reports-row-actions', row);
      if (output.generated) {
        linkIcon(actions, 'fa-solid fa-up-right-from-square', 'Open in a new window', app.api.outputUrl(output.id), { target: '_blank', rel: 'noopener' });
        linkIcon(actions, 'fa-solid fa-download', 'Download', app.api.outputUrl(output.id, { download: true }));
      }
      if (output.canEdit) {
        if (app.host.canEditRecords()) iconButton(actions, 'fa-solid fa-pen', 'Edit', () => edit(output));
        if (output.generated) iconButton(actions, 'fa-solid fa-eraser', 'Delete the generated file', () => removeFile(output));
        iconButton(actions, 'fa-solid fa-trash', 'Delete', () => remove(output));
      }
    }
  };

  const reload = async () => {
    outputs = await app.loadOutputs();
    fillFilter();
    render();
  };

  const show = async (output) => {
    if (output.generated.size > LARGE_FILE
      && !(await confirmDialog(`${output.title}: ${formatSize(output.generated.size)}. ${$HR('Large files can make the page slow. Show it here anyway?')}`, { yesLabel: 'Show' }))) {
      return;
    }
    HMsg.closeMsgDlg(DIALOG_ID);
    onShow(app.api.outputUrl(output.id));
  };

  const execute = async (output) => {
    await monitor?.destroy();
    jobHost.replaceChildren();
    jobHost.hidden = false;
    monitor = new HJobMonitor().attach(el('div', '', jobHost), { jobClient: app.jobs, compact: true });
    const final = await monitor.follow(await app.startGenerate(output));
    if (final.status === 'done') {
      setTimeout(() => { jobHost.hidden = true; }, 1500);
      await reload();
    }
  };

  const edit = async (output) => {
    if (await app.editOutput(output)) await reload();
  };

  const removeFile = async (output) => {
    if (!(await confirmDialog(`${$HR('Delete the generated file of')} "${output.title}"?`, { yesLabel: 'Delete' }))) return;
    await app.api.deleteOutputFile(output.id);
    await reload();
  };

  const remove = async (output) => {
    if (!(await confirmDialog(`${$HR('Delete generated report')} "${output.title}"?`, { yesLabel: 'Delete' }))) return;
    await app.deleteOutput(output);
    await reload();
  };

  add.addEventListener('click', () => run(async () => {
    const target = filterReport();
    if (!target) return;
    if (await app.newOutput(target)) await reload();
  }));
  search.addEventListener('input', render);
  filter.addEventListener('change', render);

  const dialog = HMsg.showMsgDlg(root, {
    dialogId: DIALOG_ID,
    title: 'Generated reports',
    buttons: [{ label: 'Close', class: 'h-btn', onClick: () => HMsg.closeMsgDlg(DIALOG_ID) }]
  });
  dialog.classList.add('h-reports-schedules-dialog');
  dialog.addEventListener('close', () => monitor?.destroy(), { once: true });
  await run(reload);

  /** Icon button of a row. */
  function iconButton(parent, icon, title, onClick) {
    const button = el('button', 'heurist-icon-button h-reports-icon', parent);
    button.type = 'button';
    button.title = $HR(title);
    button.setAttribute('aria-label', button.title);
    el('i', icon, button).setAttribute('aria-hidden', 'true');
    button.addEventListener('click', () => run(onClick));
    return button;
  }
}

/**
 * The outputs of a report with the query of a Generate: the user regenerates one, or makes a new one.
 *
 * @param {Array<object>} outputs Outputs with this query.
 * @returns {Promise<object|'new'|null>} The chosen output, `'new'`, or null when cancelled.
 */
export function openOutputChoice(outputs) {
  return new Promise((resolve) => {
    let answer = null;
    const choose = (value) => {
      answer = value;
      HMsg.closeMsgDlg(CHOICE_ID);
    };
    const root = el('div', 'h-reports-schedules');
    el('p', '', root).textContent = $HR('There are already generated reports for this template with this filter. Select one to regenerate it, or make a new one.');
    const table = el('table', 'h-reports-table', root);
    const head = el('tr', '', el('thead', '', table));
    for (const label of ['Language', 'Name', 'Generated', 'Size', 'Scheduled']) el('th', '', head).textContent = $HR(label);
    const body = el('tbody', '', table);
    for (const output of outputs) {
      const row = el('tr', 'h-reports-choice-row', body);
      row.tabIndex = 0;
      row.title = $HR(output.canEdit ? 'Regenerate' : 'You can not change this generated report');
      languageCell(row, output);
      el('td', 'h-reports-schedule-name', row).textContent = output.title;
      generatedCells(row, output);
      el('td', '', row).textContent = intervalLabel(output.intervalMinutes);
      if (!output.canEdit) {
        row.classList.add('h-muted');
        continue;
      }
      row.addEventListener('click', () => choose(output));
      row.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') choose(output);
      });
    }
    const dialog = HMsg.showMsgDlg(root, {
      dialogId: CHOICE_ID,
      title: 'Generate report',
      buttons: [
        { label: 'New output', class: 'h-btn h-btn-primary', onClick: () => choose('new') },
        { label: 'Cancel', class: 'h-btn', onClick: () => HMsg.closeMsgDlg(CHOICE_ID) }
      ]
    });
    dialog.addEventListener('close', () => resolve(answer), { once: true });
  });
}

/** The language of an output as a badge. */
function languageCell(row, output) {
  const cell = el('td', '', row);
  if (output.language) el('span', 'h-reports-language', cell).textContent = output.language.toUpperCase();
}

/** Date and size of the generated file. */
function generatedCells(row, output) {
  const date = el('td', '', row);
  const size = el('td', '', row);
  if (output.generated) {
    date.textContent = formatDate(output.generated.modified);
    size.textContent = formatSize(output.generated.size);
  } else {
    date.textContent = $HR('not generated yet');
    date.classList.add('h-muted');
  }
}

/** Icon link of a row. */
function linkIcon(parent, icon, title, href, attributes = {}) {
  const link = el('a', 'heurist-icon-button h-reports-icon', parent);
  link.href = href;
  link.title = $HR(title);
  for (const [name, value] of Object.entries(attributes)) link.setAttribute(name, value);
  el('i', icon, link).setAttribute('aria-hidden', 'true');
}

/** Run an action and show its error. */
async function run(action) {
  try {
    await action();
  } catch (error) {
    HMsg.showMsgErr(error?.message || String(error));
  }
}

/** Element helper. */
function el(tag, className, parent = null) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  parent?.append(element);
  return element;
}

/** An `<option>` element. */
function option(label, value) {
  const element = document.createElement('option');
  element.value = String(value);
  element.textContent = label;
  return element;
}
