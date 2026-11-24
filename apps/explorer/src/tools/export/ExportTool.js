/**
 * @file ExportTool.js
 * @brief Export tool of Explorer (a pane module): exports the current DataSource into a file.
 *
 * Loaded lazily when the Export tool module is first shown (plan 13; a pane module since
 * 2026-10-14, plan 16 Part 2). Sections:
 * - Scope: current result, selection, or one record type of the result;
 * - Format (XML/HML by default);
 * - Columns (CSV, TSV, GeoJSON, KML, Gephi): per record type a preset - minimal (id,
 *   record type, title), metadata, all, or custom (field selector) - merged with the marked
 *   data source settings: column fields, geo fields (GeoJSON, KML), time fields;
 * - Expansion (JSON, XML, Gephi): none, "any" link kind with a depth, the DataSource rules,
 *   or custom rules (rule builder dialog, for this export only);
 * - Value formats (formats with columns only; JSON and HML write values as stored);
 * - Additional properties: CSV options (CSV, TSV) or names and local ids (JSON, HML);
 * - Output: record limit (Gephi at most 10K) and file name.
 * The tool follows DataSource, selection and rule changes (ExplorerApplication registers
 * it with the SyncEngine). Toolbar on top: the common toolbar of the presentations (plan 27q3 §3,
 * presentationShell.js) - New | saved exports ▾ | Properties | Save | Save as ‖ Export (Generate) and
 * Export results (dropdown of the user's finished exports: download, delete) ‖ ⋯ Delete. Export has no
 * List (27q3 §2): its saved settings are Presentation sets of kind Export (2-1112, Configuration 2-1187 =
 * the settings of the form) in the selector; a new one is named in the record editor. The scope stays in
 * the form; *Selection* is the query `ids:` of the selected records. Export is ephemeral (a job result);
 * *Keep as generated output* (RT_REPORT_OUTPUT) is not done yet (27q3 §3.1). The export runs as the background job
 * "export"; while it runs only HJobMonitor (progress, Stop) is shown, and afterwards the
 * form again with the download link. A running export is shown at once when the tool is
 * opened (also after a page reload). The last settings are remembered per DataSource in
 * the browser.
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

import { JobClient, ACTIVE_JOB_STATUSES } from '#shared/api/JobClient.js';
import { HJobMonitor } from '#shared/widgets/job/HJobMonitor.js';
import { HBaseWidget } from '#shared/widgets/HBaseWidget.js';
import { $HR, HMsg } from '#shared/ui';
import { showPopover, closePopover } from '#shared/widgets/popover/popover.js';
import { askChoice } from '#shared/ui/askChoice.js';
import { confirmLeave, renderPresentationToolbar, togglePresentationList } from '#shared/widgets/presentation/presentationShell.js';
import { presentationErrorText } from '#shared/widgets/presentation/HPresentationList.js';
import { HFieldSelectionEditor } from '../../widgets/query-source/helpers/HFieldSelectionEditor.js';
import { HRuleBuilder, describeExpansionRule } from '../../widgets/query-source/helpers/HRuleBuilder.js';
import {
  ANY_DEPTHS, ANY_LINK_KINDS, COLUMN_MODES, EXPORT_FORMATS, VALUE_CHOICES, buildExportParams, dataSourceFields,
  defaultExportState, defaultLimit, effectiveLimit, exportFormat, exportProblems, limitChoices, scopeRecordType
} from './exportParams.js';
import { fillScopeSelect, loadScopeRecordTypes, scopeResultTotal } from '../toolScope.js';
import './ExportTool.css';

const STORAGE_PREFIX = 'heurist-export-settings:';

/** Export tool widget. */
export class ExportTool extends HBaseWidget {
  /**
   * @param {object} options Tool options.
   * @param {import('#shared/api').HeuristApiClient} options.apiClient API client of Explorer.
   * @param {function(): Promise<object>} options.getDbDefs Database definitions (HDbDefs).
   * @param {function(): object|null} options.getDataSource Current DataSource.
   * @param {function(): number[]} options.getSelection Selected record ids.
   * @param {string} [options.database] Database name (key of remembered settings).
   * @param {string} [options.language] UI language for the rule builder.
   * @param {JobClient} [options.jobClient] Jobs API (tests).
   * @param {function(string, object): Promise<{saved: boolean, recordId: number}>} [options.addRecord] The record editor of a
   *        new record (a new saved export, plan 27q3).
   * @param {function(number): Promise<{saved?: boolean}>} [options.editRecord] The record editor (Properties).
   */
  constructor({ apiClient, getDbDefs, getDataSource, getSelection, database = '', language = 'eng', jobClient = null,
    addRecord = null, editRecord = null } = {}) {
    super();
    this.addRecord = addRecord;
    this.editRecord = editRecord;
    /** @type {{id: number, title: string}|null} The saved export shown (a Presentation set of kind Export). */
    this.preset = null;
    this.presets = [];
    this._savedJson = null;
    this.apiClient = apiClient;
    this.getDbDefs = getDbDefs;
    this.getDataSource = getDataSource;
    this.getSelection = getSelection;
    this.database = database;
    this.language = language;
    this.jobs = jobClient || new JobClient({ apiClient });
    this.dbdefs = null;
    this.source = null;
    this.selection = [];
    this.settings = defaultExportState();
    this.recordTypes = [];
    this.resultTotal = null;
    this.editors = new Map();
    this.monitor = null;
    this.runningJob = null;
    /** @type {Array<object>|null} Finished and running export jobs (brief), newest first. */
    this.exportJobs = null;
  }

  /**
   * Build the form for the current DataSource and restore a running export.
   *
   * @returns {Promise<ExportTool>} this.
   */
  async render() {
    if (!this.container) throw new Error('ExportTool must be attached before render');
    const root = this.container;
    root.classList.add('h-export-tool');
    root.replaceChildren();

    this._toolbar = element('div', 'h-export-toolbar');
    this._resultsButton = element('button', 'h-btn h-export-results-button');
    this._resultsButton.type = 'button';
    this._resultsButton.innerHTML = '<span class="fa-solid fa-folder-open" aria-hidden="true"></span> ';
    this._resultsButton.append(document.createTextNode(`${$HR('Export results')} `));
    this._resultsButton.insertAdjacentHTML?.('beforeend', '<span class="h-caret" aria-hidden="true"></span>');
    this._resultsButton.addEventListener('click', () => this._toggleResults());
    this._renderToolbar();
    this._problems = element('div', 'h-export-problems');
    this._monitorBox = element('div', 'h-export-monitor');
    this._monitorBox.hidden = true;
    this._form = element('div', 'h-export-form');
    this._form.textContent = $HR('Loading...');
    root.append(this._toolbar, this._problems, this._monitorBox, this._form);
    this._exportButton.disabled = true;

    // a running export is shown without waiting for the definitions and counts
    const restoring = this._restoreJob();
    try {
      this.dbdefs = await this.getDbDefs();
    } catch (error) {
      this.dbdefs = null;
      console.warn('Export: database definitions are not available', error);
    }
    this.source = this.getDataSource() || null;
    this.selection = [...(this.getSelection?.() || [])];
    this.settings = this._restoreState();
    await this._loadPresets();
    this._renderToolbar();
    await this._loadRecordTypes();
    this._build();
    this.state = 'rendered';
    await restoring;
    this._setRunning(this.isRunning());
    return this;
  }

  /**
   * The DataSource changed: settings of the new source, record types, the whole form.
   * A running export is kept.
   *
   * @param {object|null} source New DataSource.
   * @returns {Promise<void>}
   */
  async setDataSource(source) {
    if (!this.isRendered) return;
    this._saveState();
    this.source = source || null;
    this.settings = this._restoreState();
    await this._loadRecordTypes();
    this._build();
    this._setRunning(this.isRunning());
  }

  /**
   * The selection changed: counts and availability of the "Selection" scope.
   *
   * @param {number[]} ids Selected record ids.
   */
  setSelection(ids) {
    this.selection = [...(ids || [])];
    if (!this.isRendered) return;
    this._fillScopeSelect();
    this._refresh();
  }

  /**
   * The DataSource rules changed (rule builder of Explorer or Graph).
   *
   * @param {Array<object>} rules New rules.
   */
  setRules(rules) {
    if (this.source) this.source = { ...this.source, request: { ...(this.source.request || {}), rules } };
    if (!this.isRendered) return;
    this._renderRulesSection();
    this._refresh();
  }

  /** True while an export job of this tool runs (the job continues when the tool closes). */
  isRunning() {
    return Boolean(this.runningJob && ACTIVE_JOB_STATUSES.includes(this.runningJob.status));
  }

  /** Stop polling; a running export continues on the server and is shown again on the next open. */
  async destroy() {
    closePopover();
    this._saveState();
    for (const editor of this.editors.values()) await editor.destroy?.();
    this.editors.clear();
    await this.monitor?.destroy?.();
    await super.destroy();
  }

  // ------------------------------------------------------------------ data

  /** Current query, title, selection and rules of the DataSource. */
  _context() {
    const request = this.source?.request || {};
    return {
      query: request.q ?? null,
      title: this.source?.title || '',
      selection: this.selection,
      rules: Array.isArray(request.rules) && request.rules.length ? request.rules : null,
      source: this.source,
      recordTypes: this.recordTypes.map((item) => item.id),
      dbdefs: this.dbdefs
    };
  }

  /** Record types of the current result with counts (`/records/aggregate?op=rectypes`). */
  async _loadRecordTypes() {
    const query = this._context().query;
    this.recordTypes = [];
    this.resultTotal = null;
    if (query == null || query === '') return;
    try {
      // the count of the query itself (a direct search has no meta.count)
      ({ recordTypes: this.recordTypes, total: this.resultTotal } = await loadScopeRecordTypes(this.apiClient, query, this.dbdefs));
    } catch (error) {
      console.warn('Export: record type counts are not available', error);
    }
  }

  /** Record types whose columns are edited: the chosen one, else every type of the result. */
  _scopeRecordTypes() {
    const rectype = scopeRecordType(this.settings.scope);
    return rectype ? this.recordTypes.filter((item) => item.id === rectype) : this.recordTypes;
  }

  // ------------------------------------------------------------------ form

  _build() {
    const root = this._form;
    for (const editor of this.editors.values()) editor.destroy?.();
    this.editors.clear();
    root.replaceChildren();
    const context = this._context();

    const intro = element('h3', 'h-export-intro');
    intro.textContent = context.query == null
      ? $HR('There is no current result. Run a search first.')
      : `${$HR('Data source')}: ${context.title || $HR('Current result')} · ${this._total()} ${$HR('records')}`;
    root.append(intro);

    const sections = element('div', 'h-export-sections');
    sections.append(this._scopeSection(), this._formatSection());
    // the settings of the chosen format: full width, below a separator, "<Format> format"
    const formatOptions = element('div', 'h-export-format-options');
    this._formatHeader = element('h3', 'h-export-format-header');
    const formatSections = element('div', 'h-export-format-sections');
    this._rulesSection = fieldset($HR('Expansion rules'));
    formatSections.append(
      this._columnsSection(),
      this._rulesSection,
      this._valuesSection(),
      this._propertiesSection(),
      this._outputSection()
    );
    formatOptions.append(this._formatHeader, formatSections);
    root.append(sections, formatOptions);
    this._renderRulesSection();
    const bottom = element('div', 'h-export-bottom');
    this._bottomExportButton = element('button', 'h-btn h-btn-primary h-export-start-bottom');
    this._bottomExportButton.type = 'button';
    this._bottomExportButton.innerHTML = '<span class="fa-solid fa-file-export" aria-hidden="true"></span> ';
    this._bottomExportButton.append(document.createTextNode($HR('Export')));
    this._bottomExportButton.addEventListener('click', () => this._start());
    bottom.append(this._bottomExportButton);
    root.append(bottom);
    this._refresh();
  }

  /** While an export runs only the job monitor is shown (no toolbar, no form). */
  _setRunning(running) {
    if (this._toolbar) this._toolbar.hidden = running;
    if (this._problems) this._problems.hidden = running;
    if (this._form) this._form.hidden = running;
    if (running) closePopover();
    this._refresh();
  }

  /** Records of the current result: the server count of the query, else the DataSource count. */
  _total() {
    return scopeResultTotal({ total: this.resultTotal, source: this.source, recordTypes: this.recordTypes });
  }

  _scopeSection() {
    const section = fieldset($HR('Scope'));
    this._scopeSelect = element('select', 'h-select h-export-scope');
    this._scopeSelect.addEventListener('change', () => {
      this.settings.scope = this._scopeSelect.value;
      this._renderColumnEditors();
      this._refresh();
    });
    this._fillScopeSelect();
    section.append(labelled($HR('Records to export'), this._scopeSelect));
    return section;
  }

  /** Options: current result, selection, then one option per record type of the result. */
  _fillScopeSelect() {
    if (!this._scopeSelect) return;
    this.settings.scope = fillScopeSelect(this._scopeSelect, {
      total: this._total(), selection: this.selection, recordTypes: this.recordTypes, value: this.settings.scope
    });
  }

  _formatSection() {
    const section = fieldset($HR('Format'));
    const select = element('select', 'h-select h-export-format');
    addOptions(select, EXPORT_FORMATS.map((item) => [item.value, $HR(item.label)]));
    select.value = exportFormat(this.settings.format).value;
    select.addEventListener('change', () => {
      this.settings.format = select.value;
      this.settings.limit = defaultLimit(select.value);
      this._fillLimitSelect();
      this._renderColumnEditors();
      this._refresh();
    });
    this._formatNote = element('div', 'h-muted h-export-note');
    section.append(labelled($HR('File format'), select), this._formatNote);
    return section;
  }

  _columnsSection() {
    const section = fieldset($HR('Columns'));
    this._columnsSectionEl = section;
    const fromSource = dataSourceFields(this.source);
    this._sourceBox = element('div', 'h-export-source-fields');
    this._sourceChecks = [];
    const caption = element('span', 'h-export-row-label');
    caption.textContent = $HR('Use data source settings');
    this._sourceBox.append(caption);
    const add = (key, text, available) => {
      if (!available) return null;
      const box = checkbox(text, this.settings[key] !== false, (checked) => {
        this.settings[key] = checked;
        this._renderColumnEditors();
        this._refresh();
      });
      this._sourceBox.append(box);
      this._sourceChecks.push(box);
      return box;
    };
    add('useColumnFields', $HR('column fields'), fromSource.columns.length > 0);
    this._geoFieldsBox = add('useGeoFields', $HR('geo fields'), fromSource.geo.length > 0);
    add('useTimeFields', $HR('time fields'), fromSource.time.length > 0);
    this._columnsNote = element('div', 'h-muted h-export-note');
    this._editorsBox = element('div', 'h-export-editors');
    section.append(this._sourceBox, this._columnsNote, this._editorsBox);
    this._renderColumnEditors();
    return section;
  }

  /** Per record type in scope: preset radio group; the field selector only for "custom". */
  _renderColumnEditors() {
    if (!this._editorsBox) return;
    const format = exportFormat(this.settings.format);
    for (const editor of this.editors.values()) editor.destroy?.();
    this.editors.clear();
    this._editorsBox.replaceChildren();
    this._columnsSectionEl.hidden = !format.columns;
    if (!format.columns) return;
    if (this._geoFieldsBox) this._geoFieldsBox.hidden = !format.geo;
    // "Use data source settings" only when one of its checkboxes is shown
    this._sourceBox.hidden = !this._sourceChecks.some((box) => !box.hidden);
    this._columnsNote.textContent = (format.value === 'csv' || format.value === 'tsv')
      ? $HR('The first column is always H-ID (record ID).')
      : $HR('Fields written as properties / attributes.');
    const types = this._scopeRecordTypes();
    types.forEach((item) => this._editorsBox.append(this._recordTypeColumns(item)));
    if (!types.length) this._editorsBox.textContent = $HR('No record types in scope');
  }

  /** One record type: name, preset radio group and (custom) the field selector. */
  _recordTypeColumns(item) {
    const box = element('div', 'h-export-rectype');
    const head = element('div', 'h-export-rectype-head');
    const name = element('span', 'h-export-rectype-name');
    name.textContent = `${item.name} (${item.count})`;
    const modes = element('span', 'h-export-modes');
    const group = `h-export-mode-${item.id}-${Math.random().toString(36).slice(2, 8)}`;
    const body = element('div', 'h-export-rectype-body');
    const mode = this.settings.columnModes[item.id] || 'minimal';
    for (const [value, text] of COLUMN_MODES) {
      const label = element('label', 'h-export-check');
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = group;
      radio.value = value;
      radio.checked = value === mode;
      radio.addEventListener('change', () => {
        if (!radio.checked) return;
        this.settings.columnModes[item.id] = value;
        this._showCustomEditor(item, body, value === 'custom');
        this._refresh();
      });
      label.append(radio, document.createTextNode(` ${$HR(text)}`));
      modes.append(label);
    }
    head.append(name, modes);
    box.append(head, body);
    this._showCustomEditor(item, body, mode === 'custom');
    return box;
  }

  /** Show (mount once) or hide the field selector of a record type. */
  _showCustomEditor(item, body, show) {
    body.hidden = !show;
    if (!show || this.editors.has(item.id)) return;
    if (!this.dbdefs) {
      body.textContent = $HR('Database definitions are not available');
      return;
    }
    const editor = new HFieldSelectionEditor({
      dbdefs: this.dbdefs,
      title: $HR('Columns'),
      includeHeaders: true,
      allowReorder: true,
      multiSelect: true,
      removeAll: true,
      onChange: (fields) => {
        this.settings.columns[item.id] = fields.map(({ field, title, ext }) => ({ field, title, ...(ext ? { ext } : {}) }));
        this._refresh();
      }
    });
    editor.setRecordType(item.id).setValue(this.settings.columns[item.id] || []);
    // own element: the editor replaces the class of its container (body keeps [hidden] working)
    const holder = element('div', 'h-export-custom-columns');
    body.append(holder);
    editor.attach(holder);
    editor.render();
    this.editors.set(item.id, editor);
  }

  /** Expansion: none | any link kind with depth | rules of the data source | custom rules. */
  _renderRulesSection() {
    const section = this._rulesSection;
    if (!section) return;
    section.replaceChildren(section.legend);
    const context = this._context();

    const mode = element('select', 'h-select h-export-rules-mode');
    const [, , sourceOption] = addOptions(mode, [
      ['none', $HR('No expansion')],
      ['any', $HR('Any link')],
      ['source', $HR('Use the expansion rules of the data source')],
      ['custom', $HR('Custom expansion rules')]
    ]);
    sourceOption.disabled = !context.rules;
    if (this.settings.rulesMode === 'source' && !context.rules) this.settings.rulesMode = 'none';
    mode.value = this.settings.rulesMode;
    mode.addEventListener('change', () => {
      this.settings.rulesMode = mode.value;
      this._renderRulesSection();
      this._refresh();
      if (mode.value === 'custom' && !(this.settings.customRules || []).length) this._editRules();
    });
    section.append(labelled($HR('Also export linked records'), mode));

    if (this.settings.rulesMode === 'any') {
      const kind = element('select', 'h-select h-export-any-kind');
      addOptions(kind, ANY_LINK_KINDS.map(([value, text]) => [value, $HR(text)]));
      kind.value = this.settings.anyKind;
      kind.addEventListener('change', () => { this.settings.anyKind = kind.value; });
      const depth = element('select', 'h-select h-export-any-depth');
      addOptions(depth, ANY_DEPTHS.map((value) => [String(value), String(value)]));
      depth.value = String(this.settings.anyDepth || 1);
      depth.addEventListener('change', () => { this.settings.anyDepth = Number(depth.value); });
      section.append(labelled($HR('Link'), kind), labelled($HR('Depth (levels)'), depth));
    } else if (this.settings.rulesMode === 'source' || this.settings.rulesMode === 'custom') {
      const rules = this.settings.rulesMode === 'source' ? context.rules || [] : this.settings.customRules || [];
      section.append(this._rulesList(rules));
      if (this.settings.rulesMode === 'custom') {
        const edit = element('button', 'h-btn h-btn-small');
        edit.type = 'button';
        edit.textContent = $HR('Edit custom rules');
        edit.addEventListener('click', () => this._editRules());
        section.append(edit);
      }
    }
    if (this.settings.rulesMode !== 'none') {
      const note = element('div', 'h-muted h-export-note');
      note.textContent = $HR('Every record is written once: the result first, then the records each level reaches.');
      section.append(note);
    }
  }

  _rulesList(rules) {
    const box = element('div', 'h-export-rules');
    if (!rules.length) {
      box.textContent = $HR('No rules');
      return box;
    }
    const list = element('ul', 'h-export-rule-list');
    for (const rule of rules) {
      const item = document.createElement('li');
      let text = rule?.name || '';
      if (!text && this.dbdefs) {
        try { text = describeExpansionRule(rule, this.dbdefs)?.name || ''; } catch { text = ''; }
      }
      item.textContent = text || JSON.stringify(rule?.query ?? rule);
      list.append(item);
    }
    box.append(list);
    return box;
  }

  /** Custom rules for this export only (the DataSource is not changed). */
  async _editRules() {
    if (!this.dbdefs) return;
    const current = structuredClone(this.settings.customRules ?? this._context().rules ?? []);
    const builder = new HRuleBuilder({ dbdefs: this.dbdefs, lang: this.language });
    const rules = await builder.setRules(current).open({ dataSource: this.source ? structuredClone(this.source) : null });
    if (rules != null) this.settings.customRules = rules;
    this._renderRulesSection();
    this._refresh();
  }

  /** Value formats: only for the formats that write values as text (with columns). */
  _valuesSection() {
    const section = fieldset($HR('Value formats'));
    this._valuesSectionEl = section;
    const captions = { date: 'Temporals', file: 'Files' };
    for (const [kind, choices] of Object.entries(VALUE_CHOICES)) {
      const select = element('select', `h-select h-export-value-${kind}`);
      addOptions(select, choices.map(([value, text]) => [value, $HR(text)]));
      if (!choices.some(([value]) => value === this.settings.values[kind])) this.settings.values[kind] = choices[0][0];
      select.value = this.settings.values[kind];
      select.addEventListener('change', () => { this.settings.values[kind] = select.value; });
      section.append(labelled($HR(captions[kind]), select));
    }
    section.append(
      checkbox($HR('Title for target pointers'), this.settings.values.pointerTitle === true,
        (checked) => { this.settings.values.pointerTitle = checked; }),
      checkbox($HR('Terms hierarchy'), this.settings.values.termHierarchy === true,
        (checked) => { this.settings.values.termHierarchy = checked; })
    );
    const note = element('div', 'h-muted h-export-note');
    note.textContent = $HR('Geographic values are written as WKT (GeoJSON and KML: as geometry). A term column may have its own output.');
    section.append(note);
    return section;
  }

  /** Additional properties of the format: CSV options, or names and local ids (JSON, HML). */
  _propertiesSection() {
    const section = fieldset($HR('Additional properties'));
    this._propertiesSectionEl = section;

    this._csvBox = element('div', 'h-export-props-csv');
    const sep = element('select', 'h-select h-export-csv-sep');
    addOptions(sep, [[',', $HR('Comma')], [';', $HR('Semicolon')], ['|', $HR('Vertical bar')], ['tab', $HR('Tab')]]);
    sep.value = this.settings.csv.sep === '\t' ? 'tab' : this.settings.csv.sep;
    sep.addEventListener('change', () => { this.settings.csv.sep = sep.value === 'tab' ? '\t' : sep.value; this._refresh(); });
    const quote = element('select', 'h-select h-export-csv-quote');
    addOptions(quote, [['"', $HR('Double quote')], ["'", $HR('Single quote')], ['none', $HR('None')]]);
    quote.value = this.settings.csv.quote === '' ? 'none' : this.settings.csv.quote;
    quote.addEventListener('change', () => { this.settings.csv.quote = quote.value === 'none' ? '' : quote.value; });
    const mvsep = element('input', 'h-input h-export-csv-mvsep');
    mvsep.value = this.settings.csv.mvsep;
    mvsep.size = 1;
    mvsep.maxLength = 1;
    mvsep.addEventListener('input', () => { this.settings.csv.mvsep = mvsep.value || '|'; });
    const eol = element('select', 'h-select h-export-csv-eol');
    addOptions(eol, [['nix', $HR('Unix / macOS (LF)')], ['win', $HR('Windows (CR LF)')]]);
    eol.value = this.settings.csv.eol;
    eol.addEventListener('change', () => { this.settings.csv.eol = eol.value; });
    const header = checkbox($HR('Header row with column names'), this.settings.csv.header !== false,
      (checked) => { this.settings.csv.header = checked; });
    this._csvSep = labelled($HR('Separator'), sep);
    const csvNote = element('div', 'h-muted h-export-note');
    csvNote.textContent = $HR('Each record type is written to its own file; several files are packed in a zip.');
    this._csvBox.append(this._csvSep, labelled($HR('Quote'), quote), labelled($HR('Repeated values separator'), mvsep),
      labelled($HR('Line ends'), eol), header, csvNote);

    // JSON: resolveDetails of the /records API; HML: names and local ids (texts set in _refresh)
    this._namesBox = element('div', 'h-export-props-names');
    this._namesCheck = checkbox('', this.settings.names === true,
      (checked) => { this.settings.names = checked; });
    this._namesText = element('span', 'h-export-names-text');
    this._namesCheck.append(this._namesText);
    this._namesNote = element('div', 'h-muted h-export-note');
    this._namesBox.append(this._namesCheck, this._namesNote);

    section.append(this._csvBox, this._namesBox);
    return section;
  }

  _outputSection() {
    const section = fieldset($HR('Output'));
    this._limitSelect = element('select', 'h-select h-export-limit');
    this._limitSelect.addEventListener('change', () => { this.settings.limit = Number(this._limitSelect.value) || 0; });
    this._fillLimitSelect();
    const name = element('input', 'h-input h-export-filename');
    name.value = this.settings.fileName;
    name.placeholder = $HR('Automatic');
    name.addEventListener('input', () => {
      const clean = name.value.replace(/[^A-Za-z0-9 _\-()]/g, '');
      if (clean !== name.value) name.value = clean;
      this.settings.fileName = clean;
      this._refresh();
    });
    section.append(labelled($HR('Record limit'), this._limitSelect), labelled($HR('File name'), name));
    const note = element('div', 'h-muted h-export-note');
    note.textContent = $HR('The file is created on the server; only you can download it. It is kept for 24 hours.');
    section.append(note);
    return section;
  }

  /** Limit choices of the format (Gephi: at most 10K). */
  _fillLimitSelect() {
    const select = this._limitSelect;
    if (!select) return;
    const format = this.settings.format;
    const choices = limitChoices(format);
    select.replaceChildren();
    addOptions(select, choices.map((value) => [String(value), value ? formatCount(value) : $HR('All')]));
    if (!choices.includes(Number(this.settings.limit))) this.settings.limit = defaultLimit(format);
    this.settings.limit = effectiveLimit(this.settings.limit, format);
    if (!choices.includes(this.settings.limit)) this.settings.limit = choices.at(-1);
    select.value = String(this.settings.limit);
  }

  /** Show or hide format-dependent parts and the problems; enable Export. */
  _refresh() {
    const format = exportFormat(this.settings.format);
    const table = format.value === 'csv' || format.value === 'tsv';
    if (this._valuesSectionEl) this._valuesSectionEl.hidden = !format.columns;
    if (this._rulesSection) this._rulesSection.hidden = !format.rules;
    if (this._propertiesSectionEl) this._propertiesSectionEl.hidden = !table && !format.names;
    if (this._csvBox) this._csvBox.hidden = !table;
    if (this._csvSep) this._csvSep.hidden = format.value === 'tsv';
    if (this._namesBox) this._namesBox.hidden = !format.names;
    if (this._namesCheck) {
      const json = format.value === 'json';
      this._namesText.textContent = $HR(json
        ? 'Include human-readable names for everything (term labels, record titles, file details)'
        : 'Include human-readable names and local IDs for everything');
      this._namesNote.textContent = $HR(json
        ? 'Without them values are stored ids. Record types, fields and terms with names and concept codes are always listed in the metadata.'
        : 'Without them record types, fields and terms are identified by concept codes only.');
    }
    if (this._formatHeader) this._formatHeader.textContent = `${$HR(format.label)} ${$HR('format')}`;
    if (this._formatNote) {
      this._formatNote.textContent = $HR({
        csv: 'One table per record type, first column H-ID.',
        tsv: 'One table per record type, first column H-ID.',
        json: 'All fields of the records in the format of the /records API; concept codes in the metadata.',
        geojson: 'One feature per record with geographic values; chosen columns are properties.',
        kml: 'One placemark per geographic value, with its date or start/end date.',
        xml: 'Heurist XML (HML) that can be imported into another Heurist database.',
        gephi: 'Network for Gephi: records are nodes, pointers and relationships between them are edges. At most 10,000 records.'
      }[format.value] || '');
    }
    if (!this._problems || !this._exportButton) return;
    if (!this.isRendered) {
      this._exportButton.disabled = true;
      return;
    }
    const problems = exportProblems(this.settings, this._context());
    if (this._bottomExportButton) this._bottomExportButton.disabled = problems.length > 0 || this.isRunning();
    this._problems.replaceChildren(...problems.map((text) => {
      const item = element('div', 'h-export-problem');
      item.textContent = $HR(text);
      return item;
    }));
    this._exportButton.disabled = problems.length > 0 || this.isRunning();
  }

  // ------------------------------------------------------------------ job

  async _start() {
    const context = this._context();
    if (exportProblems(this.settings, context).length || this.isRunning()) return;
    this._saveState();
    const params = buildExportParams(this.settings, context);
    this._exportButton.disabled = true;
    try {
      const job = await this.jobs.start('export', params);
      this._follow(job);
    } catch (error) {
      this._showError(error);
      this._refresh();
    }
  }

  /** Show a job with progress, Stop and the download link; the form is hidden while it runs. */
  _follow(job) {
    this.runningJob = job;
    this._monitorBox.hidden = false;
    this.monitor?.destroy?.();
    this.monitor = new HJobMonitor();
    this.monitor.attach(this._monitorBox, {
      jobClient: this.jobs,
      onFinish: (finished) => {
        this.runningJob = finished;
        this._rememberJob(finished);
        this._setRunning(false);
      }
    });
    this.monitor.follow(job).catch((error) => {
      this._showError(error);
      this.runningJob = null;
      this._setRunning(false);
    });
    this._setRunning(this.isRunning());
  }

  /** Open or close the dropdown of finished exports. */
  _toggleResults() {
    if (this._resultsButton.getAttribute?.('aria-expanded') === 'true') {
      closePopover();
      return;
    }
    showPopover(this._resultsButton, this._resultsList(), { className: 'h-export-results-popover' });
  }

  /**
   * Finished exports of the user, newest first: mark, file name (download), date, size, open in
   * a new tab, download; bottom panel: Remove marked, Remove all. The list kept from the last
   * request is shown at once and refreshed.
   */
  _resultsList() {
    const root = element('div', 'h-export-results');
    const list = element('div', 'h-export-results-list');
    const footer = element('div', 'h-export-results-footer');
    const marked = new Set();
    const removeMarked = element('button', 'h-btn h-btn-small');
    removeMarked.type = 'button';
    removeMarked.textContent = $HR('Remove marked');
    removeMarked.disabled = true;
    removeMarked.addEventListener('click', () => this._removeResults([...marked]));
    const removeAll = element('button', 'h-btn h-btn-small');
    removeAll.type = 'button';
    removeAll.textContent = $HR('Remove all');
    footer.append(removeMarked, removeAll);
    root.append(list, footer);
    let done = [];
    const onMark = (job, on) => {
      if (on) marked.add(job.id); else marked.delete(job.id);
      removeMarked.disabled = marked.size === 0;
    };
    removeAll.addEventListener('click', () => this._removeResults(done.map((job) => job.id)));
    const render = (jobs) => {
      list.replaceChildren();
      done = (Array.isArray(jobs) ? jobs : []).filter((job) => job.status === 'done' && job.result?.download);
      for (const id of [...marked]) if (!done.some((job) => job.id === id)) marked.delete(id);
      removeMarked.disabled = marked.size === 0;
      removeAll.disabled = done.length === 0;
      if (!done.length) {
        list.append(Object.assign(element('div', 'h-muted h-export-results-empty'), { textContent: $HR('No export results') }));
        return;
      }
      for (const job of done) list.append(this._resultRow(job, marked.has(job.id), onMark));
    };
    if (Array.isArray(this.exportJobs)) render(this.exportJobs);
    else list.append(Object.assign(element('div', 'h-muted h-export-results-empty'), { textContent: $HR('Loading...') }));
    this._loadExportJobs().then(render).catch((error) => {
      list.replaceChildren(Object.assign(element('div', 'h-export-error'), { textContent: error?.message || String(error) }));
    });
    return root;
  }

  /** One finished export: mark, name (download), date, size, open in a new tab, download. */
  _resultRow(job, checked, onMark) {
    const row = element('div', 'h-export-results-row');
    const url = this.jobs.resultUrl(job.id);
    const mark = element('input', 'h-export-results-mark');
    mark.type = 'checkbox';
    mark.checked = checked;
    mark.title = $HR('Mark');
    mark.addEventListener('change', () => onMark(job, mark.checked));
    const name = element('a', 'h-export-results-name');
    name.href = url;
    name.download = job.result.file || '';
    name.textContent = job.result.file || job.title || job.id;
    name.title = `${job.title || ''}${job.result.records ? ` - ${job.result.records} ${$HR('records')}` : ''}`;
    const date = element('span', 'h-export-results-date h-muted');
    date.textContent = formatDate(job.finishedAt);
    const size = element('span', 'h-export-results-size h-muted');
    size.textContent = formatSize(job.result.size);
    // a zip cannot be shown in the browser
    const open = element('a', 'heurist-icon-button h-export-results-icon');
    if (/\.zip$/i.test(job.result.file || '')) {
      open.classList.add('h-export-results-icon-none');
    } else {
      open.href = `${url}${url.includes('?') ? '&' : '?'}inline=1`;
      open.target = '_blank';
      open.rel = 'noopener';
      open.title = $HR('Open in a new tab');
      open.innerHTML = '<span class="fa-solid fa-up-right-from-square" aria-hidden="true"></span>';
    }
    const download = element('a', 'heurist-icon-button h-export-results-icon');
    download.href = url;
    download.download = job.result.file || '';
    download.title = $HR('Download');
    download.innerHTML = '<span class="fa-solid fa-download" aria-hidden="true"></span>';
    row.append(mark, name, date, size, open, download);
    return row;
  }

  /** Close the list at once (no second click), confirm with the Heurist dialog, remove the files. */
  async _removeResults(ids) {
    closePopover();
    if (!ids.length) return;
    const question = ids.length === 1
      ? `${$HR('Remove export result')} "${(this.exportJobs || []).find((job) => job.id === ids[0])?.result?.file || ids[0]}"?`
      : `${$HR('Remove export results')}: ${ids.length}?`;
    if (!(await confirmDialog(question))) return;
    const failed = [];
    for (const id of ids) {
      try {
        await this.jobs.remove(id);
        if (Array.isArray(this.exportJobs)) this.exportJobs = this.exportJobs.filter((item) => item.id !== id);
      } catch (error) {
        failed.push(error?.message || String(error));
      }
    }
    if (failed.length) HMsg.showMsgErr(failed[0]);
  }

  /** After a page reload: show the user's running export; keep the list for Export results. */
  async _restoreJob() {
    try {
      await this._loadExportJobs();
      const running = (this.exportJobs || []).find((job) => ACTIVE_JOB_STATUSES.includes(job.status));
      if (running) this._follow(running);
    } catch (error) {
      console.warn('Export: running jobs are not available', error);
    }
  }

  /** Export jobs of the user without their parameters (`GET /jobs?type=export&brief=1`). */
  async _loadExportJobs() {
    const jobs = await this.jobs.list({ type: 'export', brief: true });
    this.exportJobs = (Array.isArray(jobs) ? jobs : []).filter((job) => job.type === 'export');
    return this.exportJobs;
  }

  /** Put a finished job at the top of the kept list. */
  _rememberJob(job) {
    if (!job?.id || !Array.isArray(this.exportJobs)) return;
    this.exportJobs = [job, ...this.exportJobs.filter((item) => item.id !== job.id)];
  }

  /** Warning with an icon: the server's own message (e.g. "Your export folder is full ..."). */
  _showError(error) {
    const box = element('div', 'h-export-problem h-export-error');
    const icon = element('span', 'fa-solid fa-triangle-exclamation');
    icon.setAttribute('aria-hidden', 'true');
    box.append(icon, document.createTextNode(` ${errorText(error)}`));
    this._monitorBox.hidden = false;
    this._monitorBox.replaceChildren(box);
  }

  // ------------------------------------------------------------------ saved exports (plan 27q3)

  /** @private Field, type and term ids of the Presentation set. */
  _presetIds() {
    const id = (code) => Number(this.dbdefs?.dbconst?.(code)) || 0;
    return {
      rectype: id('RT_PRESENTATION_SET'), name: id('DT_NAME'), configuration: id('DT_CONFIGURATION'),
      type: id('DT_PRESENTATION_TYPE'), export: id('TRM_PRESENTATION_EXPORT')
    };
  }

  /** @private The saved exports of the database (Presentation sets of kind Export). */
  async _loadPresets() {
    const ids = this._presetIds();
    if (!ids.rectype || !ids.type || !ids.export) {
      this.presets = [];
      return;
    }
    const answer = await this.apiClient.get('/records', {
      query: { q: JSON.stringify([{ t: String(ids.rectype) }, { [`f:${ids.type}`]: String(ids.export) }]), fields: 'rec_ID,rec_Title', limit: 1000 }
    }).catch(() => null);
    this.presets = ((answer?.data ?? answer)?.records || [])
      .map((record) => ({ id: Number(record.rec_ID), title: String(record.rec_Title || `#${record.rec_ID}`) }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }

  /** @private The settings of the form are not saved in the shown export. */
  _isDirty() {
    return Boolean(this.preset) && this._savedJson !== null && JSON.stringify(this.settings) !== this._savedJson;
  }

  /** @private Unsaved changes of a saved export: Save | Discard | Cancel (27q3 §3.2). */
  _confirmLeave() {
    return confirmLeave({ dirty: this._isDirty(), save: () => this._savePreset(), message: 'The export settings have been changed. Save changes?' });
  }

  /**
   * Open a saved export: its settings in the form.
   *
   * @param {number} id Presentation set id.
   * @returns {Promise<boolean>}
   */
  async openPreset(id) {
    const ids = this._presetIds();
    const answer = await this.apiClient.get(`/presentation/${Number(id)}`, { query: { fields: '_all' } }).catch(() => null);
    const record = (answer?.data ?? answer)?.records?.[0];
    if (!record) {
      HMsg.showMsgErr?.($HR('The saved export was not found'));
      return false;
    }
    const value = [record.details?.[ids.configuration]].flat()[0];
    let saved = null;
    try {
      saved = JSON.parse(String(value?.value ?? value ?? '') || 'null');
    } catch {
      saved = null;
    }
    this.preset = { id: Number(record.rec_ID), title: String(record.rec_Title || `#${record.rec_ID}`) };
    this.settings = this._mergeState(saved);
    this._savedJson = JSON.stringify(this.settings);
    this._renderToolbar();
    this._build();
    return true;
  }

  /** @private New: the default settings, no saved export. */
  async _newPreset() {
    if (!(await this._confirmLeave())) return;
    this.preset = null;
    this._savedJson = null;
    this.settings = this._mergeState(null);
    this._renderToolbar();
    this._build();
  }

  /**
   * @private Save the settings: in the shown export (PATCH), or a new one named in the record editor (`asNew`, or none
   * shown yet).
   * @returns {Promise<boolean>}
   */
  async _savePreset({ asNew = false } = {}) {
    const ids = this._presetIds();
    if (!ids.rectype || !ids.configuration || !ids.type || !ids.export) {
      HMsg.showMsgErr?.($HR('This database has no record type Presentation set (2-1112)'));
      return false;
    }
    const configuration = JSON.stringify(this.settings);
    try {
      if (this.preset && !asNew) {
        await this.apiClient.request(`/presentation/${this.preset.id}`, { method: 'PATCH', body: { details: { [ids.configuration]: [configuration] } } });
        this._savedJson = configuration;
        HMsg.showMsgFlash?.($HR('Saved'), { showDelay: 1500 });
        return true;
      }
      if (!this.addRecord) return false;
      const title = this.preset ? `${this.preset.title} (${$HR('copy')})` : '';
      const result = await this.addRecord('RT_PRESENTATION_SET', {
        values: { ...(title ? { [ids.name]: title } : {}), [ids.type]: ids.export, [ids.configuration]: configuration }
      });
      if (!result?.saved) return false;
      await this._loadPresets();
      await this.openPreset(Number(result.recordId));
      return true;
    } catch (error) {
      HMsg.showMsgErr?.(presentationErrorText(error));
      return false;
    }
  }

  /** @private Delete the shown saved export (Export has no List: in ⋯). */
  async _deletePreset() {
    if (!this.preset) return;
    const answer = await askChoice(`${$HR('Delete')} "${this.preset.title}"?`, $HR('Delete'), [['delete', $HR('Delete')]]);
    if (answer !== 'delete') return;
    try {
      await this.apiClient.request(`/presentation/${this.preset.id}`, { method: 'DELETE' });
    } catch (error) {
      HMsg.showMsgErr?.(presentationErrorText(error));
      return;
    }
    this.preset = null;
    this._savedJson = null;
    await this._loadPresets();
    this._renderToolbar();
  }

  /** @private Properties: the record editor of the shown export. */
  async _properties() {
    if (!this.preset || !this.editRecord) return;
    const result = await this.editRecord(this.preset.id);
    if (result?.saved === false) return;
    await this._loadPresets();
    await this.openPreset(this.preset.id);
  }

  /**
   * @private The common toolbar (27q3 §3): New | saved exports | Properties | Save | Save as ‖ Export, Export results ‖
   * ⋯ Delete.
   */
  _renderToolbar() {
    if (!this._toolbar) return;
    const disabled = this._exportButton?.disabled ?? true;
    const made = renderPresentationToolbar(this._toolbar, {
      new: { label: 'New', title: 'New export settings (the defaults)', caption: false, run: () => void this._newPreset() },
      selector: {
        icon: 'fa-file-export', label: this.preset?.title || $HR('Saved exports'), title: 'Saved export settings', disabled: !this.presets.length,
        run: (anchor) => togglePresentationList(anchor, this.presets, {
          current: this.preset?.id,
          onSelect: async (item) => {
            if (item.id !== this.preset?.id && (await this._confirmLeave())) await this.openPreset(item.id);
          }
        })
      },
      properties: { title: 'Name, description, owner and visibility of the saved export', disabled: !this.preset || !this.editRecord, run: () => void this._properties() },
      save: {
        primary: false, title: this.preset ? 'Save the settings in this saved export' : 'Save the settings as a saved export (named in the record editor)',
        disabled: !this.preset && !this.addRecord, run: () => void this._savePreset()
      },
      saveAs: { title: 'Save the settings as a new saved export', disabled: !this.addRecord, run: () => void this._savePreset({ asNew: true }) },
      // Export = Generate: the file of the current settings (a job result, 27q3 §3.1)
      generate: { icon: 'fa-file-export', label: 'Export', title: 'Export the records into a file', primary: true, disabled, run: () => this._start() },
      more: [{ icon: 'fa-trash-can', label: 'Delete', title: 'Delete the saved export', disabled: !this.preset, run: () => void this._deletePreset() }]
    });
    this._exportButton = made.generate;
    made.generate.classList.add('h-export-start');
    made.generate.after(this._resultsButton);
  }

  // ------------------------------------------------------------------ remembered settings

  _storageKey() {
    const key = this.source?.reference?.key || this.source?.title || 'current';
    return `${STORAGE_PREFIX}${this.database}:${key}`;
  }

  _restoreState() {
    // a saved export keeps its own settings (plan 27q3)
    if (this.preset && this._savedJson) return this._mergeState(JSON.parse(this._savedJson));
    let saved = null;
    try {
      saved = JSON.parse(globalThis.localStorage?.getItem(this._storageKey()) || 'null');
    } catch {
      // private window or blocked storage: defaults
    }
    return this._mergeState(saved);
  }

  /** @private The settings of the form from stored ones (the browser or a saved export), with the defaults. */
  _mergeState(saved) {
    const state = defaultExportState();
    try {
      if (saved && typeof saved === 'object') {
        Object.assign(state, saved, {
          values: { ...state.values, ...saved.values },
          csv: { ...state.csv, ...saved.csv },
          columns: saved.columns && typeof saved.columns === 'object' ? saved.columns : {},
          columnModes: saved.columnModes && typeof saved.columnModes === 'object' ? saved.columnModes : {}
        });
        // settings saved before 2026-10-07: one-character separator
        if (String(state.csv.mvsep).length !== 1) state.csv.mvsep = '|';
        if (!EXPORT_FORMATS.some((item) => item.value === state.format)) state.format = 'xml';
      }
    } catch {
      // private window or blocked storage: defaults
    }
    // checked whenever the tool opens (not remembered)
    state.values.pointerTitle = true;
    state.values.termHierarchy = true;
    return state;
  }

  _saveState() {
    try {
      globalThis.localStorage?.setItem(this._storageKey(), JSON.stringify(this.settings));
    } catch {
      // storage is a convenience only
    }
  }
}

/** Create an element with a class name. */
function element(tag, className = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

/** A form section with a legend. */
function fieldset(title) {
  const section = element('fieldset', 'h-export-section');
  const legend = document.createElement('legend');
  legend.textContent = title;
  section.append(legend);
  section.legend = legend;
  return section;
}

/** A labelled control row. */
function labelled(text, control) {
  const row = element('label', 'h-export-row');
  const caption = element('span', 'h-export-row-label');
  caption.textContent = text;
  row.append(caption, control);
  return row;
}

/** A checkbox with a caption. */
function checkbox(text, checked, onChange) {
  const label = element('label', 'h-export-check');
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = checked;
  box.addEventListener('change', () => onChange(box.checked));
  label.append(box, document.createTextNode(` ${text}`));
  label.input = box;
  return label;
}

/**
 * Append `[value, text]` options to a select or optgroup.
 *
 * @returns {HTMLOptionElement[]} The new options.
 */
function addOptions(parent, options) {
  return options.map(([value, text]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    parent.append(option);
    return option;
  });
}

/**
 * Heurist confirmation dialog (HMsg): resolves true for the confirm button.
 *
 * @param {string} message Question.
 * @returns {Promise<boolean>}
 */
function confirmDialog(message) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      HMsg.closeMsgDlg?.();
      resolve(value);
    };
    const text = document.createElement('div');
    text.textContent = message;
    const dialog = HMsg.showMsgDlg(text, {
      message: true,
      title: 'Please confirm',
      buttons: [
        { label: $HR('Remove'), class: 'h-btn h-btn-primary', onClick: () => finish(true) },
        { label: $HR('Cancel'), class: 'h-btn', onClick: () => finish(false) }
      ]
    });
    dialog?.addEventListener?.('close', () => finish(false), { once: true });
  });
}

/**
 * Message of an error for the user: the server's message (without the API client's
 * "Heurist API request failed:" prefix), else the error text.
 *
 * @param {*} error Error or HeuristApiError.
 * @returns {string}
 */
function errorText(error) {
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

/** "12 KB" */
function formatSize(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

/** 50 → "50", 1000 → "1K", 500000 → "500K". */
function formatCount(value) {
  return value >= 1000 ? `${value / 1000}K` : String(value);
}
