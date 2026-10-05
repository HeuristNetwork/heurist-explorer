/**
 * @file SchedulesDialog.js
 * @brief Dialog with the report schedules: all visible schedules are loaded once
 *        and filtered in the browser (by name and report). Execute, last
 *        generated file, open in a new window, edit, delete, add.
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
import { openScheduleForm } from './reportForms.js';
import { confirmDialog } from './formDialog.js';
import { formatDate, formatSize } from './GeneratedFiles.js';

const DIALOG_ID = 'h-reports-schedules';

/**
 * Open the schedules dialog.
 *
 * @param {import('../core/ReportsApplication.js').ReportsApplication} app Controller.
 * @param {object|null} report Report whose schedules are shown first (filter); null for all.
 * @returns {Promise<void>}
 */
export async function openSchedulesDialog(app, report = null) {
  const root = el('div', 'h-reports-schedules');
  const controls = el('div', 'h-reports-schedules-controls', root);
  const search = el('input', 'h-input', controls);
  search.type = 'search';
  search.placeholder = $HR('Search schedules');
  const filter = el('select', 'h-select', controls);
  filter.setAttribute('aria-label', $HR('Report'));
  const add = el('button', 'h-btn h-btn-small', controls);
  add.type = 'button';
  el('i', 'fa-solid fa-plus', add).setAttribute('aria-hidden', 'true');
  add.append(` ${$HR('Add schedule')}`);
  const jobHost = el('div', 'h-reports-job', root);
  jobHost.hidden = true;
  const table = el('table', 'h-reports-table', root);
  let schedules = [];
  let monitor = null;
  // titles of the host's Query Sources (all of them, also parameterized ones)
  const sourceTitles = new Map((await app.host.getQuerySources()).map((source) => [source.id, source.title]));

  const reportFor = (schedule) => app.findReport(String(schedule.reportId));
  const filterReport = () => (filter.value ? app.findReport(filter.value) : null);

  const fillFilter = () => {
    const ids = new Set(schedules.map((schedule) => String(schedule.reportId)));
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
    const shown = schedules.filter((schedule) => (!filter.value || String(schedule.reportId) === filter.value)
      && (!text || `${schedule.title} ${schedule.reportTitle || ''}`.toLowerCase().includes(text)));
    const target = filterReport();
    add.disabled = !(target && target.id != null && target.canEdit);
    add.title = add.disabled ? $HR('Choose a report you can edit in the list above') : $HR('Add a schedule to this report');
    table.replaceChildren();
    const head = el('tr', '', el('thead', '', table));
    for (const label of ['', 'Name', 'Report', 'Query Source', 'Interval', 'Last generated', '']) el('th', '', head).textContent = label ? $HR(label) : '';
    const body = el('tbody', '', table);
    if (!shown.length) {
      const cell = el('td', 'h-muted', el('tr', '', body));
      cell.colSpan = 7;
      cell.textContent = $HR('No schedules');
      return;
    }
    for (const schedule of shown) {
      const row = el('tr', '', body);
      const run = el('td', '', row);
      iconButton(run, 'fa-solid fa-bolt', 'Generate now', () => execute(schedule));
      el('td', 'h-reports-schedule-name', row).textContent = schedule.title;
      el('td', 'h-muted', row).textContent = schedule.reportTitle || '';
      el('td', '', row).textContent = schedule.dataSourceId > 0
        ? (sourceTitles.get(schedule.dataSourceId) || `#${schedule.dataSourceId}`) : '';
      el('td', '', row).textContent = intervalLabel(schedule.intervalMinutes);
      const last = el('td', '', row);
      if (schedule.generated) {
        last.textContent = `${formatDate(schedule.generated.modified)} · ${formatSize(schedule.generated.size)}`;
        last.title = schedule.generated.file;
      } else {
        last.textContent = $HR('not generated yet');
        last.classList.add('h-muted');
      }
      const actions = el('td', 'h-reports-row-actions', row);
      if (schedule.generated?.url) {
        const open = el('a', 'heurist-icon-button h-reports-icon', actions);
        open.href = schedule.generated.url;
        open.target = '_blank';
        open.rel = 'noopener';
        open.title = $HR('Open in a new window');
        el('i', 'fa-solid fa-up-right-from-square', open).setAttribute('aria-hidden', 'true');
      }
      const owner = reportFor(schedule);
      if (schedule.canEdit && owner) {
        iconButton(actions, 'fa-solid fa-pen', 'Edit schedule', () => edit(owner, schedule));
        iconButton(actions, 'fa-solid fa-trash', 'Delete schedule', () => remove(schedule));
      }
    }
  };

  const reload = async () => {
    schedules = await app.loadSchedules();
    fillFilter();
    render();
  };

  const execute = async (schedule) => {
    await monitor?.destroy();
    jobHost.replaceChildren();
    jobHost.hidden = false;
    monitor = new HJobMonitor().attach(el('div', '', jobHost), { jobClient: app.jobs, compact: true });
    const final = await monitor.follow(await app.startGenerate({ schedule: schedule.id }));
    if (final.status === 'done') {
      setTimeout(() => { jobHost.hidden = true; }, 1500);
      await reload();
    }
  };

  const edit = async (owner, schedule) => {
    const values = await openScheduleForm(app, owner, schedule);
    if (!values) return;
    await app.updateSchedule(owner.id, schedule, values);
    await reload();
  };

  const remove = async (schedule) => {
    if (!(await confirmDialog(`${$HR('Delete schedule')} "${schedule.title}"? ${$HR('Generated files are kept.')}`, { yesLabel: 'Delete' }))) return;
    await app.deleteSchedule(schedule.reportId, schedule);
    await reload();
  };

  add.addEventListener('click', () => run(async () => {
    const target = filterReport();
    if (!target) return;
    const values = await openScheduleForm(app, target, null);
    if (!values) return;
    await app.addSchedule(target, values);
    await reload();
  }));
  search.addEventListener('input', render);
  filter.addEventListener('change', render);

  const dialog = HMsg.showMsgDlg(root, {
    dialogId: DIALOG_ID,
    title: 'Report schedules',
    buttons: [{ label: 'Close', class: 'h-btn', onClick: () => HMsg.closeMsgDlg(DIALOG_ID) }]
  });
  dialog.classList.add('h-reports-schedules-dialog');
  dialog.addEventListener('close', () => monitor?.destroy(), { once: true });
  await run(reload);

  /** Run an action and show its error. */
  async function run(action) {
    try {
      await action();
    } catch (error) {
      HMsg.showMsgErr(error?.message || String(error));
    }
  }

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
