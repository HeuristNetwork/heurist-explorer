/**
 * @file ExportTool.js
 * @brief Export tool of Explorer Tools mode: exports the current DataSource into a file.
 *
 * Loaded lazily by ExplorerApplication.openTool('export') (plan 13). Sections:
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
 * it with the SyncEngine). Toolbar on top: Export, and Export results (dropdown of the
 * user's finished exports: download, delete). The export runs as the background job
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
import { HFieldSelectionEditor } from '../../widgets/query-source/helpers/HFieldSelectionEditor.js';
import { HRuleBuilder, describeExpansionRule } from '../../widgets/query-source/helpers/HRuleBuilder.js';
import {
  ANY_DEPTHS, ANY_LINK_KINDS, COLUMN_MODES, EXPORT_FORMATS, VALUE_CHOICES, buildExportParams, dataSourceFields,
  defaultExportState, defaultLimit, effectiveLimit, exportFormat, exportProblems, limitChoices, recordTypeList,
  scopeRecordType
} from './exportParams.js';
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
   */
  constructor({ apiClient, getDbDefs, getDataSource, getSelection, database = '', language = 'eng', jobClient = null } = {}) {
    super();
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
    this._exportButton = element('button', 'h-btn h-btn-primary h-export-start');
    this._exportButton.type = 'button';
    this._exportButton.innerHTML = '<span class="fa-solid fa-file-export" aria-hidden="true"></span> ';
    this._exportButton.append(document.createTextNode($HR('Export')));
    this._exportButton.addEventListener('click', () => this._start());
    this._resultsButton = element('button', 'h-btn h-export-results-button');
    this._resultsButton.type = 'button';
    this._resultsButton.innerHTML = '<span class="fa-solid fa-folder-open" aria-hidden="true"></span> ';
    this._resultsButton.append(document.createTextNode(`${$HR('Export results')} `));
    this._resultsButton.insertAdjacentHTML?.('beforeend', '<span class="fa-solid fa-caret-down" aria-hidden="true"></span>');
    this._resultsButton.addEventListener('click', () => this._toggleResults());
    this._toolbar.append(this._exportButton, this._resultsButton);
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

  /** Record types of the current result with counts (`/records detail=rectypes`). */
  async _loadRecordTypes() {
    const query = this._context().query;
    this.recordTypes = [];
    this.resultTotal = null;
    if (query == null || query === '') return;
    try {
      const response = await this.apiClient.post('/records', { body: { q: query, detail: 'rectypes' } });
      const data = response?.rectypes ? response : response?.data || {};
      this.recordTypes = recordTypeList(data.rectypes, this.dbdefs);
      // the count of the query itself (a direct search has no meta.count)
      const total = Number(data.total);
      this.resultTotal = Number.isFinite(total) ? total : null;
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
    if (this.resultTotal != null) return this.resultTotal;
    const count = this.source?.meta?.count;
    if (count != null && Number.isFinite(Number(count)) && Number(count) > 0) return Number(count);
    return this.recordTypes.reduce((sum, item) => sum + item.count, 0);
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
    const select = this._scopeSelect;
    if (!select) return;
    select.replaceChildren();
    const [, selectionOption] = addOptions(select, [
      ['result', `${$HR('Current result')} (${this._total()})`],
      ['selection', `${$HR('Selection')} (${this.selection.length})`]
    ]);
    selectionOption.disabled = this.selection.length === 0;
    const values = ['result', ...(this.selection.length ? ['selection'] : [])];
    if (this.recordTypes.length) {
      const group = document.createElement('optgroup');
      group.label = $HR('Record type');
      addOptions(group, this.recordTypes.map((item) => [`rt:${item.id}`, `${item.name} (${item.count})`]));
      select.append(group);
      values.push(...this.recordTypes.map((item) => `rt:${item.id}`));
    }
    if (!values.includes(this.settings.scope)) this.settings.scope = 'result';
    select.value = this.settings.scope;
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

    this._namesBox = element('div', 'h-export-props-names');
    const names = checkbox($HR('Include human-readable names and local IDs for everything'), this.settings.names === true,
      (checked) => { this.settings.names = checked; });
    const namesNote = element('div', 'h-muted h-export-note');
    namesNote.textContent = $HR('Without them record types, fields and terms are identified by concept codes only.');
    this._namesBox.append(names, namesNote);

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
    if (this._formatHeader) this._formatHeader.textContent = `${$HR(format.label)} ${$HR('format')}`;
    if (this._formatNote) {
      this._formatNote.textContent = $HR({
        csv: 'One table per record type, first column H-ID.',
        tsv: 'One table per record type, first column H-ID.',
        json: 'All fields of the records; record types, fields and terms with concept codes.',
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

  // ------------------------------------------------------------------ remembered settings

  _storageKey() {
    const key = this.source?.reference?.key || this.source?.title || 'current';
    return `${STORAGE_PREFIX}${this.database}:${key}`;
  }

  _restoreState() {
    const state = defaultExportState();
    try {
      const saved = JSON.parse(globalThis.localStorage?.getItem(this._storageKey()) || 'null');
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
