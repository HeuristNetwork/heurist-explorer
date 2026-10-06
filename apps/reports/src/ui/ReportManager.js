/**
 * @file ReportManager.js
 * @brief Reports manager view: one toolbar and a main area.
 *
 * Toolbar: New, Import, Select report (list popover) | for the selected report:
 * Template, Register / Edit, Export, Delete | Test, Generate (with the list of
 * generated files), Schedule. On a narrow screen only the icons are shown.
 * Main area: report information and output (ReportViewer), or the template
 * editor, which covers the whole manager and is loaded only when it is first
 * opened (CodeMirror).
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

import { HBaseWidget } from '#shared/widgets';
import { $HR, HMsg } from '#shared/ui';
import { ReportsApplication } from '../core/ReportsApplication.js';
import { ReportViewer } from './ReportViewer.js';
import { buildReportList, iconClass } from './ReportList.js';
import { buildGeneratedList } from './GeneratedFiles.js';
import { openSchedulesDialog } from './SchedulesDialog.js';
import { openPropertiesForm, openGenerateForm, openScheduleForm } from './reportForms.js';
import { confirmDialog } from './formDialog.js';
import { showPopover, closePopover } from './popover.js';
import './ReportManager.css';

/** Reports manager view. */
export class ReportManager extends HBaseWidget {
  /**
   * @param {HTMLElement} container View host.
   * @param {object} options
   * @param {ReportsApplication} options.application Controller.
   * @param {Function} [options.loadEditor] Loads the editor module (lazy import); for tests.
   * @returns {ReportManager}
   */
  attach(container, options = {}) {
    super.attach(container, options);
    this.app = options.application;
    this.loadEditor = options.loadEditor || (() => import('./editor/ReportEditorPanel.js'));
    this.editor = null;
    this.testing = false;
    // id of the generate job shown in the viewer; the test job this page started
    this.followingId = null;
    this.testJob = null;
    this.render();
    this.listen(this.app, 'listchange', () => this.update());
    this.listen(this.app, 'selectionchange', () => this.update());
    this.listen(this.app, 'jobchange', () => this.update());
    return this;
  }

  /** Build the layout. */
  render() {
    const root = el('div', 'h-reports');
    const toolbar = el('div', 'h-toolbar h-reports-toolbar', root);
    toolbar.setAttribute('role', 'toolbar');
    this.buttons = {};

    this.buttons.create = this.tool(toolbar, 'fa-solid fa-plus', 'New', 'Create a new report', () => this.createReport());
    this.buttons.import = this.tool(toolbar, 'fa-solid fa-file-import', 'Import', 'Import a report template (.gpl or .tpl)', () => this.fileInput.click());
    this.fileInput = el('input', 'h-hidden', toolbar);
    this.fileInput.type = 'file';
    this.fileInput.accept = '.gpl,.tpl';
    this.listen(this.fileInput, 'change', () => {
      const file = this.fileInput.files?.[0];
      this.fileInput.value = '';
      if (file) this.run(() => this.app.importFile(file));
    });

    const select = el('button', 'h-btn h-reports-select', toolbar);
    select.type = 'button';
    select.setAttribute('aria-haspopup', 'listbox');
    select.title = $HR('Select a report');
    this.selectIcon = el('i', 'fa-solid fa-list', select);
    this.selectIcon.setAttribute('aria-hidden', 'true');
    this.selectLabel = el('span', 'h-reports-select-label', select);
    el('i', 'fa-solid fa-caret-down', select).setAttribute('aria-hidden', 'true');
    this.listen(select, 'click', () => this.toggleList(select));
    this.buttons.select = select;

    this.reportTools = el('span', 'h-reports-tool-group', toolbar);
    this.buttons.template = this.tool(this.reportTools, 'fa-solid fa-code', 'Template', 'Edit the template', () => this.openEditor());
    this.buttons.template.classList.add('h-btn-primary');
    this.buttons.properties = this.tool(this.reportTools, 'fa-solid fa-pen', 'Edit', 'Title, description, card flag and file name', () => this.editProperties());
    this.buttons.export = this.tool(this.reportTools, 'fa-solid fa-file-export', 'Export',
      'Download the template with concept codes (.gpl), to import into another database', () => this.exportTemplate());
    this.buttons.delete = this.tool(this.reportTools, 'fa-solid fa-trash', 'Delete', 'Delete the report', () => this.deleteReport());

    this.runTools = el('span', 'h-reports-tool-group', toolbar);
    el('span', 'h-reports-separator', this.runTools).setAttribute('aria-hidden', 'true');
    this.buttons.test = this.tool(this.runTools, 'fa-solid fa-flask', 'Test',
      'Run the report on the selected records, or on the first 50 records of the current result', () => this.test());
    this.buttons.test.classList.add('h-btn-primary');
    const split = el('span', 'h-reports-split', this.runTools);
    this.buttons.generate = this.tool(split, 'fa-solid fa-gears', 'Generate', 'Write the report to a file in the background', () => this.generate());
    const caret = el('button', 'h-btn h-reports-split-caret', split);
    caret.type = 'button';
    caret.title = $HR('Generated files of this report');
    caret.setAttribute('aria-label', caret.title);
    caret.setAttribute('aria-haspopup', 'true');
    el('i', 'fa-solid fa-caret-down', caret).setAttribute('aria-hidden', 'true');
    this.listen(caret, 'click', () => this.toggleGenerated(caret));
    this.buttons.generated = caret;
    this.buttons.schedule = this.tool(this.runTools, 'fa-solid fa-calendar-days', 'Schedule', 'Schedules that regenerate the report file', () => this.schedules());

    // the database may not run JavaScript/CSS blocks in reports (server setting)
    this.jsWarning = el('span', 'h-reports-js-warning', toolbar);
    this.jsWarning.title = $HR('CSS and Javascript are disabled by default. Request authorisation from server admin if required');
    el('i', 'fa-solid fa-triangle-exclamation', this.jsWarning).setAttribute('aria-hidden', 'true');
    el('span', 'h-reports-js-warning-text', this.jsWarning).textContent = this.jsWarning.title;
    this.jsWarning.hidden = true;

    this.main = el('div', 'h-reports-main', root);
    this.viewerHost = el('div', 'h-reports-viewer-host', this.main);
    this.viewer = new ReportViewer().attach(this.viewerHost, { jobClient: this.app.jobs });
    this.shownRef = undefined;
    // the template editor is a modal layer over the whole screen
    this.editorHost?.remove();
    this.editorHost = el('div', 'h-reports-editor-host', document.body);
    this.editorHost.hidden = true;
    this.editorHost.setAttribute('role', 'dialog');
    this.editorHost.setAttribute('aria-modal', 'true');
    this.container.replaceChildren(root);
    this.update();
  }

  /** Toolbar button with icon and caption (the caption is hidden on narrow screens). */
  tool(parent, icon, label, title, onClick) {
    const button = el('button', 'h-btn h-reports-tool', parent);
    button.type = 'button';
    button.title = $HR(title);
    button.setAttribute('aria-label', $HR(label));
    el('i', icon, button).setAttribute('aria-hidden', 'true');
    el('span', 'h-reports-tool-label', button).textContent = $HR(label);
    this.listen(button, 'click', () => this.run(onClick));
    return button;
  }

  /** Update the toolbar and the main area for the selection. */
  update() {
    const report = this.app.selectedReport();
    const installed = this.app.data.installed !== false;
    this.selectLabel.textContent = report ? report.title : $HR('Select report');
    this.selectIcon.className = report ? iconClass(report) : 'fa-solid fa-list';

    const show = (button, visible) => { button.hidden = !visible; };
    this.reportTools.hidden = !report;
    show(this.buttons.template, Boolean(report) && report.fileExists !== false);
    const label = this.buttons.properties.querySelector('.h-reports-tool-label');
    if (report?.id == null) {
      label.textContent = $HR('Register');
      this.buttons.properties.title = $HR('Create the report record of this template');
      this.buttons.properties.setAttribute('aria-label', $HR('Register'));
      show(this.buttons.properties, Boolean(report) && installed);
    } else {
      label.textContent = $HR('Edit');
      this.buttons.properties.title = $HR('Title, description, card flag and file name');
      this.buttons.properties.setAttribute('aria-label', $HR('Edit'));
      show(this.buttons.properties, report.canEdit === true);
    }
    show(this.buttons.export, Boolean(report) && report.fileExists !== false);
    show(this.buttons.delete, report?.canEdit === true);

    this.runTools.hidden = !report;
    const runnable = Boolean(report) && report.fileExists !== false;
    this.buttons.test.disabled = !runnable || this.testing;
    this.buttons.test.title = this.app.testTip(report);
    this.jsWarning.hidden = !this.app.data.settings || this.app.scriptsAllowed();
    this.viewer.setScriptsAllowed(this.app.scriptsAllowed());
    const generatable = runnable && !report.isCardView;
    this.buttons.generate.disabled = !generatable;
    this.buttons.generated.disabled = !report;
    this.buttons.schedule.disabled = !(report?.id != null && !report.isCardView);

    // the information is shown again only for another report: output stays
    const reference = report ? ReportsApplication.reference(report) : null;
    if (reference !== this.shownRef) {
      this.shownRef = reference;
      this.viewer.showReport(report);
    }
    this.syncGenerateJob(report);
  }

  /**
   * The running generation is followed while its report is shown; for another
   * report its progress is hidden (the job continues) and comes back when its
   * report is selected again.
   *
   * @param {object|null} report Shown report.
   */
  syncGenerateJob(report) {
    const job = this.app.generateJob;
    const shown = Boolean(job && report && this.app.reportOfJob(job) === report);
    if (shown && this.followingId !== job.id) {
      this.followGenerate(job).catch((error) => HMsg.showMsgErr(error?.message || String(error)));
    } else if (!shown && this.followingId) {
      this.followingId = null;
      this.viewer.stopFollowing();
    }
  }

  /**
   * Follow a generate job until it ends; a generated text file is shown.
   *
   * @param {object} job Queued or running job.
   * @returns {Promise<void>}
   */
  async followGenerate(job) {
    this.followingId = job.id;
    let final;
    try {
      final = await this.viewer.followJob(job);
    } catch (error) {
      if (error?.name !== 'AbortError') throw error;
      // another report was selected (stopFollowing): the progress is hidden, the job continues
      if (this.followingId !== job.id) return;
      // a test run took the progress panel: keep waiting quietly for the end of the generation
      const ended = await this.app.jobs.wait(job).catch(() => null);
      if (this.followingId === job.id) this.followingId = null;
      if (this.app.generateJob?.id === job.id) this.app.setGenerateJob(null);
      if (ended?.status === 'done') HMsg.showMsgFlash($HR('The report file is ready'), { showDelay: 2500 });
      return;
    }
    if (this.followingId !== job.id) return;
    this.followingId = null;
    if (this.app.generateJob?.id === job.id) this.app.setGenerateJob(null);
    if (final.status === 'done' && final.result?.url && /\.(html|txt|xml|json|csv)$/i.test(final.result.file || '')) {
      this.viewer.showUrl(final.result.url);
    }
  }

  /**
   * Show the user's running generation instead of starting another one: its
   * report is selected and its progress (with Stop) shown.
   *
   * @param {object} job Running generate job.
   * @returns {Promise<void>}
   */
  async showRunningGeneration(job) {
    this.app.setGenerateJob(job);
    const report = this.app.reportOfJob(job);
    if (report) await this.app.selectReport(ReportsApplication.reference(report));
    HMsg.showMsgFlash($HR('A report is still being generated. Wait for it to finish, or stop it.'), { showDelay: 3500 });
  }

  /**
   * Make sure the report record types exist before a record is created: a manager
   * is asked to install them, other users are told to ask the database owner.
   *
   * @returns {Promise<boolean>} True when the record types are installed.
   */
  async ensureInstalled() {
    if (this.app.data.installed !== false) return true;
    if (!this.app.data.canSetup) {
      HMsg.showMsgErr($HR('The report record types (Custom Report, Custom Report Schedule) are not installed in this database. Ask the database owner to install them.'));
      return false;
    }
    if (!(await confirmDialog($HR('The report record types (Custom Report, Custom Report Schedule) are not installed in this database. Install them now?'), { yesLabel: 'Install' }))) {
      return false;
    }
    await this.app.setup();
    return this.app.data.installed !== false;
  }

  /** Open or close the report list. */
  toggleList(anchor) {
    if (anchor.getAttribute('aria-expanded') === 'true') {
      closePopover();
      return;
    }
    showPopover(anchor, buildReportList(this.app, {
      onSelect: (report) => {
        closePopover();
        this.run(() => this.app.selectReport(ReportsApplication.reference(report)));
      }
    }), { className: 'h-reports-picker-popover' });
  }

  /** Open or close the list of generated files of the selected report. */
  toggleGenerated(anchor) {
    const report = this.app.selectedReport();
    if (!report) return;
    if (anchor.getAttribute('aria-expanded') === 'true') {
      closePopover();
      return;
    }
    showPopover(anchor, buildGeneratedList(this.app, report, {
      onShow: (url) => this.showOutput(() => this.viewer.showUrl(url)),
      onClose: () => closePopover()
    }), { className: 'h-reports-generated-popover', align: 'right' });
  }

  /** New report: properties form, then the template editor. */
  async createReport() {
    if (!(await this.ensureInstalled())) return;
    const values = await openPropertiesForm(null);
    if (!values) return;
    const created = await this.app.createReport(values);
    await this.showEditor(this.app.findReport(ReportsApplication.reference(created)) || created);
  }

  /** Register or edit the selected report with the properties form. */
  async editProperties() {
    const report = this.app.selectedReport();
    if (!report) return;
    if (report.id == null && !(await this.ensureInstalled())) return;
    const values = await openPropertiesForm(report);
    if (values) await this.app.saveProperties(report, values);
  }

  /** Open the template editor of the selected report. */
  async openEditor() {
    const report = this.app.selectedReport();
    if (report) await this.showEditor(report);
  }

  /** Download the template with concept codes. */
  exportTemplate() {
    const report = this.app.selectedReport();
    if (!report) return;
    const link = el('a', '');
    link.href = this.app.api.exportUrl(ReportsApplication.reference(report));
    link.download = '';
    document.body.append(link);
    link.click();
    link.remove();
  }

  /** Delete the selected report (and its template file). */
  async deleteReport() {
    const report = this.app.selectedReport();
    if (!report) return;
    const message = report.id == null
      ? `${$HR('Delete template file')} "${report.file}"?`
      : `${$HR('Delete report')} "${report.title}" ${$HR('and its template file')}?`;
    if (!(await confirmDialog(message, { yesLabel: 'Delete' }))) return;
    await this.closeEditor(true);
    await this.app.deleteReport(report);
  }

  /** Test run: the editor's text when the editor is open, else the saved template. */
  async test() {
    const report = this.app.selectedReport();
    if (!report || this.testing) return;
    this.testing = true;
    this.buttons.test.disabled = true;
    try {
      if (this.editor) {
        await this.editor.test();
        return;
      }
      const records = await this.app.testRecordIds(report);
      if (!records.ids.length) {
        HMsg.showMsgFlash($HR('Select records, or search for records first: the test runs on them.'), { showDelay: 3000 });
        return;
      }
      const started = this.app.startTest({ report: ReportsApplication.reference(report), ids: records.ids })
        .then((job) => { this.testJob = job; return job; });
      const job = await this.viewer.followJob(started);
      this.testJob = null;
      if (job.status === 'done') this.viewer.showUrl(this.app.testResultUrl(job));
    } finally {
      this.testing = false;
      this.update();
    }
  }

  /** Generate form, then follow the job; the output is shown when done. */
  async generate() {
    const report = this.app.selectedReport();
    if (!report) return;
    // one generation per user: a running one (also from before a page reload) is shown instead
    const running = (await this.app.activeJobs()).find((job) => job.type === 'report-generate');
    if (running) {
      await this.showRunningGeneration(running);
      return;
    }
    const params = await openGenerateForm(this.app, report);
    if (!params) return;
    if (!(await this.closeEditor())) return;
    let job;
    try {
      job = await this.app.startGenerate(params);
    } catch (error) {
      // started meanwhile in another tab
      const other = (await this.app.activeJobs().catch(() => [])).find((item) => item.type === 'report-generate');
      if (!other) throw error;
      await this.showRunningGeneration(other);
      return;
    }
    this.app.setGenerateJob(job);
  }

  /** Schedules of the selected report, or the new-schedule form when it has none. */
  async schedules() {
    const report = this.app.selectedReport();
    if (!report || report.id == null) return;
    if (!(report.schedules || []).length && report.canEdit) {
      const values = await openScheduleForm(this.app, report, null);
      if (!values) return;
      await this.app.addSchedule(report, values);
    }
    await openSchedulesDialog(this.app, this.app.findReport(ReportsApplication.reference(report)) || report);
  }

  /** Show output in the main area (closes the editor first). */
  async showOutput(show) {
    if (await this.closeEditor()) show();
  }

  /**
   * Open the template editor of a report in the main area.
   *
   * @param {object} report
   * @returns {Promise<void>}
   */
  async showEditor(report) {
    if (!report) return;
    await this.editor?.destroy();
    this.editor = null;
    this.editorHost.hidden = false;
    this.editorHost.replaceChildren();
    const host = el('div', 'h-reports-editor-frame', this.editorHost);
    el('div', 'h-reports-placeholder h-muted', host).textContent = $HR('Loading editor...');
    try {
      const { ReportEditorPanel } = await this.loadEditor();
      this.editor = new ReportEditorPanel().attach(host, {
        application: this.app,
        report,
        onClose: () => this.closeEditor()
      });
      await this.editor.load();
    } catch (error) {
      this.editor = null;
      HMsg.showMsgErr(error?.message || String(error));
      this.editorHost.hidden = true;
    }
    this.update();
  }

  /**
   * Close the editor and show the report information again.
   *
   * @param {boolean} [force=false] Close without asking about unsaved changes.
   * @returns {Promise<boolean>} False when the user kept the editor open.
   */
  async closeEditor(force = false) {
    if (!this.editor) return true;
    if (!force && !(await this.confirmLeaveEditor())) return false;
    await this.editor?.destroy();
    this.editor = null;
    this.editorHost.hidden = true;
    this.editorHost.replaceChildren();
    this.update();
    return true;
  }

  /** Whether the editor has unsaved changes. */
  hasUnsavedChanges() {
    return this.editor?.isModified?.() === true;
  }

  /** Ask before leaving an editor with unsaved changes; closes the editor. */
  async confirmLeaveEditor() {
    if (!this.editor) return true;
    if (this.hasUnsavedChanges()
      && !(await confirmDialog($HR('The template has unsaved changes. Close the editor without saving?'), { yesLabel: 'Close without saving' }))) {
      return false;
    }
    await this.editor.destroy();
    this.editor = null;
    this.editorHost.hidden = true;
    this.editorHost.replaceChildren();
    return true;
  }

  /** Run an action and show its error. */
  async run(action) {
    try {
      return await action();
    } catch (error) {
      HMsg.showMsgErr(error?.message || String(error));
      return null;
    }
  }

  /** Remove the view. */
  async destroy() {
    closePopover();
    // a test run is stopped with its page; a generation continues and is shown again on return
    if (this.testJob) this.app.jobs.cancel(this.testJob.id).catch(() => {});
    this.testJob = null;
    await this.editor?.destroy();
    this.editorHost?.remove();
    this.editorHost = null;
    await this.viewer?.destroy();
    await super.destroy();
  }
}

/** Create an element with a class, optionally appended to a parent. */
export function el(tag, className, parent = null) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  parent?.append(element);
  return element;
}
