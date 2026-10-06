/**
 * @file ReportViewer.js
 * @brief Main area of the reports manager: information about the selected
 *        report, the progress of a running job, and the output (test result or
 *        a generated file, loaded by URL) in a frame that fills the area.
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

import { HBaseWidget, HJobMonitor } from '#shared/widgets';
import { $HR } from '#shared/ui';

/** Time the progress panel stays after a successful job (ms). */
export const HIDE_PROGRESS_AFTER = 1500;

/** Report information, job progress and output frame. */
export class ReportViewer extends HBaseWidget {
  /**
   * @param {HTMLElement} container Area host.
   * @param {object} options
   * @param {import('#shared/api').JobClient} options.jobClient Job client.
   * @returns {ReportViewer}
   */
  attach(container, options = {}) {
    super.attach(container, options);
    this.monitor = null;
    this._hideTimer = null;
    const root = el('div', 'h-reports-viewer');
    this.jobHost = el('div', 'h-reports-job', root);
    this.jobHost.hidden = true;
    this.info = el('div', 'h-reports-info', root);
    this.frame = el('iframe', 'h-reports-preview-frame', root);
    this.setScriptsAllowed(false);
    this.frame.title = $HR('Report output');
    this.frame.hidden = true;
    this.container.replaceChildren(root);
    return this;
  }

  /**
   * Sandbox of the output frame. Same origin: the frame requests carry the login
   * (test result, files of private records); popups: links open normal tabs.
   * Scripts run only when the database is authorised to run JavaScript in
   * reports (the server removes them otherwise). Applies to the next output.
   *
   * @param {boolean} allowed
   */
  setScriptsAllowed(allowed) {
    this.frame.setAttribute('sandbox', allowed
      ? 'allow-same-origin allow-scripts allow-popups allow-popups-to-escape-sandbox'
      : 'allow-same-origin allow-popups allow-popups-to-escape-sandbox');
  }

  /**
   * Show the information of a report (no output).
   *
   * @param {object|null} report Selected report.
   */
  showReport(report) {
    this.frame.hidden = true;
    this.frame.removeAttribute('src');
    this.info.hidden = false;
    this.info.replaceChildren();
    if (!report) {
      el('div', 'h-reports-placeholder h-muted', this.info).textContent = $HR('Select a report, or create a new one.');
      return;
    }
    const head = el('div', 'h-reports-info-head', this.info);
    el('h2', 'h-reports-info-title', head).textContent = report.title;
    const kind = el('span', 'h-reports-kind', head);
    kind.dataset.kind = report.id == null ? 'file' : report.isCardView ? 'card' : 'set';
    kind.textContent = $HR(report.id == null ? 'Template without a report record'
      : report.isCardView ? 'Single record (card)' : 'Record set');
    if (report.description) el('p', 'h-reports-description', this.info).textContent = report.description;
    if (report.fileExists === false) {
      el('div', 'h-reports-warning', this.info).textContent = $HR('The template file of this report does not exist.');
    }
    const schedules = (report.schedules || []).length;
    if (schedules) {
      el('div', 'h-muted', this.info).textContent = `${$HR('Schedules')}: ${schedules}`;
    }
    el('div', 'h-reports-hint h-muted', this.info).textContent = report.isCardView
      ? $HR('Test shows the report for the first selected record, or the first record of the current result.')
      : $HR('Test shows the report for the selected records, or the first 50 of the current result. Generate writes it to a file.');
  }

  /** Hide the information and the previous output (a job starts). */
  clear() {
    this.info.hidden = true;
    this.frame.hidden = true;
    this.frame.removeAttribute('src');
  }

  /**
   * Load output into the frame by URL: a test result (`/jobs/{id}/result`) or a
   * generated file. Large output is never copied into the page.
   *
   * @param {string} url Output URL.
   */
  showUrl(url) {
    this.info.hidden = true;
    this.frame.src = url;
    this.frame.hidden = false;
  }

  /**
   * Follow a started job in the progress panel. The panel is hidden shortly
   * after the job is done; a failed or stopped job stays visible with its message.
   *
   * @param {Promise<object>|object} started Queued job (or a promise of it).
   * @returns {Promise<object>} Final job.
   */
  async followJob(started) {
    this.clear();
    const job = await started;
    clearTimeout(this._hideTimer);
    await this.monitor?.destroy();
    this.jobHost.replaceChildren();
    this.jobHost.hidden = false;
    this.monitor = new HJobMonitor().attach(el('div', '', this.jobHost), { jobClient: this.options.jobClient, compact: true });
    const final = await this.monitor.follow(job);
    if (final.status === 'done') {
      this._hideTimer = setTimeout(() => { this.jobHost.hidden = true; }, HIDE_PROGRESS_AFTER);
    }
    return final;
  }

  /** Hide the progress of a job without stopping it (it continues on the server). */
  stopFollowing() {
    clearTimeout(this._hideTimer);
    const monitor = this.monitor;
    this.monitor = null;
    monitor?.destroy().catch(() => {});
    this.jobHost.replaceChildren();
    this.jobHost.hidden = true;
  }

  /** Stop following (jobs continue on the server). */
  async destroy() {
    clearTimeout(this._hideTimer);
    await this.monitor?.destroy().catch(() => {});
    await super.destroy();
  }
}

/** Element helper. */
function el(tag, className, parent = null) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  parent?.append(element);
  return element;
}
