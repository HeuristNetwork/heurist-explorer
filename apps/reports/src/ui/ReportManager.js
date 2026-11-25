/**
 * @file ReportManager.js
 * @brief Reports manager view (plan 27q3 §2, review 3): the List and the View of the reports in the pane, and their
 *        editor over the whole screen.
 *
 * One toolbar for the List and the View (the layout of the Crosstabs pane, 27q3 review 3):
 *
 *   New | Selector ▾ card|list | Edit  ‖  Show for ▾ | Test | Generate  ‖  Import | Export | Unregistered
 *
 * and on the header of the pane Help | View (List mode) or Help | List (View mode). The List shows HPresentationList
 * (the Presentation sets of kind Card Report and List Report, a `card` / `list` badge after the Edit icon, the pen =
 * Properties, the trash = Delete, the number of generated reports at the right) with the selected report on the right;
 * the List has no selector and Edit. The View is the same without the list (west pane hidden). Review 4: Show for, Test
 * and Generate (primary) are right aligned and shown for a list report only; the toolbar wraps. *Show for* (a list report
 * only) is Current result or a query source / saved filter without parameters (the one picker, chooseQuerySource);
 * Test and Generate take its records. Generate (a list report only) asks Name and Language, creates the generated report
 * in the background and runs its job. Without a header host (standalone) Help and the mode switch are at the right end
 * of the toolbar.
 *
 * The right side (the outputs panel of the List): a message row, then
 *   - nothing selected: "Select a report", or the template files without a record when there is no report yet;
 *   - Unregistered: the template files without a record (Register, Delete);
 *   - a card report: the output of the first selected record, or of the first record of the result, at once (it follows
 *     Explorer's selection);
 *   - a list report: the progress of its generation and its generated reports (search, sort by date or size); Test shows
 *     the test output (the only output that is not kept) until Close.
 * The template editor (ReportEditorPanel) covers the whole screen and is loaded only when it is first opened
 * (CodeMirror). With no report yet the List starts a new one (27q3 §2.2).
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
import {
  openFullScreenHost, renderHeaderActions, renderPresentationToolbar, togglePresentationList
} from '#shared/widgets/presentation/presentationShell.js';
import { chooseQuerySource } from '#shared/widgets/edit-form/querySourceChooser.js';
import { queryChoiceItems } from '#shared/data/queryChoices.js';
import { ReportsApplication } from '../core/ReportsApplication.js';
import { ReportViewer } from './ReportViewer.js';
import { createOutputsPanel } from './OutputsDialog.js';
import { confirmDialog } from './formDialog.js';
import { openEditFormDialog } from '#shared/widgets/edit-form/editFormDialog.js';
import { closePopover } from './popover.js';
import './ReportManager.css';

/** *Show for* Current result (the selection or the result of the host). */
const CURRENT = Object.freeze({ value: 'current', label: 'Current result' });

/** Session key of the *Show for* choice. */
const SHOW_FOR_KEY = 'heurist-reports-show-for';

/** The kinds of a new or imported report (27q3 review 4). */
const KIND_TERMS = Object.freeze([{ id: 'list', label: 'List (record set)' }, { id: 'card', label: 'Card (single record)' }]);

/** Delay of the card preview after a change of the host's selection or result (ms). */
const PREVIEW_DELAY = 300;

/** Reports manager view. */
export class ReportManager extends HBaseWidget {
  /**
   * @param {HTMLElement} container View host.
   * @param {object} options
   * @param {ReportsApplication} options.application Controller.
   * @param {HTMLElement|null} [options.headerActions] The buttons on the header of the host's pane (Help | List / View).
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
    // List (with the list of the reports) or View (the selected report only), 27q3 review 3; View first (review 4)
    this.mode = 'view';
    // the right side of a selected report: its outputs, a test output or a generated file; the unregistered files
    this.center = 'outputs';
    this.showUnregistered = false;
    this.showFor = readShowFor();
    // id of the generate job shown in the viewer; the test job this page started
    this.followingId = null;
    this.testJob = null;
    this.viewer = null;
    this.render();
    this.listen(this.app, 'listchange', () => void this.update());
    this.listen(this.app, 'jobchange', () => this.syncGenerateJob(this.app.selectedReport()));
    return this;
  }

  /** Build the layout: the setup notice (when the definitions are missing), the toolbar and the List. */
  render() {
    const root = el('div', 'h-reports');
    this.setupHost = el('div', 'h-reports-setup', root);
    this.toolbar = el('div', 'h-reports-pane-toolbar', root);
    this.toolbar.hidden = true;
    this.listHost = el('div', 'h-reports-list', root);
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
      this.toolbar.hidden = true;
      const viewer = new ReportViewer().attach(this.setupHost, { jobClient: this.app.jobs });
      viewer.showSetup({
        canSetup: this.app.data.canSetup === true,
        missing: this.app.data.missingDefinitions || [],
        onInstall: () => this.run(() => this.app.setup())
      });
      return;
    }
    this.setupHost.replaceChildren();
    this.toolbar.hidden = false;
    if (this.list) {
      if (!this._reloading) await this.list.reload();
      else this.renderToolbar();
      return;
    }
    await this.renderList();
  }

  /** The List of the reports (27q3 §2.1): no title bar, New | Help | View are on the toolbar and the header. */
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
      showBar: false,
      selectHint: 'Select a report',
      selectedId: this.app.selectedReport()?.id || null,
      canEdit: editable,
      onNew: editable ? () => void this.run(() => this.createReport()) : null,
      onEdit: (id) => void this.run(() => this.openEditor(id)),
      editRecord: editable ? (id) => this.app.editReport({ id }) : null,
      // card / list after the Edit icon (27q3 review 3)
      kindBadge: (record) => {
        const report = this.app.findReport(String(record?.rec_ID));
        return report ? kindWord(report) : '';
      },
      // the number of its generated reports at the right (27q3 review 4)
      rowCount: (record) => ReportsApplication.outputCountBadge(this.app.findReport(String(record?.rec_ID))),
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
    this.renderToolbar();
    await this.list.render();
    this.list.setListVisible?.(this.mode === 'list');
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

  // ------------------------------------------------------------------ toolbar and header

  /**
   * List or View (27q3 review 3): the View hides the list of the reports and shows the selector and Edit.
   *
   * @param {'list'|'view'} [mode] Default: the other one.
   */
  setMode(mode = this.mode === 'list' ? 'view' : 'list') {
    this.mode = mode === 'view' ? 'view' : 'list';
    this.list?.setListVisible?.(this.mode === 'list');
    this.renderToolbar();
  }

  /**
   * New | Selector | Edit ‖ Show for | Test | Generate ‖ Import | Export | Unregistered; Help and the mode switch on the
   * header of the pane. Slots that do not apply now keep their place (Show for does not move between List and View).
   */
  renderToolbar() {
    if (!this.toolbar) return;
    const report = this.app.selectedReport();
    const editable = this.app.host.canEditRecords();
    const listReport = Boolean(report && report.id != null && !report.isCardView);
    const runnable = Boolean(report && report.id != null && report.fileExists !== false);
    const listMode = this.mode === 'list';
    const reports = (this.app.data.reports || []).filter((item) => item.id != null);
    const unregistered = this.app.data.unregistered || [];
    const header = this.headerSpecs();
    // review 4: Show for, Test and Generate are right aligned and shown for a list report only; Generate is the primary
    // button here (Test in the editor); the List has no selector and Edit
    this.buttons = renderPresentationToolbar(this.toolbar, {
      new: editable ? { label: 'New report', title: 'New report', run: () => void this.run(() => this.createReport()) } : null,
      selector: listMode ? null : {
        icon: 'fa-file-lines', label: report?.title || $HR('Select a report'), title: 'Report', badge: report ? kindWord(report) : '',
        count: ReportsApplication.outputCountBadge(report),
        disabled: !reports.length,
        run: (anchor) => togglePresentationList(anchor, reports.map((item) => ({ id: item.id, title: item.title, count: ReportsApplication.outputCountBadge(item), note: $HR(kindWord(item)) })), {
          current: report?.id,
          onSelect: (item) => void this.list?.select(Number(item.id))
        })
      },
      edit: listMode ? null : {
        title: 'Open the report in the editor (full screen)', disabled: !report || report.id == null, run: () => void this.run(() => this.openEditor(report.id))
      },
      scope: listReport ? this.createShowFor() : null,
      refresh: listReport ? {
        icon: 'fa-flask', label: 'Test', caption: true, title: this.app.testTip(report), disabled: !runnable || this.testing,
        run: () => void this.run(() => this.test())
      } : null,
      generate: listReport ? {
        title: 'Write the report to a file in the background (a generated report)', primary: true, disabled: !runnable,
        run: () => void this.run(() => this.generate())
      } : null,
      tools: [
        editable ? { icon: 'fa-file-import', label: 'Import', title: 'Import a report template (.gpl or .tpl)', run: () => this.fileInput.click() } : null,
        { icon: 'fa-file-export', label: 'Export', title: 'Download the template with concept codes (.gpl), to import into another database', disabled: !runnable, run: () => this.exportTemplate() },
        unregistered.length ? {
          icon: 'fa-file-circle-question', label: 'Template files without a record', run: () => void this.toggleUnregistered()
        } : null,
        // standalone (no header of a pane): Help and the mode switch here
        ...(this.options.headerActions ? [] : header)
      ]
    });
    renderHeaderActions(this.options.headerActions || null, header);
  }

  /** @returns {Array<object|null>} Help and the mode switch (last). */
  headerSpecs() {
    return [
      this.app.host.canOpenManual?.() ? { icon: 'fa-circle-question', label: 'Help of the reports', run: () => this.app.host.openManual('reports') } : null,
      this.mode === 'list'
        ? { icon: 'fa-file-lines', label: 'Back to the report', run: () => this.setMode('view') }
        : { icon: 'fa-list-ul', label: 'List of the reports', run: () => this.setMode('list') }
    ];
  }

  /**
   * *Show for* of a list report (27q3 review 3): Current result first, then the query sources and saved filters without
   * parameters (the one picker). Used by the toolbar of the pane and by the editor.
   *
   * @param {function(): void} [onChange] After a new choice (the editor draws its toolbar again).
   * @returns {HTMLElement}
   */
  createShowFor(onChange = null) {
    const box = el('span', 'h-presentation-scope h-reports-show-for');
    el('span', 'h-presentation-scope-label', box).textContent = $HR('Show for');
    const button = el('button', 'h-btn h-presentation-selector h-reports-show-for-button', box);
    button.type = 'button';
    button.title = $HR('Records of the test and of a generated report: the current result, or a query source or saved filter');
    el('span', 'h-presentation-selector-label', button).textContent = this.showFor.value === CURRENT.value ? $HR(CURRENT.label) : this.showFor.label;
    el('span', 'h-caret', button).setAttribute('aria-hidden', 'true');
    button.addEventListener('click', () => void this.run(async () => {
      const choices = await this.app.queryChoicesForReports();
      const items = queryChoiceItems(choices, { parameters: 'without', first: [{ value: CURRENT.value, label: $HR(CURRENT.label) }] });
      const chosen = await chooseQuerySource(button, items, { value: this.showFor.value });
      if (!chosen) return;
      this.showFor = chosen.value === CURRENT.value ? { ...CURRENT } : { value: chosen.value, label: chosen.label, choice: chosen };
      storeShowFor(this.showFor);
      this.renderToolbar();
      onChange?.();
    }));
    return box;
  }

  /**
   * The query of *Show for*: undefined for Current result (the selection, else the result of the host).
   *
   * @returns {Promise<*>}
   */
  async showForQuery() {
    if (this.showFor.value === CURRENT.value || !this.showFor.choice) return undefined;
    return (await this.app.queryChoiceQuery(this.showFor.choice)) ?? null;
  }

  /** Unregistered: the template files without a record on the right, or the selected report again. */
  async toggleUnregistered() {
    this.showUnregistered = !this.showUnregistered;
    await this.list?.select(this.list.selectedId);
  }

  // ------------------------------------------------------------------ the selected report

  /**
   * The right side of the List: the message row, then the unregistered files, the card preview or the generated
   * reports / test output of a list report.
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
    this.center = 'outputs';
    // another report chosen: the report, not the unregistered files
    if ((Number(id) || null) !== this._detailsId) this.showUnregistered = false;
    this._detailsId = Number(id) || null;
    this.messageRow = el('div', 'h-reports-message', host);
    this.messageRow.hidden = true;
    await this.app.selectReport(id ? String(id) : null);
    const report = id ? this.app.findReport(String(id)) : null;
    this.renderToolbar();
    const registered = (this.app.data.reports || []).some((item) => item.id != null);
    if (this.showUnregistered || (!id && !registered)) {
      this.renderUnregistered(host);
      return;
    }
    if (!id) {
      this.setMessage('Select a report');
      return;
    }
    if (!report) {
      this.setMessage('The report is not available');
      return;
    }
    const box = el('div', 'h-reports-details', host);
    const viewerHost = el('div', 'h-reports-viewer-host', box);
    this.viewer = new ReportViewer().attach(viewerHost, { jobClient: this.app.jobs });
    this.viewer.setScriptsAllowed(this.app.scriptsAllowed());
    // no title, kind or description (27q3 review 3)
    this.viewer.clear();
    const runnable = report.fileExists !== false;
    if (!runnable) this.setMessage('The template file of this report does not exist.');
    if (report.isCardView) {
      if (runnable) this.setMessage('Card report shows either the first selected or the first record in result list');
      // a card report: the output of a record at once (27q3 §2.1)
      if (runnable) await this.previewCard(report);
      return;
    }
    // a list report: its generated reports (search, sort by date or size; no report column, no New Report)
    this.outputsHost = el('div', 'h-reports-outputs', box);
    const panel = await createOutputsPanel(this.app, report, {
      mode: 'list',
      template: true,
      onShow: (url) => this.showFile(url)
    });
    if (this.viewer === null) {
      panel.destroy();
      return;
    }
    this.outputsPanel = panel;
    this.outputsHost.append(panel.element);
    await panel.ready;
    this.setCenter('outputs');
    this.syncGenerateJob(report);
  }

  /**
   * The message row at the top of the right side (one message; `close`: an icon to go back to the generated reports).
   *
   * @param {string} text Resource key.
   * @param {{close?: Function, links?: Array<{icon: string, title: string, href: string, download?: boolean}>}} [options]
   */
  setMessage(text, { close = null, links = [] } = {}) {
    const row = this.messageRow;
    if (!row) return;
    row.replaceChildren();
    row.hidden = !text;
    if (!text) return;
    el('span', 'h-reports-message-text', row).textContent = $HR(text);
    for (const link of links) {
      const anchor = el('a', 'heurist-icon-button h-reports-icon', row);
      anchor.href = link.href;
      anchor.title = $HR(link.title);
      anchor.setAttribute('aria-label', anchor.title);
      if (link.download) anchor.download = '';
      else {
        anchor.target = '_blank';
        anchor.rel = 'noopener';
      }
      el('i', `fa-solid ${link.icon}`, anchor).setAttribute('aria-hidden', 'true');
    }
    if (close) iconButton(row, 'fa-solid fa-xmark', 'Close', () => close());
  }

  /**
   * A list report: its generated reports, or an output (test or file) instead of them.
   *
   * @param {'outputs'|'output'} center
   */
  setCenter(center) {
    this.center = center;
    if (this.outputsHost) this.outputsHost.hidden = center !== 'outputs';
    if (center === 'outputs') {
      this.viewer?.clear();
      this.setMessage('');
    }
  }

  /** A generated file of the list: shown instead of the list, Close goes back. */
  showFile(url) {
    if (!this.viewer) return;
    this.setCenter('output');
    this.setMessage('Generated report', {
      close: () => this.setCenter('outputs'),
      links: [{ icon: 'fa-up-right-from-square', title: 'Open in a new window', href: url }]
    });
    this.viewer.showUrl(url);
  }

  /** Card report: the first selected record, or the first record of the current result, in the viewer. */
  async previewCard(report) {
    const records = await this.app.testRecordIds(report).catch(() => ({ ids: [] }));
    if (records.ids.length) this.viewer?.showUrl(this.app.api.renderUrl(report.id, records.ids[0]));
    else this.setMessage('Select records, or search for records first: the test runs on them.');
  }

  /**
   * The host's selection or result changed: the preview of a card report follows it (debounced).
   *
   * @returns {void}
   */
  sourceChanged() {
    const report = this.app.selectedReport();
    if (!report?.isCardView || !this.viewer || report.fileExists === false) return;
    clearTimeout(this._previewTimer);
    this._previewTimer = setTimeout(() => {
      if (this.viewer && this.app.selectedReport() === report) {
        this.setMessage('Card report shows either the first selected or the first record in result list');
        void this.previewCard(report);
      }
    }, PREVIEW_DELAY);
  }

  /** Template files without a record: Register (the record editor) or Delete; Close shows the selected report again. */
  renderUnregistered(host) {
    const files = this.app.data.unregistered || [];
    const registered = (this.app.data.reports || []).some((item) => item.id != null);
    this.setMessage(files.length ? 'Template files without a record' : 'Select a report',
      { close: this.showUnregistered && registered ? () => void this.toggleUnregistered() : null });
    if (!files.length) return;
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
   * Follow a generate job until it ends (its progress above the generated reports); the list is read again.
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
    if (final?.status === 'done') HMsg.showMsgFlash($HR('The report file is ready'), { showDelay: 2500 });
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

  /** The kind of a new report: List Report (a record set) or Card Report (one record). */
  async askKind(title) {
    const answer = await askChoice($HR('Which kind of report?'), $HR(title), KIND_TERMS.map((term) => [term.id, $HR(term.label)]));
    return answer === 'list' || answer === 'card' ? answer : null;
  }

  /**
   * New report (27q3 review 4): a small popup with its Name, then its kind; the record is created in the background
   * (public, no record editor) and the template editor opens.
   */
  async createReport() {
    if (!(await this.ensureInstalled())) return;
    // one small popup: Name and Kind (radio group), the form dialog of the Publish popups (review 4 items 14, 17)
    const answer = await openEditFormDialog({
      title: 'New report',
      className: 'h-reports-generate-dialog',
      form: { groups: [{ id: 'report', children: [
        { name: 'name', type: 'freetext', label: 'Name', max: 1, required: true },
        { name: 'kind', type: 'enum', label: 'Kind', max: 1, mode: 'radio', required: true, terms: KIND_TERMS }
      ] }] },
      values: { name: '', kind: 'list' },
      buttons: [{ id: 'create', label: 'Create', primary: true }, { id: 'cancel', label: 'Cancel' }]
    });
    const first = (value) => String([value].flat()[0] ?? '').trim();
    const name = first(answer?.values?.name);
    const kind = first(answer?.values?.kind) === 'card' ? 'card' : 'list';
    if (!name) return;
    const created = await this.app.createReport(kind, name);
    await this.list?.reload();
    await this.list?.select(Number(created.id));
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

  /**
   * Test of the saved template on the records of *Show for*: a card report shows its record again; a list report
   * shows the test output (the only output that is not kept) instead of its generated reports until Close.
   *
   * @returns {Promise<void>}
   */
  async test() {
    const report = this.app.selectedReport();
    if (!report || this.testing || !this.viewer) return;
    if (report.isCardView) {
      await this.previewCard(report);
      return;
    }
    this.testing = true;
    if (this.buttons?.refresh) this.buttons.refresh.disabled = true;
    try {
      const records = await this.app.testRecordIds(report, await this.showForQuery());
      if (!records.ids.length) {
        HMsg.showMsgFlash($HR('Select records, or search for records first: the test runs on them.'), { showDelay: 3000 });
        return;
      }
      this.setCenter('output');
      const limit = String(ReportsApplication.testLimit(report, this.app.data.settings));
      this.setMessage($HR('Test output is limited with 50 records').replace('50', limit), { close: () => this.setCenter('outputs') });
      const started = this.app.startTest({ report: ReportsApplication.reference(report), ids: records.ids })
        .then((job) => { this.testJob = job; return job; });
      const job = await this.viewer.followJob(started);
      this.testJob = null;
      if (job.status === 'done' && this.viewer && this.center === 'output') {
        const url = this.app.testResultUrl(job);
        this.setMessage($HR('Test output is limited with 50 records').replace('50', limit), {
          close: () => this.setCenter('outputs'),
          links: [
            { icon: 'fa-up-right-from-square', title: 'Open in a new window', href: url },
            { icon: 'fa-download', title: 'Download', href: url, download: true }
          ]
        });
        this.viewer.showUrl(url);
      }
    } finally {
      this.testing = false;
      if (this.buttons?.refresh) this.buttons.refresh.disabled = false;
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

  /**
   * Generate (a list report, 27q3 review 3): a popup with Name and Language; the generated report is created in the
   * background with the query of *Show for*, its job runs and the list shows it.
   *
   * @returns {Promise<void>}
   */
  async generate() {
    const report = this.app.selectedReport();
    // one generation per user: a running one is shown first
    if (!report || report.id == null || await this.showActiveGeneration() || report.isCardView) return;
    const chosen = await this.showForQuery();
    const query = chosen !== undefined ? chosen : (await this.app.host.getCurrentQuery())?.query ?? null;
    if (query == null) {
      HMsg.showMsgFlash($HR('Search for records first: the report is generated for them.'), { showDelay: 3000 });
      return;
    }
    const languages = await this.app.outputLanguages().catch(() => []);
    // the form dialog of the Publish popups of the modules (HEditForm, 27q3 review 4 item 14)
    const answer = await openEditFormDialog({
      title: 'Generate report',
      className: 'h-reports-generate-dialog',
      form: {
        groups: [{
          id: 'output',
          children: [
            { name: 'name', type: 'freetext', label: 'Name', max: 1, required: true },
            {
              name: 'language', type: 'enum', label: 'Language', max: 1,
              terms: [{ id: '0', label: $HR('Default language') }, ...languages.map((item) => ({ id: String(item.value), label: item.label }))]
            }
          ]
        }]
      },
      values: { name: report.title, language: '0' },
      buttons: [{ id: 'generate', label: 'Generate', primary: true }, { id: 'cancel', label: 'Cancel' }]
    });
    if (!answer) return;
    const value = (item) => String([item].flat()[0] ?? '').trim();
    const name = value(answer.values.name) || report.title;
    const output = await this.app.createOutput(report, { name, language: Number(value(answer.values.language)) || 0, query });
    await this.runOutput(output);
  }

  /**
   * Generate an output. The job is followed above the generated reports.
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
      const editable = this.app.host.canEditRecords();
      this.editor = new ReportEditorPanel().attach(host, {
        application: this.app,
        report,
        onClose: () => void this.run(() => this.closeEditor()),
        // the common toolbar of the editor (27q3 §3, review 3)
        onNew: editable ? () => void this.run(() => this.newFromEditor()) : null,
        onOpen: (id) => void this.run(() => this.switchEditor(id)),
        onProperties: editable ? () => this.run(() => this.app.editReport(report)) : null,
        onImport: editable ? () => this.fileInput.click() : null,
        onExport: () => this.exportTemplate(),
        onHelp: this.app.host.canOpenManual?.() ? () => this.app.host.openManual('reports') : null,
        // Show for of a list report, the same choice as the pane
        createShowFor: (onChange) => this.createShowFor(onChange),
        testQuery: () => this.showForQuery()
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
    clearTimeout(this._previewTimer);
    // a test run is stopped with its page; a generation continues and is shown again on return
    if (this.testJob) this.app.jobs.cancel(this.testJob.id).catch(() => {});
    this.testJob = null;
    this.outputsPanel?.destroy();
    this.outputsPanel = null;
    await this.editor?.destroy();
    this.editorHost?.remove();
    this.editorHost = null;
    await this.viewer?.destroy();
    this.viewer = null;
    renderHeaderActions(this.options.headerActions || null, []);
    await this.list?.destroy();
    this.list = null;
    await super.destroy();
  }
}

/** `card` or `list`: the kind of a report in a badge. */
function kindWord(report) {
  return report?.isCardView ? 'card' : 'list';
}

/** The *Show for* choice of this session (Current result without one). */
function readShowFor() {
  try {
    const stored = JSON.parse(globalThis.sessionStorage?.getItem(SHOW_FOR_KEY) || 'null');
    if (stored?.value && stored.value !== CURRENT.value && stored.choice) return stored;
  } catch {
    // not stored
  }
  return { ...CURRENT };
}

/** Keep the *Show for* choice for this session. */
function storeShowFor(value) {
  try {
    globalThis.sessionStorage?.setItem(SHOW_FOR_KEY, JSON.stringify(value));
  } catch {
    // not kept
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
