/**
 * @file ExportTool.js
 * @brief Export tool of Explorer Tools mode: exports the current DataSource into a file.
 *
 * Loaded lazily by ExplorerApplication.openTool('export') (plan 13). Sections:
 * - Scope: current result, selection, or one record type of the result;
 * - Format;
 * - Columns (CSV, TSV, GeoJSON, KML, Gephi): one field list per record type, pre-filled
 *   from the DataSource column fields;
 * - Expansion: none, "any" link kind with a depth, the DataSource rules, or custom rules
 *   (rule builder dialog, for this export only);
 * - Value formats (formats with columns only; JSON and HML write values as stored);
 * - Additional properties: CSV options (CSV, TSV) or names and local ids (JSON, HML);
 * - Output: record limit (Gephi at most 10K) and file name.
 * The tool follows DataSource, selection and rule changes (ExplorerApplication registers
 * it with the SyncEngine). The export runs as the background job "export"; HJobMonitor
 * shows progress, Stop and the download link, also after a page reload. The last
 * settings are remembered per DataSource in the browser.
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
import { $HR } from '#shared/ui';
import { HFieldSelectionEditor } from '../../widgets/query-source/helpers/HFieldSelectionEditor.js';
import { HRuleBuilder, describeExpansionRule } from '../../widgets/query-source/helpers/HRuleBuilder.js';
import {
  ANY_DEPTHS, ANY_LINK_KINDS, EXPORT_FORMATS, VALUE_CHOICES, buildExportParams, columnsForRecordType,
  defaultExportState, effectiveLimit, exportFormat, exportProblems, limitChoices, recordTypeList, scopeRecordType
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
    this.editors = new Map();
    this.monitor = null;
    this.runningJob = null;
  }

  /**
   * Build the form for the current DataSource and restore a running export.
   *
   * @returns {Promise<ExportTool>} this.
   */
  async render() {
    if (!this.container) throw new Error('ExportTool must be attached before render');
    this.container.classList.add('h-export-tool');
    this.container.textContent = $HR('Loading...');
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
    await this._restoreJob();
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
    if (this.isRunning()) this._follow(this.runningJob);
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
      total: Number(this.source?.meta?.count)
    };
  }

  /** Record types of the current result with counts (`/records detail=rectypes`). */
  async _loadRecordTypes() {
    const query = this._context().query;
    this.recordTypes = [];
    if (query == null || query === '') return;
    try {
      const response = await this.apiClient.post('/records', { body: { q: query, detail: 'rectypes' } });
      this.recordTypes = recordTypeList(response?.rectypes || response?.data?.rectypes, this.dbdefs);
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
    const root = this.container;
    for (const editor of this.editors.values()) editor.destroy?.();
    this.editors.clear();
    root.replaceChildren();
    const context = this._context();

    const intro = element('div', 'h-export-intro');
    intro.textContent = context.query == null
      ? $HR('There is no current result. Run a search first.')
      : `${$HR('Data source')}: ${context.title || $HR('Current result')} · ${this._total()} ${$HR('records')}`;
    root.append(intro);

    const sections = element('div', 'h-export-sections');
    this._rulesSection = fieldset($HR('Expansion rules'));
    sections.append(
      this._scopeSection(),
      this._formatSection(),
      this._columnsSection(),
      this._rulesSection,
      this._valuesSection(),
      this._propertiesSection(),
      this._outputSection()
    );
    root.append(sections);
    this._renderRulesSection();

    const footer = element('div', 'h-export-footer');
    this._problems = element('div', 'h-export-problems');
    this._exportButton = element('button', 'h-btn h-btn-primary h-export-start');
    this._exportButton.type = 'button';
    this._exportButton.innerHTML = '<span class="fa-solid fa-file-export" aria-hidden="true"></span> ';
    this._exportButton.append(document.createTextNode($HR('Export')));
    this._exportButton.addEventListener('click', () => this._start());
    this._monitorBox = element('div', 'h-export-monitor');
    footer.append(this._problems, this._exportButton, this._monitorBox);
    root.append(footer);
    this._refresh();
  }

  _total() {
    const total = Number(this.source?.meta?.count);
    return Number.isFinite(total) ? total : this.recordTypes.reduce((sum, item) => sum + item.count, 0);
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
    const sourceFields = this.source?.presentation?.data?.fields || [];
    const fromSource = checkbox($HR('Use the column fields of the data source'),
      this.settings.useColumns && sourceFields.length > 0, (checked) => {
        this.settings.useColumns = checked;
        if (checked) this._fillColumnsFromSource(true);
        this._renderColumnEditors();
        this._refresh();
      });
    fromSource.input.disabled = !sourceFields.length;
    fromSource.title = sourceFields.length ? '' : $HR('The data source has no column fields');
    this._columnsNote = element('div', 'h-muted h-export-note');
    this._editorsBox = element('div', 'h-export-editors');
    section.append(fromSource, this._columnsNote, this._editorsBox);
    if (this.settings.useColumns && !Object.keys(this.settings.columns).length) this._fillColumnsFromSource(false);
    this._renderColumnEditors();
    return section;
  }

  /** Columns of each record type from the DataSource column fields. */
  _fillColumnsFromSource(replace) {
    const fields = this.source?.presentation?.data?.fields || [];
    for (const item of this.recordTypes) {
      if (!replace && this.settings.columns[item.id]?.length) continue;
      this.settings.columns[item.id] = columnsForRecordType(fields, item.id, this.dbdefs);
    }
  }

  /** One collapsible column editor per record type in scope. */
  _renderColumnEditors() {
    if (!this._editorsBox) return;
    const format = exportFormat(this.settings.format);
    for (const editor of this.editors.values()) editor.destroy?.();
    this.editors.clear();
    this._editorsBox.replaceChildren();
    this._columnsSectionEl.hidden = !format.columns;
    if (!format.columns) return;
    this._columnsNote.textContent = format.required
      ? $HR('Choose the columns for each record type. The first column is always H-ID (record ID).')
      : $HR('Optional: fields written as properties / attributes. Leave empty for ID, type and title only.');
    if (!this.dbdefs) {
      this._editorsBox.textContent = $HR('Database definitions are not available');
      return;
    }
    const types = this._scopeRecordTypes();
    types.forEach((item, index) => {
      const details = element('details', 'h-export-rectype');
      details.open = index === 0 || types.length <= 3;
      const summary = element('summary', 'h-export-rectype-summary');
      const caption = () => {
        summary.textContent = `${item.name} (${item.count}) · ${(this.settings.columns[item.id] || []).length} ${$HR('columns')}`;
      };
      caption();
      const body = element('div', 'h-export-rectype-body');
      details.append(summary, body);
      const mountEditor = () => {
        if (this.editors.has(item.id)) return;
        const editor = new HFieldSelectionEditor({
          dbdefs: this.dbdefs,
          title: $HR('Columns'),
          includeHeaders: true,
          allowReorder: true,
          multiSelect: true,
          removeAll: true,
          onChange: (fields) => {
            this.settings.columns[item.id] = fields.map(({ field, title, ext }) => ({ field, title, ...(ext ? { ext } : {}) }));
            caption();
            this._refresh();
          }
        });
        editor.setRecordType(item.id).setValue(this.settings.columns[item.id] || []);
        editor.attach(body);
        editor.render();
        this.editors.set(item.id, editor);
      };
      if (details.open) mountEditor();
      details.addEventListener('toggle', () => { if (details.open) mountEditor(); });
      this._editorsBox.append(details);
    });
    if (!types.length) this._editorsBox.textContent = $HR('No record types in scope');
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
      const group = document.createElement('optgroup');
      group.label = $HR('Any');
      addOptions(group, ANY_LINK_KINDS.map(([value, text]) => [value, $HR(text)]));
      kind.append(group);
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
    const captions = { date: 'Dates', file: 'Files', pointer: 'Record pointers', enum: 'Terms (vocabularies)' };
    for (const [kind, choices] of Object.entries(VALUE_CHOICES)) {
      const select = element('select', `h-select h-export-value-${kind}`);
      addOptions(select, choices.map(([value, text]) => [value, $HR(text)]));
      select.value = this.settings.values[kind] || choices[0][0];
      select.addEventListener('change', () => { this.settings.values[kind] = select.value; });
      section.append(labelled($HR(captions[kind]), select));
    }
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
    mvsep.maxLength = 5;
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
    note.textContent = $HR('The file is created on the server; only you can download it. It is kept for 7 days.');
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
    this.settings.limit = effectiveLimit(this.settings.limit, format);
    if (!choices.includes(this.settings.limit)) this.settings.limit = choices.at(-1);
    select.value = String(this.settings.limit);
  }

  /** Show or hide format-dependent parts and the problems; enable Export. */
  _refresh() {
    const format = exportFormat(this.settings.format);
    const table = format.value === 'csv' || format.value === 'tsv';
    if (this._valuesSectionEl) this._valuesSectionEl.hidden = !format.columns;
    if (this._propertiesSectionEl) this._propertiesSectionEl.hidden = !table && !format.names;
    if (this._csvBox) this._csvBox.hidden = !table;
    if (this._csvSep) this._csvSep.hidden = format.value === 'tsv';
    if (this._namesBox) this._namesBox.hidden = !format.names;
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
    if (!this._problems) return;
    const problems = exportProblems(this.settings, this._context());
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

  /** Show a job with progress, Stop and the download link. */
  _follow(job) {
    this.runningJob = job;
    this.monitor?.destroy?.();
    this.monitor = new HJobMonitor();
    this.monitor.attach(this._monitorBox, {
      jobClient: this.jobs,
      onFinish: (finished) => { this.runningJob = finished; this._refresh(); }
    });
    this.monitor.follow(job).catch((error) => this._showError(error));
    this._refresh();
  }

  /** After a page reload: show the user's running export. */
  async _restoreJob() {
    try {
      const jobs = await this.jobs.list();
      const running = (Array.isArray(jobs) ? jobs : []).find((job) => job.type === 'export'
        && ACTIVE_JOB_STATUSES.includes(job.status));
      if (running) this._follow(running);
    } catch (error) {
      console.warn('Export: running jobs are not available', error);
    }
  }

  _showError(error) {
    const box = element('div', 'h-export-problem h-export-error');
    box.textContent = error?.message || String(error);
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
          columns: saved.columns && typeof saved.columns === 'object' ? saved.columns : {}
        });
      }
    } catch {
      // private window or blocked storage: defaults
    }
    if (!(this.source?.presentation?.data?.fields || []).length) state.useColumns = false;
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

/** 1000 → "1K", 500000 → "500K". */
function formatCount(value) {
  return value >= 1000 ? `${value / 1000}K` : String(value);
}
