/**
 * @file ReportManager.js
 * @brief Reports manager view (plan 27q3 §2): the List of the reports, and their editor over the whole screen.
 *
 * The pane opens the List at once (a report has no viewer): HPresentationList of the Presentation sets of kind Card
 * Report and List Report, with New and Import; a row opens the Editor (leftmost icon), Properties (the record editor) and
 * Delete. The right side shows the selected report: Test | Generate | ⋯ Export (the common toolbar,
 * presentationShell.js), then
 *   - a List Report: its generated reports (createOutputsPanel: generate, edit, delete, open, download; was a popup);
 *   - a Card Report: the preview of the first selected record, or of the first record of the current result;
 *   - the output of a test or a generated file (ReportViewer).
 * Without a selection it lists the template files without a record (Register, Delete). The template editor
 * (ReportEditorPanel) covers the whole screen and is loaded only when it is first opened (CodeMirror). With no report
 * yet the List starts a new one (27q3 §2.2).
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
import { askChoice, askSaveDiscard } from '#shared/ui/askChoice.js';
import { HPresentationList } from '#shared/widgets/presentation/HPresentationList.js';
import { openFullScreenHost, renderPresentationToolbar } from '#shared/widgets/presentation/presentationShell.js';
import { ReportsApplication } from '../core/ReportsApplication.js';
import { ReportViewer } from './ReportViewer.js';
import { createOutputsPanel, openOutputsDialog } from './OutputsDialog.js';
import { confirmDialog } from './formDialog.js';
import { closePopover } from './popover.js';
import './ReportManager.css';

/** Reports manager view. */
export class ReportManager extends HBaseWidget {
  /**
   * @param {HTMLElement} container View host.
   * @param {object} options
   * @param {ReportsApplication} options.application Controller.
   * @param {Function} [options.loadEditor] Loads the editor module (lazy import); for tests.
   * @param {Function} [options.createList] Creates the List (HPresentationList); for tests.
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
    this.viewer = null;
    this.render();
    this.listen(this.app, 'listchange', () => void this.update());
    this.listen(this.app, 'jobchange', () => this.syncGenerateJob(this.app.selectedReport()));
    return this;
  }

  /** Build the layout: the setup notice (when the definitions are missing) and the List. */
  render() {
    const root = el('div', 'h-reports');
    this.setupHost = el('div', 'h-reports-setup', root);
    this.listHost = el('div', 'h-reports-list', root);
    // the database may not run JavaScript/CSS blocks in reports (server setting)
    this.jsWarning = el('div', 'h-reports-js-warning');
    this.jsWarning.title = $HR('CSS and Javascript are disabled by default. Request authorisation from server admin if required');
    el('i', 'fa-solid fa-triangle-exclamation', this.jsWarning).setAttribute('aria-hidden', 'true');
    el('span', 'h-reports-js-warning-text', this.jsWarning).textContent = this.jsWarning.title;
    this.fileInput = el('input', 'h-hidden', root);
    this.fileInput.type = 'file';
    this.fileInput.accept = '.gpl,.tpl';
    this.listen(this.fileInput, 'change', () => {
      const file = this.fileInput.files?.[0];
      this.fileInput.value = '';
      if (file) void this.run(() => this.importFile(file));
    });
    // the template editor: a modal layer over the whole screen (27q3 §2.3)
    this.editorHost?.remove();
    this.editorHost = openFullScreenHost('h-reports-editor-host');
    this.editorHost.hidden = true;
    this.container.replaceChildren(root);
    void this.update();
  }

  /** The setup notice or the List, after the list of the application changed. */
  async update() {
    const installed = this.app.data.installed;
    if (installed === null) return;
    this.setupHost.hidden = installed !== false;
    if (installed === false) {
      const viewer = new ReportViewer().attach(this.setupHost, { jobClient: this.app.jobs });
      viewer.showSetup({
        canSetup: this.app.data.canSetup === true,
        missing: this.app.data.missingDefinitions || [],
        onInstall: () => this.run(() => this.app.setup())
      });
      return;
    }
    this.setupHost.replaceChildren();
    if (this.list) {
      if (!this._reloading) await this.list.reload();
      return;
    }
    await this.renderList();
  }

  /** The List of the reports (27q3 §2.1). */
  async renderList() {
    const dbdefs = await this.app.loadDbDefs().catch(() => null);
    const editable = this.app.host.canEditRecords();
    const create = this.options.createList || (() => new HPresentationList());
    this.list = create().attach(this.listHost, {
      apiClient: this.app.api.apiClient,
      dbdefs,
      kinds: ['listreport', 'cardreport'],
      title: 'Reports',
      newLabel: 'New report',
      selectedId: this.app.selectedReport()?.id || null,
      canEdit: editable,
      onNew: editable ? () => void this.run(() => this.createReport()) : null,
      barTools: [{ icon: 'fa-file-import', label: 'Import', title: 'Import a report template (.gpl or .tpl)', run: () => this.fileInput.click() }],
      onEdit: (id) => void this.run(() => this.openEditor(id)),
      editRecord: editable ? (id) => this.app.editReport({ id }) : null,
      describeUse: async (id) => {
        const report = this.app.findReport(String(id));
        return Number(report?.outputCount) > 0
          ? `!${$HR('This template has generated reports: delete them first')} (${report.outputCount})` : '';
      },
      onDeleted: () => void this.refreshQuietly(),
      // no report yet: a new one at once (27q3 §2.2)
      onEmpty: editable && !this.app.allReports().length ? () => void this.run(() => this.createReport()) : null,
      renderOutputs: (id, host) => this.renderDetails(id, host),
      baseUrl: this.app.config.baseUrl,
      database: this.app.config.database
    });
    await this.list.render();
  }

  /** The list of the application again, without reloading the List (it reloads itself). */
  async refreshQuietly() {
    this._reloading = true;
    try {
      await this.app.refresh();
    } finally {
      this._reloading = false;
    }
  }

  // ------------------------------------------------------------------ details of the selected report

  /**
   * The right side of the List: the selected report (Test | Generate | ⋯), its generated reports or its preview, and
   * the output; without a selection the template files without a record.
   *
   * @param {number|null} id
   * @param {HTMLElement} host
   * @returns {Promise<void>}
   */
  async renderDetails(id, host) {
    this.outputsPanel?.destroy();
    this.outputsPanel = null;
    this.followingId = null;
    await this.viewer?.destroy();
    this.viewer = null;
    host.replaceChildren();
    if (!id) {
      await this.app.selectReport(null);
      this.renderUnregistered(host);
      return;
    }
    await this.app.selectReport(String(id));
    const report = this.app.findReport(String(id));
    if (!report) {
      el('p', 'h-muted', host).textContent = $HR('The report is not available');
      return;
    }
    const box = el('div', 'h-reports-details', host);
    const title = el('div', 'h-reports-details-title', box);
    title.textContent = report.title;
    el('span', 'h-reports-kind', title).textContent = $HR(report.isCardView ? 'Single record (card)' : 'Record set');
    const runnable = report.fileExists !== false;
    const bar = el('div', '', box);
    this.detailButtons = renderPresentationToolbar(bar, {
      refresh: { icon: 'fa-flask', label: 'Test', title: this.app.testTip(report), primary: true, disabled: !runnable || this.testing, run: () => void this.run(() => this.test()) },
      generate: report.isCardView ? null : { title: 'Write the report to a file in the background (a generated report)', disabled: !runnable, run: () => void this.run(() => this.generate()) },
      more: [
        { icon: 'fa-pen-ruler', label: 'Edit the template', run: () => void this.run(() => this.openEditor(report.id)) },
        { icon: 'fa-file-export', label: 'Export', title: 'Download the template with concept codes (.gpl), to import into another database', disabled: !runnable, run: () => this.exportTemplate() }
      ]
    });
    this.jsWarning.hidden = !this.app.data.settings || this.app.scriptsAllowed();
    box.append(this.jsWarning);
    if (!report.isCardView) {
      // the generated reports of this template (was the popup of Generate, 27q3 §2.1)
      const panel = await createOutputsPanel(this.app, report, {
        mode: 'list',
        onShow: (url) => this.viewer?.showUrl(url),
        onGenerate: (output) => this.runOutput(output)
      });
      this.outputsPanel = panel;
      box.append(panel.element);
      await panel.ready;
    }
    const viewerHost = el('div', 'h-reports-viewer-host', box);
    this.viewer = new ReportViewer().attach(viewerHost, { jobClient: this.app.jobs });
    this.viewer.setScriptsAllowed(this.app.scriptsAllowed());
    this.viewer.showReport(report);
    // a card report: the preview of a record at once (27q3 §2.1)
    if (report.isCardView && runnable) await this.previewCard(report);
    this.syncGenerateJob(report);
  }

  /** Card report: the first selected record, or the first record of the current result, in the viewer. */
  async previewCard(report) {
    const records = await this.app.testRecordIds(report).catch(() => ({ ids: [] }));
    if (records.ids.length) this.viewer?.showUrl(this.app.api.renderUrl(report.id, records.ids[0]));
  }

  /** Template files without a record: Register (the record editor) or Delete. */
  renderUnregistered(host) {
    const files = this.app.data.unregistered || [];
    el('p', 'h-muted', host).textContent = $HR('Select a report of the list');
    if (!files.length) return;
    el('div', 'h-reports-details-title', host).textContent = $HR('Template files without a record');
    const list = el('ul', 'h-reports-unregistered', host);
    for (const file of files) {
      const item = el('li', '', list);
      el('span', '', item).textContent = file.file;
      if (this.app.host.canEditRecords()) {
        iconButton(item, 'fa-solid fa-pen', 'Register: create the report record of this template', () => this.run(() => this.app.registerReport(file)));
      }
      iconButton(item, 'fa-solid fa-trash', 'Delete the template file', () => this.run(() => this.deleteFile(file)));
    }
  }

  /**
   * The running generation is followed while its report is shown; for another
   * report its progress is hidden (the job continues) and comes back when its
   * report is selected again.
   *
   * @param {object|null} report Shown report.
   */
  syncGenerateJob(report) {
    if (!this.viewer) return;
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
      const ended = await this.app.jobs.wait(job).catch(() => null);
      if (this.followingId === job.id) this.followingId = null;
      if (this.app.generateJob?.id === job.id) this.app.setGenerateJob(null);
      if (ended?.status === 'done') HMsg.showMsgFlash($HR('The report file is ready'), { showDelay: 2500 });
      return;
    }
    if (this.followingId !== job.id) return;
    this.followingId = null;
    if (this.app.generateJob?.id === job.id) this.app.setGenerateJob(null);
    if (final.status === 'done' && final.result?.outputId && ['html', 'txt', 'xml', 'json', 'csv'].includes(final.result.format)) {
      this.viewer?.showUrl(this.app.api.outputUrl(final.result.outputId));
    }
    await this.list?.select(this.list.selectedId);
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
    if (report && this.list) await this.list.select(report.id);
    HMsg.showMsgFlash($HR('A report is still being generated. Wait for it to finish, or stop it.'), { showDelay: 3500 });
  }

  /**
   * Make sure the report definitions exist before a record is created: a manager
   * is asked to install them, other users are told to ask the database owner.
   *
   * @returns {Promise<boolean>} True when the definitions are installed.
   */
  async ensureInstalled() {
    if (this.app.data.installed !== false) return true;
    if (!this.app.data.canSetup) {
      HMsg.showMsgErr(`${$HR('In order to work with the new report system you need to install the new record types (Report template, Report output).')} ${$HR('Ask the database owner to install them.')}`);
      return false;
    }
    if (!(await confirmDialog(`${$HR('In order to work with the new report system you need to install the new record types (Report template, Report output).')} ${$HR('Install them now?')}`, { yesLabel: 'Install' }))) {
      return false;
    }
    await this.app.setup();
    return this.app.data.installed !== false;
  }

  /**
   * The generated reports of the selected report in New mode (a new one with its query).
   *
   * @returns {Promise<void>}
   */
  async outputs() {
    const report = this.app.selectedReport();
    if (!report) return;
    await openOutputsDialog(this.app, report, {
      mode: 'new',
      onShow: (url) => this.viewer?.showUrl(url),
      onGenerate: (output) => this.runOutput(output)
    });
  }

  /** The kind of a new report: List Report (a record set) or Card Report (one record). */
  async askKind(title) {
    const answer = await askChoice($HR('Which kind of report?'), $HR(title), [
      ['list', $HR('Report of a record set')], ['card', $HR('Single record (card) report')]
    ]);
    return answer === 'list' || answer === 'card' ? answer : null;
  }

  /** New report: its kind, the record editor, then the template editor. */
  async createReport() {
    if (!(await this.ensureInstalled())) return;
    const kind = await this.askKind('New report');
    if (!kind) return;
    const created = await this.app.newReport(kind);
    if (!created) return;
    await this.list?.reload();
    await this.list?.select(created.id);
    await this.showEditor(this.app.findReport(ReportsApplication.reference(created)) || created);
  }

  /** Import a template file as a report of the chosen kind. */
  async importFile(file) {
    const kind = await this.askKind('Import');
    if (!kind) return;
    const report = await this.app.importFile(file, kind);
    if (report?.id) await this.list?.select(Number(report.id));
  }

  /** Open the template editor of a report. */
  async openEditor(id) {
    if (!(await this.app.selectReport(String(id)))) return;
    await this.showEditor(this.app.findReport(String(id)));
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

  /** Delete a template file without a record. */
  async deleteFile(file) {
    if (!(await confirmDialog(`${$HR('Delete template file')} "${file.file}"?`, { yesLabel: 'Delete' }))) return;
    await this.app.deleteReport(file);
  }

  /** Test run: the editor's text when the editor is open, else the saved template. */
  async test() {
    const report = this.app.selectedReport();
    if (!report || this.testing) return;
    this.testing = true;
    if (this.detailButtons?.refresh) this.detailButtons.refresh.disabled = true;
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
      if (job.status === 'done') this.viewer?.showUrl(this.app.testResultUrl(job));
    } finally {
      this.testing = false;
      if (this.detailButtons?.refresh) this.detailButtons.refresh.disabled = false;
    }
  }

  /**
   * One generation per user: a running one (also from before a page reload) is shown instead.
   *
   * @returns {Promise<boolean>} True when a generation is running.
   */
  async showActiveGeneration() {
    const running = (await this.app.activeJobs()).find((job) => job.type === 'report-generate');
    if (running) await this.showRunningGeneration(running);
    return Boolean(running);
  }

  /** Generate: the Generated reports dialog in New mode (the editor is saved first, 27q3 §3.2). */
  async generate() {
    if (!this.app.selectedReport() || await this.showActiveGeneration()) return;
    if (this.editor?.isModified?.()) await this.editor.save();
    await this.outputs();
  }

  /**
   * Generate an output. The job is followed and the file is shown when done.
   *
   * @param {{id: number}} output The output record.
   * @returns {Promise<void>}
   */
  async runOutput(output) {
    if (await this.showActiveGeneration()) return;
    if (!(await this.closeEditor())) return;
    let job;
    try {
      job = await this.app.startGenerate(output);
    } catch (error) {
      // started meanwhile in another tab
      const other = (await this.app.activeJobs().catch(() => [])).find((item) => item.type === 'report-generate');
      if (!other) throw error;
      await this.showRunningGeneration(other);
      return;
    }
    this.app.setGenerateJob(job);
  }

  /**
   * Open the template editor of a report over the whole screen.
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
        onClose: () => void this.run(() => this.closeEditor()),
        // the common toolbar of the editor (27q3 §3)
        onNew: this.app.host.canEditRecords() ? () => void this.run(() => this.newFromEditor()) : null,
        onOpen: (id) => void this.run(() => this.switchEditor(id)),
        onProperties: this.app.host.canEditRecords() ? () => this.run(() => this.app.editReport(report)) : null,
        onGenerate: () => void this.run(() => this.generate()),
        onExport: () => this.exportTemplate()
      });
      await this.editor.load();
    } catch (error) {
      this.editor = null;
      HMsg.showMsgErr(error?.message || String(error));
      this.editorHost.hidden = true;
    }
  }

  /** Editor: another report of the selector (unsaved changes asked first). */
  async switchEditor(id) {
    if (!(await this.confirmLeaveEditor())) return;
    await this.list?.select(Number(id));
    await this.showEditor(this.app.findReport(String(id)));
  }

  /** Editor: New (unsaved changes asked first). */
  async newFromEditor() {
    if (!(await this.confirmLeaveEditor())) return;
    await this.createReport();
  }

  /**
   * Close the editor and show the List again.
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
    await this.list?.select(this.list.selectedId);
    return true;
  }

  /** Whether the editor has unsaved changes. */
  hasUnsavedChanges() {
    return this.editor?.isModified?.() === true;
  }

  /** Ask before leaving an editor with unsaved changes (Save | Discard | Cancel, 27q3 §3.2); closes the editor. */
  async confirmLeaveEditor() {
    if (!this.editor) return true;
    if (this.hasUnsavedChanges()) {
      const answer = await askSaveDiscard($HR('The template has unsaved changes. Save changes?'));
      if (answer === 'save') await this.editor.save();
      else if (answer !== 'discard') return false;
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
    this.outputsPanel?.destroy();
    this.outputsPanel = null;
    await this.editor?.destroy();
    this.editorHost?.remove();
    this.editorHost = null;
    await this.viewer?.destroy();
    await this.list?.destroy();
    this.list = null;
    await super.destroy();
  }
}

/** An icon button. */
function iconButton(parent, icon, title, run) {
  const button = el('button', 'heurist-icon-button', parent);
  button.type = 'button';
  button.title = $HR(title);
  button.setAttribute('aria-label', button.title);
  el('i', icon, button).setAttribute('aria-hidden', 'true');
  button.addEventListener('click', () => run());
  return button;
}

/** Create an element with a class, optionally appended to a parent. */
export function el(tag, className, parent = null) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  parent?.append(element);
  return element;
}
