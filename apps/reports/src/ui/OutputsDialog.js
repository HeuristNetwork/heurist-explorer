/**
 * @file OutputsDialog.js
 * @brief The generated reports (output records, plan 30): one panel with two modes, shown in a dialog. List: all
 *        of them, one per report or all. New: the source of the records, the outputs of the template with that
 *        query (to generate one again), and a new generated report. The CMS designer shows the same panel in its
 *        form of the element Generated Report (plan 27e §28): `pick` adds a checkbox and a language to each row.
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
import { visibilityIconHtml } from '#shared/widgets/record-list/recordAdminInfo.js';
import { $HR, HMsg } from '#shared/ui';
import { intervalLabel, outputsOfQuery } from '../core/ReportsApplication.js';
import { confirmDialog } from './formDialog.js';
import { formatDate, formatSize, LARGE_FILE } from './GeneratedFiles.js';

const DIALOG_ID = 'h-reports-outputs';

/**
 * Open the dialog of the generated reports.
 *
 * @param {import('../core/ReportsApplication.js').ReportsApplication} app Controller.
 * @param {object|null} report Report whose outputs are shown first (filter); null for all.
 * @param {object} [options]
 * @param {'list'|'new'} [options.mode='list'] New mode; a template without generated reports always starts in it.
 * @param {function(string): void} [options.onShow] Shows the URL of a file in the output frame.
 * @param {function(object): Promise<void>} [options.onGenerate] Generates an output of New mode (the dialog is closed).
 * @returns {Promise<void>}
 */
export async function openOutputsDialog(app, report = null, { mode = 'list', onShow = null, onGenerate = null } = {}) {
  const close = () => HMsg.closeMsgDlg(DIALOG_ID);
  const panel = await createOutputsPanel(app, report, { mode, onShow, onGenerate, onClose: close });
  const dialog = HMsg.showMsgDlg(panel.element, {
    dialogId: DIALOG_ID,
    title: 'Generated reports',
    buttons: [{ label: 'Close', class: 'h-btn', onClick: close }]
  });
  dialog.classList.add('h-reports-schedules-dialog');
  dialog.addEventListener('close', () => panel.destroy(), { once: true });
  await panel.ready;
}

/**
 * The generated reports as a panel: search, report filter, New Report, table.
 *
 * @param {import('../core/ReportsApplication.js').ReportsApplication} app Controller.
 * @param {object|null} report Report whose outputs are shown first (filter); null for all.
 * @param {object} [options]
 * @param {'list'|'new'} [options.mode='list'] New mode; a template without generated reports starts in it (not in pick).
 * @param {function(string): void} [options.onShow] Shows the URL of a file in the output frame.
 * @param {function(object): Promise<void>} [options.onGenerate] Generates an output of New mode (the panel is closed);
 *        without it the output is generated in the panel.
 * @param {function(): void} [options.onClose] Closes the dialog of the panel.
 * @param {{languages?: string[], files?: Object<string, number>, onChange?: function(Object<string, number>, object[]): void}} [options.pick]
 *        Choice of outputs (CMS designer): one per language (`def`: all languages), no Delete, no card reports.
 * @returns {Promise<{element: HTMLElement, ready: Promise<void>, destroy: function(): void}>}
 */
export async function createOutputsPanel(app, report = null, { mode = 'list', onShow = null, onGenerate = null, onClose = null, pick = null } = {}) {
  let outputs = await app.loadOutputs();
  const languages = (pick?.languages || []).map((code) => String(code).toLowerCase());
  // chosen outputs by language: {eng: 12, def: 14}
  const picks = Object.fromEntries(Object.entries(pick?.files || {}).map(([code, id]) => [code, Number(id)]).filter(([, id]) => id > 0));
  const root = el('div', 'h-reports-schedules');
  const source = el('div', 'h-reports-source', root);
  source.hidden = true;
  const controls = el('div', 'h-reports-schedules-controls', root);
  const search = el('input', 'h-input', controls);
  search.type = 'search';
  search.placeholder = $HR('Search generated reports');
  const filter = el('select', 'h-select', controls);
  filter.setAttribute('aria-label', $HR('Report'));
  const add = el('button', 'h-btn h-btn-small', controls);
  add.type = 'button';
  el('i', 'fa-solid fa-plus', add).setAttribute('aria-hidden', 'true');
  add.append(` ${$HR('New Report')}`);
  const jobHost = el('div', 'h-reports-job', root);
  jobHost.hidden = true;
  const hint = el('p', '', root);
  hint.textContent = $HR('There are already generated reports for this template with this filter. Click the "Bolt" icon to regenerate one, or make a new one.');
  hint.hidden = true;
  const table = el('table', 'h-reports-table', root);
  let monitor = null;
  // New mode: its template, and the query of the chosen source
  let newReport = null;
  let newQuery = null;
  let create = null;

  const filterReport = () => (filter.value ? app.findReport(filter.value) : null);

  const fillFilter = () => {
    const ids = new Set(outputs.map((output) => String(output.reportId)));
    if (report?.id != null) ids.add(String(report.id));
    const current = filter.value || (report?.id != null ? String(report.id) : '');
    filter.replaceChildren(option($HR('All reports'), ''));
    const reports = [...ids].map((id) => app.findReport(id)).filter((item) => item && !(pick && item.isCardView))
      .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
    for (const item of reports) filter.append(option(item.title, item.id));
    filter.value = reports.some((item) => String(item.id) === current) ? current : '';
  };

  /** The rows of the list, or the outputs of the chosen source in New mode. */
  const shownOutputs = () => {
    if (newReport) return newQuery == null ? [] : outputsOfQuery(outputs, newReport, newQuery);
    const text = search.value.trim().toLowerCase();
    return outputs.filter((output) => (!filter.value || String(output.reportId) === filter.value)
      && !(pick && app.findReport(output.reportId)?.isCardView)
      && (!text || `${output.title} ${output.reportTitle || ''}`.toLowerCase().includes(text)));
  };

  const render = () => {
    const shown = shownOutputs();
    const target = filterReport();
    add.disabled = !(target && target.id != null && target.fileExists !== false && !target.isCardView && app.host.canEditRecords());
    add.title = add.disabled ? $HR('Choose a report in the list above') : $HR('Add a generated report of this report');
    table.replaceChildren();
    if (newReport) {
      if (create) create.disabled = newQuery == null || !app.host.canEditRecords();
      hint.hidden = !shown.length;
      table.hidden = !shown.length;
      if (!shown.length) return;
    }
    const head = el('tr', '', el('thead', '', table));
    const labels = ['', 'Lang', 'Name', 'Report', 'Query', 'Scheduled', 'Generated', 'Size', ''];
    if (pick) labels.unshift('');
    // visibility of the output record, as in the admin info of HRecordList
    labels.unshift('');
    for (const label of labels) el('th', '', head).textContent = label ? $HR(label) : '';
    const body = el('tbody', '', table);
    if (!shown.length) {
      const cell = el('td', 'h-muted', el('tr', '', body));
      cell.colSpan = labels.length;
      cell.textContent = $HR('No generated reports');
      return;
    }
    for (const output of shown) {
      const row = el('tr', '', body);
      el('td', 'h-reports-visibility', row).innerHTML = visibilityIconHtml(output.visibility);
      if (pick) pickCell(row, output);
      const generate = el('td', '', row);
      if (output.canEdit) iconButton(generate, 'fa-solid fa-bolt', newReport ? 'Regenerate' : 'Generate now', () => execute(output));
      if (pick && languages.length > 1 && pickedLanguage(output) != null) pickLanguageCell(row, output);
      else languageCell(row, output);
      const name = el('td', 'h-reports-schedule-name', row);
      name.title = output.title;
      if (output.generated && onShow) {
        const link = el('button', 'h-reports-generated-name', name);
        link.type = 'button';
        link.textContent = output.title;
        link.title = $HR('show here');
        link.addEventListener('click', () => run(() => show(output)));
      } else {
        name.textContent = output.title;
      }
      const template = el('td', 'h-muted h-reports-schedule-report', row);
      template.textContent = output.reportTitle || '';
      template.title = template.textContent;
      const query = el('td', 'h-reports-schedule-query', row);
      query.textContent = app.host.describeQuery(output.query);
      query.title = output.query || '';
      el('td', '', row).textContent = intervalLabel(output.intervalMinutes);
      generatedCells(row, output);
      const actions = el('td', 'h-reports-row-actions', row);
      if (output.canEdit) {
        if (app.host.canEditRecords()) iconButton(actions, 'fa-solid fa-pen', 'Edit', () => edit(output));
        // a website may show this output
        if (!pick) iconButton(actions, 'fa-solid fa-trash', 'Delete', () => remove(output));
      }
      if (output.generated) {
        el('span', 'h-reports-icon-gap', actions).setAttribute('aria-hidden', 'true');
        linkIcon(actions, 'fa-solid fa-up-right-from-square', 'Open in a new window', app.api.outputUrl(output.id), { target: '_blank', rel: 'noopener' });
        linkIcon(actions, 'fa-solid fa-download', 'Download', app.api.outputUrl(output.id, { download: true }));
      }
    }
  };

  const reload = async () => {
    outputs = await app.loadOutputs();
    fillFilter();
    render();
  };

  /** The language an output is chosen for, or null. */
  function pickedLanguage(output) {
    return Object.keys(picks).find((code) => picks[code] === output.id) ?? null;
  }

  /** The chosen outputs to the caller. */
  const pickChanged = () => {
    const chosen = Object.values(picks).map((id) => outputs.find((output) => output.id === id)).filter(Boolean);
    pick?.onChange?.({ ...picks }, chosen);
  };

  /** Not chosen any more. */
  const unpick = (output) => {
    for (const key of Object.keys(picks)) if (picks[key] === output.id) delete picks[key];
  };

  /** Choose an output: for its language if the website has it, else for all (`def`); one output per language. */
  const choose = (output, code = null) => {
    unpick(output);
    const own = String(output.language || '').toLowerCase();
    const target = code ?? (languages.length > 1 && languages.includes(own) ? own : 'def');
    if (languages.length < 2) for (const key of Object.keys(picks)) delete picks[key];
    picks[target] = output.id;
    pickChanged();
  };

  /** Checkbox of a row: chosen or not; only a generated HTML file can be chosen. */
  function pickCell(row, output) {
    const box = el('input', '', el('td', '', row));
    box.type = 'checkbox';
    box.checked = pickedLanguage(output) != null;
    box.disabled = !box.checked && output.generated?.format !== 'html';
    box.title = box.disabled ? $HR('Generate this report first') : $HR('Show this report on the page');
    box.setAttribute('aria-label', box.title);
    box.addEventListener('change', () => {
      if (box.checked) {
        choose(output);
      } else {
        unpick(output);
        pickChanged();
      }
      render();
    });
  }

  /** The language a chosen output is shown in: all languages or one of the website. */
  function pickLanguageCell(row, output) {
    const select = el('select', 'h-select h-compact h-reports-pick-language', el('td', '', row));
    select.title = $HR('Language of the page');
    select.append(option($HR('All languages'), 'def'));
    for (const code of languages) select.append(option(code.toUpperCase(), code));
    select.value = pickedLanguage(output);
    select.addEventListener('change', () => {
      choose(output, select.value);
      render();
    });
  }

  /** Back to the list from New mode. */
  const leaveNew = () => {
    newReport = null;
    newQuery = null;
    source.hidden = true;
    controls.hidden = false;
    table.hidden = false;
    hint.hidden = true;
  };

  /**
   * Generate an output: close the dialog and let the manager follow the job, or (without onGenerate) generate
   * it here, back in the list; in pick mode the output is chosen.
   */
  const generateOutput = async (output) => {
    if (onGenerate) {
      onClose?.();
      await onGenerate(output);
      return;
    }
    leaveNew();
    outputs = await app.loadOutputs();
    if (output.reportId != null) filter.value = String(output.reportId);
    fillFilter();
    const fresh = outputs.find((item) => item.id === output.id) || output;
    if (pick && pickedLanguage(fresh) == null) choose(fresh);
    render();
    await execute(fresh);
  };

  /** New mode for a template: the source of the records instead of the search and the list. */
  const startNew = async (target) => {
    const [current, sources] = await Promise.all([app.currentResult(), app.querySourcesForReports()]);
    let sourceRequest = 0;
    const radios = [];
    const addRadio = (value, label, parent) => {
      const line = el('label', '', parent);
      const radio = el('input', '', line);
      radio.type = 'radio';
      radio.name = 'h-reports-source';
      radio.value = value;
      line.append(` ${label}`);
      radios.push(radio);
      return radio;
    };

    source.replaceChildren();
    el('span', 'h-reports-form-label', source).textContent = $HR('Source');
    const group = el('div', 'h-reports-form-radios', source);
    if (current) {
      const count = current.total == null ? '' : ` (${current.total} ${$HR('records')})`;
      addRadio('current', `${$HR('Current result')}${count}`, group);
    }
    addRadio('source', $HR('Query Source'), group);
    radios[0].checked = true;

    const sourceRow = el('div', 'h-reports-source-row', source);
    let sourceInput;
    if (sources.length) {
      sourceInput = el('select', 'h-select', sourceRow);
      sourceInput.setAttribute('aria-label', $HR('Query Source'));
      sourceInput.append(option('', ''));
      for (const item of sources) sourceInput.append(option(item.title, item.id));
    } else {
      sourceInput = el('input', 'h-input', sourceRow);
      sourceInput.type = 'number';
      sourceInput.min = '0';
      sourceInput.setAttribute('aria-label', $HR('Query Source record id'));
    }

    create = el('button', 'h-btn h-btn-small h-btn-primary h-reports-source-create', source);
    create.type = 'button';
    create.textContent = $HR('Generate New Report');
    const sourceNote = sources.length ? el('div', 'h-reports-form-hint h-muted h-reports-source-note', source) : null;
    if (sourceNote) sourceNote.textContent = $HR('Query Sources with parameters (Filter Form) are not listed.');
    create.addEventListener('click', () => run(async () => {
      const output = await app.newOutput(newReport, newQuery);
      if (output) await generateOutput(output);
    }));

    /** The query of the chosen source, then the outputs that already use it. */
    const applySource = async () => {
      const request = ++sourceRequest;
      const fromSource = radios.find((radio) => radio.checked)?.value === 'source';
      sourceRow.hidden = !fromSource;
      if (sourceNote) sourceNote.hidden = !fromSource;
      const id = Number(sourceInput.value);
      newQuery = null;
      if (!fromSource) newQuery = current.query;
      render();
      if (!fromSource || !(id > 0)) return;
      const query = await app.querySourceQuery(id);
      if (request !== sourceRequest) return;
      newQuery = query;
      render();
    };

    for (const radio of radios) radio.addEventListener('change', () => run(applySource));
    sourceInput.addEventListener('change', () => run(applySource));

    newReport = target;
    controls.hidden = true;
    source.hidden = false;
    await applySource();
  };

  const show = async (output) => {
    if (output.generated.size > LARGE_FILE
      && !(await confirmDialog(`${output.title}: ${formatSize(output.generated.size)}. ${$HR('Large files can make the page slow. Show it here anyway?')}`, { yesLabel: 'Show' }))) {
      return;
    }
    onClose?.();
    onShow(app.api.outputUrl(output.id));
  };

  const execute = async (output) => {
    if (newReport) {
      await generateOutput(output);
      return;
    }
    await monitor?.destroy();
    jobHost.replaceChildren();
    jobHost.hidden = false;
    monitor = new HJobMonitor().attach(el('div', '', jobHost), { jobClient: app.jobs, compact: true });
    const final = await monitor.follow(await app.startGenerate(output));
    if (final.status === 'done') {
      setTimeout(() => { jobHost.hidden = true; }, 1500);
      await reload();
      // the size and date of the file
      if (pick && pickedLanguage(output) != null) pickChanged();
    }
  };

  const edit = async (output) => {
    if (await app.editOutput(output)) await reload();
  };

  const remove = async (output) => {
    if (!(await confirmDialog(`${$HR('Delete generated report')} "${output.title}"?`, { yesLabel: 'Delete' }))) return;
    await app.deleteOutput(output);
    await reload();
  };

  add.addEventListener('click', () => run(async () => {
    const target = filterReport();
    if (target) await startNew(target);
  }));
  search.addEventListener('input', render);
  filter.addEventListener('change', render);

  fillFilter();
  const hasOutputs = outputs.some((output) => String(output.reportId) === String(report?.id));
  const canRun = report?.id != null && report.fileExists !== false;
  let ready = Promise.resolve();
  if (canRun && (mode === 'new' || (!hasOutputs && !pick))) {
    // the list is not shown while the source loads
    controls.hidden = true;
    table.hidden = true;
    ready = run(() => startNew(report));
  } else {
    render();
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

  // the stored choice with its outputs (visibility for the caller's warning)
  if (pick) pickChanged();
  return { element: root, ready, destroy: () => void monitor?.destroy() };
}

/** The language of an output as a badge. */
function languageCell(row, output) {
  const cell = el('td', '', row);
  if (output.language) el('span', 'h-reports-language', cell).textContent = output.language.toUpperCase();
}

/** Date and size of the generated file. */
function generatedCells(row, output) {
  const date = el('td', 'h-reports-nowrap', row);
  const size = el('td', 'h-reports-nowrap', row);
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
