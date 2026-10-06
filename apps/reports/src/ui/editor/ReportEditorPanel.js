/**
 * @file ReportEditorPanel.js
 * @brief Template editor of the reports manager, shown over the whole screen in
 *        three panes (HCardinalLayout): west - patterns and fields to add,
 *        center - Smarty text (HSmartyEditor) with Save / Save As / Close,
 *        east - test area (error level, Test, output). West and east fold to a
 *        narrow strip with a vertical title.
 *
 * Fields are marked in the tree (several at once, "Select all visible options")
 * and added with "Add Selected Fields": one dialog goes through the marked
 * fields with the insert options and Insert field / Insert all / Skip / Cancel
 * (insertFieldsDialog.js; port of the legacy reportEditor._insertFields,
 * _insertFieldStart and _insertSelectedVars).
 *
 * Loaded by ReportManager with a dynamic import, so CodeMirror is in a chunk of
 * its own that is fetched only when a template is opened.
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
import { HSmartyEditor } from '#shared/smarty/HSmartyEditor.js';
import { SMARTY_PATTERNS } from '#shared/smarty/smartyPatterns.js';
import {
  DEFAULT_SNIPPET_OPTIONS, branchKey, buildFieldSnippet, buildGroupedSnippet, segmentsFromPath
} from '#shared/smarty/smartySnippetBuilder.js';
import { HFieldTree } from '#shared/widgets/field-tree/HFieldTree.js';
import { HCardinalLayout } from '#shared/widgets/layout/HCardinalLayout.js';
import { ReportsApplication } from '../../core/ReportsApplication.js';
import { openFormDialog, FILE_NAME_CHARS } from '../formDialog.js';
import { openInsertFieldsDialog } from './insertFieldsDialog.js';
import { ReportViewer } from '../ReportViewer.js';
import './ReportEditorPanel.css';

/** Header leaves of the tree and their captions. */
const HEADER_LABELS = { title: 'Title', ids: 'ID', url: 'URL', added: 'Added', modified: 'Modified', addedby: 'Creator', owner: 'Owner', access: 'Visibility' };

/** Captions of enum outputs and relationship properties (tree leaves). */
const LEAF_LABELS = {
  term: 'Term', code: 'Code', conceptid: 'Concept ID', desc: 'Description', internalid: 'Internal ID', label: 'Label',
  recRelationType: 'Relation Type', recRelationNotes: 'Relation Notes',
  recRelationStartDate: 'Relation StartDate', recRelationEndDate: 'Relation EndDate'
};

/** Width of a folded side pane. */
const COLLAPSED_SIZE = 40;

const OPTIONS_STORAGE_KEY = 'heurist-reports-insert-options';

/** Template editor: three panes over the whole screen. */
export class ReportEditorPanel extends HBaseWidget {
  /**
   * @param {HTMLElement} container Host (shown over the whole screen by the manager).
   * @param {object} options
   * @param {ReportsApplication} options.application Controller.
   * @param {object} options.report Report to edit.
   * @param {function(): void} options.onClose Called by the Close button.
   * @returns {ReportEditorPanel}
   */
  attach(container, options = {}) {
    super.attach(container, options);
    this.app = options.application;
    this.report = options.report;
    this.readOnly = this.report.canEdit !== true;
    this.insertOptions = readInsertOptions();
    this.editor = null;
    this.tree = null;
    this.output = null;
    this.dbdefs = null;
    this.layout = null;
    this.panes = {};
    this.testJob = null;
    this.render();
    return this;
  }

  /** Build the three panes. */
  render() {
    const root = el('div', 'h-reports-editor');
    this.container.replaceChildren(root);
    const width = root.getBoundingClientRect?.().width || globalThis.innerWidth || 1200;
    this.layout = new HCardinalLayout(root, {
      westSize: 340,
      eastSize: Math.max(320, Math.round(width * 0.35)),
      minWest: 240,
      minEast: 260,
      collapsedSize: COLLAPSED_SIZE
    });
    this.layout.show('east');
    this.layout.addEventListener('regioncollapsechange', (event) => this.updatePane(event.detail.region));

    this.renderWest(this.pane('west', 'Insert Patterns/Variable'));
    this.renderCenter();
    this.renderEast(this.pane('east', 'Test Area'));
    // the test area opens with the first test
    this.layout.collapse('east');
  }

  /**
   * A side pane: header with the fold button and title, tools, body.
   *
   * @param {'west'|'east'} region Layout region.
   * @param {string} title Pane title (resource key).
   * @returns {{root: HTMLElement, header: HTMLElement, tools: HTMLElement, body: HTMLElement}}
   */
  pane(region, title) {
    const root = el('section', `h-reports-editor-pane h-reports-editor-${region}`);
    const header = el('div', 'heurist-source-header h-reports-editor-pane-header', root);
    const toggle = el('button', 'heurist-icon-button h-reports-editor-pane-toggle');
    toggle.type = 'button';
    el('i', '', toggle).setAttribute('aria-hidden', 'true');
    this.listen(toggle, 'click', () => this.layout.toggle(region));
    const caption = el('span', 'h-reports-editor-pane-title');
    caption.textContent = $HR(title);
    const tools = el('span', 'h-reports-editor-pane-tools');
    // west: title then <<; east: >> then title and tools
    if (region === 'west') header.append(caption, tools, toggle);
    else header.append(toggle, caption, tools);
    const body = el('div', 'h-reports-editor-pane-body', root);
    this.layout.setContent(region, root);
    this.panes[region] = { root, header, tools, body, toggle };
    this.updatePane(region);
    return this.panes[region];
  }

  /** Folded or open state of a side pane: class, toggle icon and tip. */
  updatePane(region) {
    const pane = this.panes[region];
    if (!pane) return;
    const collapsed = this.layout.getState()[region].collapsed === true;
    pane.root.classList.toggle('is-collapsed', collapsed);
    // the arrows point where the pane moves: << folds west, >> folds east
    const left = region === 'west' ? !collapsed : collapsed;
    pane.toggle.firstChild.className = `fa-solid ${left ? 'fa-angles-left' : 'fa-angles-right'}`;
    pane.toggle.title = $HR(collapsed ? 'Show the pane' : 'Hide the pane');
    pane.toggle.setAttribute('aria-label', pane.toggle.title);
    pane.toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  }

  /** West: patterns, record type, "Add Selected Fields" and the field tree. */
  renderWest({ body }) {
    const patternRow = el('label', 'h-reports-editor-row', body);
    el('span', 'h-muted', patternRow).textContent = $HR('Patterns');
    const patterns = el('select', 'h-select h-reports-editor-patterns', patternRow);
    patterns.title = $HR('Insert a pattern at the cursor');
    patterns.append(option($HR('Insert pattern...'), ''));
    for (const pattern of SMARTY_PATTERNS) patterns.append(option($HR(pattern.label), pattern.id));
    patterns.disabled = this.readOnly;
    this.listen(patterns, 'change', () => {
      const pattern = SMARTY_PATTERNS.find((item) => item.id === patterns.value);
      patterns.value = '';
      if (pattern) this.editor?.insertAtCursor(pattern.text);
    });

    el('div', 'h-reports-editor-section', body).textContent = $HR('Add fields');
    const typeRow = el('label', 'h-reports-editor-row', body);
    el('span', 'h-muted', typeRow).textContent = $HR('Record type');
    this.rectypeSelect = el('select', 'h-select', typeRow);
    this.rectypeSelect.append(option($HR('Loading...'), ''));
    this.listen(this.rectypeSelect, 'change', () => {
      this.tree?.setRecordType(this.rectypeSelect.value);
      this.tree?.clearSelection();
      storeRectype(this.rectypeSelect.value);
    });

    const add = el('button', 'h-btn h-btn-primary h-reports-editor-add', body);
    add.type = 'button';
    add.title = $HR('Place the cursor in the template, mark fields in the tree, then add them');
    el('span', 'h-reports-editor-add-label', add).textContent = $HR('Add Selected Fields');
    el('i', 'fa-solid fa-hand-point-right', add).setAttribute('aria-hidden', 'true');
    add.disabled = true;
    this.listen(add, 'click', () => this.run(() => this.addSelectedFields()));
    this.addButton = add;
    this.treeHost = el('div', 'h-reports-editor-tree', body);
  }

  /** Center: "Edit: <name>", Save / Save As / Close, the Smarty text. */
  renderCenter() {
    const root = el('section', 'h-reports-editor-pane h-reports-editor-center');
    const header = el('div', 'heurist-source-header h-reports-editor-pane-header', root);
    const title = el('span', 'h-reports-editor-pane-title h-reports-editor-title', header);
    title.textContent = `${$HR('Edit')}: ${this.report.title}`;
    title.title = this.report.file || this.report.title;
    this.modifiedMark = el('span', 'h-reports-editor-modified', header);
    this.modifiedMark.textContent = '*';
    this.modifiedMark.hidden = true;
    this.modifiedMark.title = $HR('Unsaved changes');
    if (this.readOnly) el('span', 'h-reports-kind', header).textContent = $HR('read only');
    const tools = el('span', 'h-reports-editor-pane-tools h-reports-editor-center-tools', header);
    this.saveButton = this.button(tools, 'h-btn h-btn-primary', 'fa-solid fa-floppy-disk', 'Save', () => this.save(), 'Save the template (Ctrl+S)');
    this.saveButton.disabled = this.readOnly;
    this.button(tools, 'h-btn', 'fa-solid fa-copy', 'Save As', () => this.saveAs(), 'Save as a new report');
    el('span', 'h-reports-editor-separator', tools).setAttribute('aria-hidden', 'true');
    this.button(tools, 'h-btn', 'fa-solid fa-xmark', 'Close', () => this.close(), 'Close the editor');
    this.editorHost = el('div', 'h-reports-editor-pane-body h-reports-editor-text', root);
    this.layout.setContent('center', root);
  }

  /** East: error level, Test, output. */
  renderEast({ tools, body }) {
    const level = el('select', 'h-select h-reports-editor-level', tools);
    level.title = $HR('Error reporting of the test run');
    for (const [value, label] of [[0, 'Errors: off'], [1, 'Errors: notices'], [2, 'Errors: all'], [3, 'Errors: debug console']]) {
      level.append(option($HR(label), String(value)));
    }
    this.levelSelect = level;
    this.testButton = this.button(tools, 'h-btn', 'fa-solid fa-flask', 'Test', () => this.test(),
      this.app.testTip(this.report));
    this.output = new ReportViewer().attach(body, { jobClient: this.app.jobs });
    this.output.setScriptsAllowed(this.app.scriptsAllowed());
    const hint = el('div', 'h-reports-placeholder h-muted');
    hint.textContent = $HR(this.report.isCardView
      ? 'Test runs the template as shown (saved or not) on the first selected record, or on the first record of the current result.'
      : 'Test runs the template as shown (saved or not) on the selected records, or on the first 50 records of the current result.');
    this.output.info.replaceChildren(hint);
  }

  /** Header button with icon and caption. */
  button(parent, className, icon, label, onClick, title = null) {
    const button = el('button', `${className} h-reports-tool`, parent);
    button.type = 'button';
    if (title) button.title = $HR(title);
    el('i', icon, button).setAttribute('aria-hidden', 'true');
    el('span', 'h-reports-tool-label', button).textContent = $HR(label);
    this.listen(button, 'click', () => this.run(onClick));
    return button;
  }

  /**
   * Load the template text, the editor and the field tree.
   *
   * @returns {Promise<ReportEditorPanel>}
   */
  async load() {
    const { body } = await this.app.api.readTemplate(ReportsApplication.reference(this.report));
    this.editor = new HSmartyEditor().attach(this.editorHost, {
      value: body,
      mode: this.report.isCardView ? 'record' : 'report',
      readOnly: this.readOnly,
      onChange: () => this.updateModified(),
      onSave: () => this.run(() => this.save()),
      completions: () => this.fieldCompletions()
    });
    await this.editor.load();
    this.loadTree().catch((error) => {
      this.treeHost.textContent = `${$HR('The field tree is not available')}: ${error?.message || error}`;
    });
    return this;
  }

  /** Record types and the field tree (several fields can be marked). */
  async loadTree() {
    this.dbdefs = await this.app.loadDbDefs();
    if (!this.container) return;
    this.rectypeSelect.replaceChildren(option($HR('Choose a record type'), ''));
    for (const rectype of this.dbdefs.rectypes()) {
      this.rectypeSelect.append(option(rectype.name, String(rectype.id)));
    }
    const remembered = readRectype();
    const initial = guessRectype(this.editor.getValue(), this.dbdefs) || remembered;
    if (initial && this.dbdefs.rectype(initial)) this.rectypeSelect.value = String(initial);
    this.tree = new HFieldTree({ dbdefs: this.dbdefs });
    this.tree.mount(this.treeHost, {
      rtyId: this.rectypeSelect.value,
      maxDepth: 3,
      enumOutputs: true,
      includeFiles: true,
      showSort: true,
      multiSelect: true,
      relationships: true,
      valuesOnly: true,
      onSelectionChange: (count) => this.updateAddButton(count)
    }, () => {});
  }

  /** "Add Selected Fields" is enabled while fields are marked. */
  updateAddButton(count) {
    this.addButton.disabled = this.readOnly || !count;
    this.addButton.querySelector('.h-reports-editor-add-label').textContent = count
      ? `${$HR('Add Selected Fields')} (${count})` : $HR('Add Selected Fields');
  }

  /**
   * Insert items for the marked fields: fields of the same branch together (so
   * "Insert all" shares their loops), in the order the branches were marked.
   *
   * @returns {Array<object>} `{path, segments, label, remark, rectypeId}`.
   */
  selectedItems() {
    const rootRectypeId = this.rectypeSelect.value;
    const items = [];
    for (const path of this.tree?.getSelectedPaths() || []) {
      const segments = segmentsFromPath(path);
      if (!segments) continue;
      items.push({
        path,
        segments,
        label: this.pathLabel(path, rootRectypeId),
        remark: this.pathRemark(path, rootRectypeId)
      });
    }
    const order = [];
    const groups = new Map();
    for (const item of items) {
      const key = branchKey(item);
      if (!groups.has(key)) {
        groups.set(key, []);
        order.push(key);
      }
      groups.get(key).push(item);
    }
    return order.flatMap((key) => groups.get(key));
  }

  /**
   * Add the marked fields at the cursor. One dialog goes through the fields:
   * Insert field / Skip show the next one, Insert all inserts the remaining ones,
   * Cancel stops (legacy _insertFields). Inserted fields are unmarked and shown in
   * another colour; skipped ones stay marked.
   *
   * @returns {Promise<void>}
   */
  async addSelectedFields() {
    if (this.readOnly || !this.editor) return;
    const items = this.selectedItems();
    if (!items.length) {
      HMsg.showMsgFlash($HR('Mark the fields to add in the tree'), { showDelay: 2000 });
      return;
    }
    const context = this.snippetContext();
    const used = await openInsertFieldsDialog({
      items,
      options: this.insertOptions,
      isRepeatable: (item) => this.isRepeatableItem(item),
      onInsert: (item, options) => {
        this.editor.insertAtCursor(buildFieldSnippet(item, options, context));
        this.tree.clearSelection([item.path], { inserted: true });
      },
      onInsertAll: (rest, options) => {
        this.editor.insertAtCursor(buildGroupedSnippet(rest, options, context));
        this.tree.clearSelection(rest.map((entry) => entry.path), { inserted: true });
      }
    });
    this.insertOptions = { ...this.insertOptions, ...used };
    writeInsertOptions(this.insertOptions);
  }

  /** Whether the field of an item has repeated values (its loop is always added). */
  isRepeatableItem(item) {
    const leaf = item.segments[item.segments.length - 1];
    if (!leaf.fieldId || leaf.kind === 'relationship') return false;
    let rty = this.rectypeSelect.value;
    for (const segment of item.segments.slice(0, -1)) rty = segment.targetRectypeId || segment.sourceRectypeId || '';
    return this.dbdefs?.isRepeatable(rty, leaf.fieldId) === true;
  }

  /** Context of the snippet builder. */
  snippetContext() {
    return {
      rootRectypeId: this.rectypeSelect.value,
      isRepeatable: (rty, dty) => this.dbdefs?.isRepeatable(rty, dty) === true,
      rectypeName: (id) => this.dbdefs?.rectypeName(id) || ''
    };
  }

  /** Caption of a field path (as in the legacy editor: an enum output is "Term", "Code", ...). */
  pathLabel(path, rootRectypeId) {
    const leaf = path[path.length - 1];
    if (leaf.term) return $HR(LEAF_LABELS[leaf.term] || leaf.term);
    const dty = String(leaf.dty);
    if (leaf.relationship) {
      if (!/^\d+$/.test(dty)) return $HR(LEAF_LABELS[dty] || dty);
      const relRty = this.dbdefs?.dbconst?.('RT_RELATION') ?? 1;
      return `${$HR('Relation')} ${this.dbdefs?.fieldName(relRty, dty) || this.dbdefs?.fieldGlobal(dty)?.name || dty}`;
    }
    if (!/^\d+$/.test(dty)) return $HR(HEADER_LABELS[dty] || dty);
    return this.fieldName(leafRectype(path, rootRectypeId), dty);
  }

  /** Comment text: the path of fields (legacy _getRemark: "Field >> Field.Term"). */
  pathRemark(path, rootRectypeId) {
    const leaf = path[path.length - 1];
    if (leaf.relationship) return `${$HR('Relationship')} >> ${this.pathLabel(path, rootRectypeId)}`;
    const parts = [];
    let rty = rootRectypeId;
    for (const step of path.slice(0, -1)) {
      parts.push(this.fieldName(rty, step.via.dty));
      rty = String(step.via.targetRty || '');
    }
    const label = this.pathLabel(path, rootRectypeId);
    parts.push(leaf.term ? `${this.fieldName(rty, leaf.dty)}.${label}` : label);
    return parts.join(' >> ');
  }

  /** Name of a field in a record type. */
  fieldName(rty, dty) {
    return this.dbdefs?.fieldName(rty, dty) || this.dbdefs?.fieldGlobal(dty)?.name || `${$HR('Field')} ${dty}`;
  }

  /** Field variables for completion: `$r.f<id>` of the chosen record type. */
  fieldCompletions() {
    const rty = this.rectypeSelect?.value;
    if (!this.dbdefs || !rty) return [];
    return (this.dbdefs.fields(rty) || []).map((field) => ({ label: `$r.f${field.id}`, detail: field.name }));
  }

  /** Show the unsaved-changes mark. */
  updateModified() {
    this.modifiedMark.hidden = !this.isModified();
  }

  /** Whether the text has unsaved changes. */
  isModified() {
    return !this.readOnly && this.editor?.isModified() === true;
  }

  /** Save the template. */
  async save() {
    if (this.readOnly || !this.editor) return;
    await this.app.api.saveTemplate(ReportsApplication.reference(this.report), this.editor.getValue());
    this.editor.markSaved();
    this.updateModified();
    HMsg.showMsgFlash($HR('Template saved'), { showDelay: 1200 });
  }

  /** Save the text as a new report and continue editing it. */
  async saveAs() {
    const values = await openFormDialog({
      title: 'Save as a new report',
      okLabel: 'Save',
      fields: [
        { name: 'title', label: 'Title', value: `${this.report.title} (copy)`, required: true },
        { name: 'isCardView', label: 'Single record (card) report', type: 'checkbox', value: this.report.isCardView === true },
        { name: 'file', label: 'Template file name', allowed: FILE_NAME_CHARS,
          hint: 'Letters A-Z, digits, "-", "_", "(", ")" and spaces. Empty: made from the title.' }
      ]
    });
    if (!values) return;
    const text = this.editor.getValue();
    this.editor.markSaved(); // the original is left unchanged on purpose
    const created = await this.app.createReport({ ...values, body: text });
    const report = this.app.findReport(ReportsApplication.reference(created)) || created;
    await this.app.view?.showEditor?.(report);
  }

  /**
   * Test run of the text as shown (saved or not). The Test button is disabled
   * while the test runs.
   *
   * @returns {Promise<void>}
   */
  async test() {
    if (this.testButton.disabled) return;
    this.testButton.disabled = true;
    try {
      await this.runTest();
    } finally {
      if (this.testButton) this.testButton.disabled = false;
    }
  }

  /** Start the test job and show its output in the test area (opened when folded). */
  async runTest() {
    const records = await this.app.testRecordIds(this.report);
    if (!records.ids.length) {
      HMsg.showMsgFlash($HR('Select records, or search for records first: the test runs on them.'), { showDelay: 3000 });
      return;
    }
    const params = { ids: records.ids, replevel: Number(this.levelSelect.value) || 0 };
    // the text as shown (saved or not); a read-only template is tested from its file
    const text = this.editor.getValue();
    if (this.readOnly || !text.trim()) params.report = ReportsApplication.reference(this.report);
    else params.body = text;

    this.layout.expand('east');
    const started = this.app.startTest(params).then((job) => { this.testJob = job; return job; });
    const final = await this.output.followJob(started);
    this.testJob = null;
    // the engine writes its errors into the output itself
    if (final.status === 'done') this.output.showUrl(this.app.testResultUrl(final));
  }

  /** Close (the manager asks about unsaved changes). */
  close() {
    this.options.onClose?.();
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

  /** Remove the editor (jobs continue on the server). */
  async destroy() {
    // the test run of this editor is not needed any more
    if (this.testJob) this.app.jobs.cancel(this.testJob.id).catch(() => {});
    this.testJob = null;
    this.tree?.destroy();
    this.tree = null;
    await this.output?.destroy();
    await this.editor?.destroy();
    this.editor = null;
    this.layout?.destroy();
    this.layout = null;
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

/** Record type of the leaf of a path. */
function leafRectype(path, rootRectypeId) {
  let rty = rootRectypeId;
  for (const step of path.slice(0, -1)) rty = String(step.via?.targetRty || '');
  return rty;
}

/**
 * Record type used by a template: `recTypeID==N` / `rectype=N` in the text, or
 * the type that has most of the `f<id>` fields of `$r`.
 *
 * @param {string} text Template text.
 * @param {object} dbdefs HDbDefs.
 * @returns {string} Record type id or ''.
 */
export function guessRectype(text, dbdefs) {
  const explicit = String(text || '').match(/recTypeID\s*==\s*(\d+)/);
  if (explicit && dbdefs.rectype(explicit[1])) return explicit[1];
  const fieldIds = new Set([...String(text || '').matchAll(/\$r\.f(\d+)/g)].map((match) => Number(match[1])));
  if (!fieldIds.size) return '';
  let best = '';
  let bestCount = 0;
  for (const rectype of dbdefs.rectypes()) {
    const count = (dbdefs.fields(rectype.id) || []).filter((field) => fieldIds.has(Number(field.id))).length;
    if (count > bestCount) {
      best = String(rectype.id);
      bestCount = count;
    }
  }
  return best;
}

/** Insert options remembered in the browser. */
function readInsertOptions() {
  try {
    return { ...DEFAULT_SNIPPET_OPTIONS, ...JSON.parse(globalThis.localStorage?.getItem(OPTIONS_STORAGE_KEY) || '{}') };
  } catch {
    return { ...DEFAULT_SNIPPET_OPTIONS };
  }
}

function writeInsertOptions(options) {
  try {
    globalThis.localStorage?.setItem(OPTIONS_STORAGE_KEY, JSON.stringify(options));
  } catch {
    // storage not available
  }
}

function readRectype() {
  try {
    return globalThis.localStorage?.getItem(`${OPTIONS_STORAGE_KEY}-rectype`) || '';
  } catch {
    return '';
  }
}

function storeRectype(value) {
  try {
    globalThis.localStorage?.setItem(`${OPTIONS_STORAGE_KEY}-rectype`, String(value || ''));
  } catch {
    // storage not available
  }
}

/** An `<option>` element. */
function option(label, value) {
  const element = document.createElement('option');
  element.value = String(value);
  element.textContent = label;
  return element;
}
