/**
 * @file ReportsApplication.js
 * @brief Controller of the reports manager: list, selection, actions, jobs, editor.
 *
 * The view (ReportManager, its forms and dialogs, the editor) calls the actions
 * here; the application talks to the server (ReportApi, JobClient) and to the
 * host (ReportsHostAdapter: current result, selection, Query Sources, users).
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

import { $HR, HMsg } from '#shared/ui';
import { HDbDefs } from '#shared/data/HDbDefs.js';
import { isJobFinished } from '#shared/api';

/** Record limit of a test run (server: ReportPolicy::TEST_RECORD_LIMIT). */
export const TEST_RECORD_LIMIT = 50;

/** Report output formats of the server. */
export const REPORT_FORMATS = Object.freeze(['html', 'csv', 'txt', 'xml', 'json', 'js', 'css']);

/** Regeneration intervals of a schedule (minutes; 0 = on request only). */
export const SCHEDULE_INTERVALS = Object.freeze([
  { value: 0, label: 'No' },
  { value: 60, label: '1 hour' },
  { value: 1440, label: '1 day' },
  { value: 10080, label: '7 days' },
  { value: 43200, label: '1 month' },
  { value: 259200, label: '6 months' }
]);

/** Reports manager controller. */
export class ReportsApplication extends EventTarget {
  /**
   * @param {object} options
   * @param {object} options.config Normalized configuration (reportsConfig.js).
   * @param {import('../data/ReportApi.js').ReportApi} options.reportApi Reports API.
   * @param {import('#shared/api').JobClient} options.jobClient Jobs API.
   * @param {import('../host/ReportsHostAdapter.js').ReportsHostAdapter} options.host Host adapter.
   */
  constructor({ config, reportApi, jobClient, host }) {
    super();
    this.config = config;
    this.api = reportApi;
    this.jobs = jobClient;
    this.host = host;
    this.data = { installed: false, reports: [], unregistered: [] };
    this.userGroups = null;
    this.selectedRef = null;
    // running generation of the user (restored after a page reload); see restoreJobs()
    this.generateJob = null;
    this.view = null;
    this._dbdefs = null;
  }

  /**
   * Load users/groups and the reports list.
   *
   * @returns {Promise<ReportsApplication>}
   */
  async initialize() {
    this.userGroups = await this.host.getUserGroups();
    await this.refresh();
    if (this.config.initialReport != null) await this.selectReport(String(this.config.initialReport));
    await this.restoreJobs();
    return this;
  }

  /** @param {object} view The manager view (ReportManager). */
  setView(view) {
    this.view = view;
  }

  /**
   * Reload the list and keep the selection when possible.
   *
   * @returns {Promise<void>}
   */
  async refresh() {
    this.data = await this.api.list('all');
    this._emit('listchange');
    if (this.selectedRef && !this.findReport(this.selectedRef)) this.selectedRef = null;
    this._emit('selectionchange');
  }

  /** All reports: records first, then unregistered files. */
  allReports() {
    return [...(this.data.reports || []), ...(this.data.unregistered || [])];
  }

  /**
   * A report of the list by reference (record id or file name).
   *
   * @param {string} reference
   * @returns {object|null}
   */
  findReport(reference) {
    const ref = String(reference ?? '');
    return this.allReports().find((report) => (report.id != null ? String(report.id) === ref : report.file === ref)) || null;
  }

  /** Number of records of a test run: 1 for a card report, else TEST_RECORD_LIMIT. */
  static testLimit(report) {
    return report?.isCardView === true ? 1 : TEST_RECORD_LIMIT;
  }

  /**
   * Tip of the Test button of a report.
   *
   * @param {object|null} report
   * @returns {string} Resource key.
   */
  static testTip(report) {
    return report?.isCardView === true
      ? 'Run the report on the first selected record, or on the first record of the current result'
      : 'Run the report on the selected records, or on the first 50 records of the current result';
  }

  /** Reference of a report: record id, or the file name of an unregistered file. */
  static reference(report) {
    return report?.id != null ? String(report.id) : String(report?.file || '');
  }

  /**
   * Prefix of the generated files of a report: its template file name without
   * ".tpl" (characters not allowed in file names replaced as on the server).
   *
   * @param {object} report
   * @returns {string}
   */
  static outputPrefix(report) {
    return String(report?.file || '').replace(/\.tpl$/i, '').replace(/[/\\:*?"<>|\u0000-\u001F]+/g, '_').trim();
  }

  /** The selected report, or null. */
  selectedReport() {
    return this.selectedRef ? this.findReport(this.selectedRef) : null;
  }

  /**
   * Select a report (asks before closing an editor with unsaved changes).
   *
   * @param {string|null} reference
   * @returns {Promise<boolean>} False when the user kept the editor open.
   */
  async selectReport(reference) {
    if (this.selectedRef === reference) return true;
    if (this.view?.confirmLeaveEditor && !(await this.view.confirmLeaveEditor())) return false;
    this.selectedRef = reference;
    this._emit('selectionchange');
    return true;
  }

  /** Open the template editor of a report. */
  async openEditor(reference) {
    if (!(await this.selectReport(reference))) return;
    this.view?.showEditor?.(this.findReport(reference));
  }

  /** Whether the template editor has unsaved changes. */
  hasUnsavedChanges() {
    return this.view?.hasUnsavedChanges?.() === true;
  }

  /**
   * Database definitions for the field tree (loaded once).
   *
   * @returns {Promise<HDbDefs>}
   */
  loadDbDefs() {
    this._dbdefs ||= HDbDefs.load(this.api.apiClient.buildUrl('/def/snapshot'), { lang: this.config.language })
      .catch((error) => {
        this._dbdefs = null;
        throw error;
      });
    return this._dbdefs;
  }

  // ------------------------------------------------------------ actions

  /** Install the report record types and convert old schedules. */
  async setup() {
    const result = await this.api.setup();
    HMsg.showMsgDlg(listElement(result?.report || []), { title: 'Report setup', buttons: { Close: () => HMsg.closeMsgDlg() } });
    await this.refresh();
  }

  /**
   * Create a report and select it.
   *
   * @param {{title: string, isCardView: boolean, description?: string, file?: string, body?: string}} values
   *        Without `body` the report starts with a starter template.
   */
  async createReport(values) {
    const body = typeof values.body === 'string' ? values.body : starterTemplate(values.isCardView);
    const report = await this.api.create({ ...values, body });
    await this.refresh();
    await this.selectReport(ReportsApplication.reference(report));
    return report;
  }

  /** Import a .gpl/.tpl file and select the new report. */
  async importFile(file) {
    const report = await this.api.importFile(file);
    await this.refresh();
    await this.selectReport(ReportsApplication.reference(report));
    return report;
  }

  /**
   * Save the properties form: change a report record, or create the record of an
   * unregistered file (renaming the file first when its name was changed).
   *
   * @param {object} report Report of the list.
   * @param {{title: string, description: string, isCardView: boolean, file: string}} values
   * @returns {Promise<object>} The saved report.
   */
  async saveProperties(report, values) {
    let saved;
    if (report.id == null) {
      let file = report.file;
      if (values.file) {
        file = (await this.api.update(report.file, { file: values.file })).file;
      }
      saved = await this.api.register(file, { title: values.title, isCardView: values.isCardView, description: values.description });
    } else {
      saved = await this.api.update(report.id, values);
    }
    this.selectedRef = ReportsApplication.reference(saved);
    await this.refresh();
    return saved;
  }

  /** Delete a report record (and its unused file) or an unregistered file. */
  async deleteReport(report, { keepFile = false } = {}) {
    await this.api.remove(ReportsApplication.reference(report), { keepFile });
    if (this.selectedRef === ReportsApplication.reference(report)) this.selectedRef = null;
    await this.refresh();
  }

  /** All visible schedules (each with `reportTitle` and its last `generated` file). */
  loadSchedules() {
    return this.api.schedules();
  }

  /** Add a schedule to a report. */
  async addSchedule(report, values) {
    await this.api.createSchedule(report.id, values);
    await this.refresh();
  }

  /** Change a schedule. */
  async updateSchedule(reportId, schedule, values) {
    await this.api.updateSchedule(reportId, schedule.id, values);
    await this.refresh();
  }

  /** Delete a schedule. */
  async deleteSchedule(reportId, schedule) {
    await this.api.deleteSchedule(reportId, schedule.id);
    await this.refresh();
  }

  /** Generated files of a report (names starting with its file name), newest first. */
  generatedFiles(report) {
    const prefix = ReportsApplication.outputPrefix(report);
    return prefix ? this.api.generated(prefix) : Promise.resolve([]);
  }

  /** Delete a generated file. */
  deleteGenerated(file) {
    return this.api.deleteGenerated(file);
  }

  /**
   * The host's current result: `{query, title, total}`, or null.
   *
   * @returns {Promise<object|null>}
   */
  async currentResult() {
    const current = await this.host.getCurrentQuery();
    if (!current?.query) return null;
    // the host's DataSource usually knows its count; ask the server only without it
    const known = Number(current.total);
    const total = Number.isFinite(known) && known >= 0 ? known : await this.api.queryCount(current.query).catch(() => null);
    return { ...current, total };
  }

  /** Query Sources of the host that can be generated (no Filter Form parameters). */
  async querySourcesForReports() {
    return (await this.host.getQuerySources()).filter((source) => !source.parametrized);
  }

  /**
   * Record ids for a test run: the host's selection, else the first records of its
   * current result. A single record (card) report is tested on one record only:
   * such templates usually gather all linked and related data of the record.
   *
   * @param {object|null} [report] Tested report (its card flag sets the limit).
   * @returns {Promise<{ids: number[], source: string}>}
   */
  async testRecordIds(report = null) {
    const limit = ReportsApplication.testLimit(report);
    const selection = await this.host.getSelection();
    if (selection.length) {
      return { ids: selection.slice(0, limit), source: 'selection', total: selection.length };
    }
    const current = await this.host.getCurrentQuery();
    if (current?.query) {
      const ids = await this.api.queryIds(current.query, limit);
      return { ids, source: 'result', title: current.title || '' };
    }
    return { ids: [], source: 'none' };
  }

  /**
   * Start a test run of a saved report or an unsaved template text.
   *
   * @param {{report?: string, body?: string, ids: number[], replevel?: number}} params
   * @returns {Promise<object>} The queued job.
   */
  startTest(params) {
    return this.jobs.start('report-preview', params);
  }

  /** URL of the HTML result of a finished test run (loaded in the output frame). */
  testResultUrl(job) {
    return this.jobs.resultUrl(job.id);
  }

  /**
   * Start a generation.
   *
   * @param {object} params `{schedule}` or `{report, querySource | query, format, suffix}`.
   * @returns {Promise<object>} The queued job.
   */
  startGenerate(params) {
    return this.jobs.start('report-generate', params);
  }

  /**
   * Queued and running report jobs of the user (also those started before a
   * page reload, or in another tab).
   *
   * @returns {Promise<Array<object>>}
   */
  async activeJobs() {
    const jobs = await this.jobs.list();
    return (Array.isArray(jobs) ? jobs : []).filter((job) => !isJobFinished(job)
      && (job.type === 'report-generate' || job.type === 'report-preview'));
  }

  /**
   * Find the user's running generation again (after a page reload, or after the
   * manager was closed): it is shown with its progress and Stop. Its report is
   * selected when nothing is selected yet. Test runs are not restored: the next
   * Test replaces them on the server.
   *
   * @returns {Promise<object|null>} The running generate job.
   */
  async restoreJobs() {
    const jobs = await this.activeJobs().catch(() => []);
    const job = jobs.find((item) => item.type === 'report-generate') || null;
    this.setGenerateJob(job);
    const report = job ? this.reportOfJob(job) : null;
    if (report && !this.selectedRef) await this.selectReport(ReportsApplication.reference(report));
    return job;
  }

  /**
   * Remember the running generation (null: none). The manager follows it while
   * its report is shown.
   *
   * @param {object|null} job
   */
  setGenerateJob(job) {
    this.generateJob = job && !isJobFinished(job) ? job : null;
    this._emit('jobchange');
  }

  /**
   * Report of a job: by the report record id in its parameters, else by the
   * template file.
   *
   * @param {object} job
   * @returns {object|null}
   */
  reportOfJob(job) {
    const params = job?.params || {};
    if (params.reportId != null) {
      const byId = this.findReport(String(params.reportId));
      if (byId) return byId;
    }
    const file = String(params.templateFile || '');
    return file ? this.allReports().find((report) => report.file === file) || null : null;
  }

  /** Remove the view. */
  async destroy() {
    await this.view?.destroy?.();
    this.view = null;
  }

  /** Dispatch an event of the application. */
  _emit(type) {
    this.dispatchEvent(new Event(type));
  }
}

/** First text of a new template. */
export function starterTemplate(isCardView) {
  if (isCardView) {
    return [
      '{* Card view report: one record, used in popups, cards and Record view *}',
      '{foreach $results as $r1}',
      '  {$r = $heurist->getRecord($r1)}',
      '  <div class="report-card">',
      '    <b>{$r.recTitle}</b>',
      '  </div>',
      '{/foreach}',
      ''
    ].join('\n');
  }
  return [
    '{* Report for a set of records *}',
    '{foreach $results as $r1}',
    '  {$r = $heurist->getRecord($r1)}',
    '  <div>{$r.recID}: {$r.recTitle}</div>',
    '{/foreach}',
    ''
  ].join('\n');
}

/**
 * Interval label of a schedule.
 *
 * @param {number|null} minutes Interval in minutes.
 * @returns {string}
 */
export function intervalLabel(minutes) {
  const value = Number(minutes) || 0;
  const known = SCHEDULE_INTERVALS.find((item) => item.value === value);
  if (known) return value ? $HR(known.label) : $HR('on request');
  if (value % 1440 === 0) return `${value / 1440} ${$HR('days')}`;
  if (value % 60 === 0) return `${value / 60} h`;
  return `${value} min`;
}

/** A `<ul>` of text lines. */
function listElement(lines) {
  const list = document.createElement('ul');
  for (const line of lines) {
    const item = document.createElement('li');
    item.textContent = String(line);
    list.append(item);
  }
  if (!lines.length) list.textContent = $HR('Done');
  return list;
}
