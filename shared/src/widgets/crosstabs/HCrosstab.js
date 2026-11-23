/**
 * @file HCrosstab.js
 * @brief A crosstab (plan 27q2): the counts (or a measure) of the records of a query by the buckets of up to three
 *        fields, as a table (DataTables, export) and / or a chart (Chart.js). Used by the Explorer tool pane and the
 *        website element `crosstabs`.
 *
 * What the user can change depends on the level (§10): `view` — Table / Chart and the exports; `display` (default) —
 * also values, totals, percentages, blank rows, chart type, swap rows and columns; `pivot` — also the fields of rows,
 * columns and pages and the measure, from the lists of the settings (`visitor.fields`, `visitor.measures`). The page
 * (Var 3) is chosen above the table; *All values* shows one table with the pages merged (a request without pages, so a
 * record is counted once). More records than `autoLimit`: the Update button counts them. Only the records of the record
 * type of the settings (`fields.rectype`) are counted (plan 27q2 §17). Stop while calculating aborts the request.
 *
 *   const widget = new HCrosstab().attach(host, { service, settings, labels, fieldLabel, level: 'display' }).render();
 *   await widget.setQuery([{ t: '10' }]);
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { HBaseWidget } from '../HBaseWidget.js';
import { $HR } from '../../ui/i18n/HResource.js';
import { recordTypeQuery } from '../../data/presentationSource.js';
import {
  CROSSTAB_AUTO_LIMIT, CROSSTAB_CHARTS, CROSSTAB_LEVELS, CROSSTAB_MEASURES, crosstabCellQuery, crosstabChartData,
  crosstabRequest, crosstabTables, normalizeCrosstabSettings
} from './crosstabModel.js';
import { enhanceCrosstabTable, renderCrosstabTable } from './crosstabTable.js';
import { chartColors, createCrosstabChart, crosstabChartConfig } from './crosstabChart.js';
import './HCrosstab.css';

const CHART_LABELS = Object.freeze({
  bar: 'Bars', stackedBar: 'Stacked bars', horizontalBar: 'Horizontal bars', line: 'Line', pie: 'Pie', doughnut: 'Doughnut'
});
const MEASURE_LABELS = Object.freeze({ count: 'Count', sum: 'Sum', avg: 'Average', min: 'Minimum', max: 'Maximum' });
// Totals after Column % (review 2026-11-22)
const DISPLAY_LABELS = Object.freeze([
  ['values', 'Values'], ['percentRow', 'Row %'], ['percentColumn', 'Column %'], ['totals', 'Totals'], ['showBlanks', 'Blank rows']
]);
/** The page index of *All values* (the pages merged). */
const ALL_PAGES = -1;

/** Crosstab widget. */
export class HCrosstab extends HBaseWidget {
  /**
   * @param {HTMLElement} container
   * @param {object} options
   * @param {object} options.service CrosstabService.
   * @param {object|string} [options.settings] Crosstab settings.
   * @param {*} [options.query] The query (JSON or text); setQuery changes it.
   * @param {string} [options.level] Highest level for this place (the settings may lower it): view | display | pivot.
   * @param {{termLabel?: Function, rectypeName?: Function, userGroupName?: Function}} [options.labels] Bucket labels.
   * @param {(code: string) => string} [options.fieldLabel] Caption of a field path code.
   * @param {(query: Array, title: string) => void} [options.onCellQuery] A click on a count: its records (drill-down).
   * @param {number|string} [options.autoLimit] Records counted without Update (0 / `manual`: never, Infinity / `always`).
   * @param {string} [options.language]
   * @param {string} [options.database] For the export header.
   * @param {string} [options.emptyText] Shown without a query.
   * @returns {HCrosstab}
   */
  attach(container, options = {}) {
    super.attach(container, options);
    this.settings = normalizeCrosstabSettings(options.settings || null);
    this.query = options.query ?? null;
    this._reset();
    return this;
  }

  /** @returns {HCrosstab} */
  render() {
    const root = this.container;
    root.classList.add('h-widget', 'h-crosstab');
    this.titleElement = element('div', 'h-crosstab-title');
    this.controls = element('div', 'h-crosstab-controls');
    // the second line: Rows / Columns / Pages to choose, or their fields as text (review 2026-11-23)
    this.pivotBar = element('div', 'h-crosstab-pivot');
    this.status = element('div', 'h-crosstab-status');
    this.pageBar = element('div', 'h-crosstab-pages');
    this.body = element('div', 'h-crosstab-body');
    this.tableHost = element('div', 'h-crosstab-tables');
    this.chartHost = element('div', 'h-crosstab-chart');
    this.canvas = element('canvas');
    this.chartHost.append(this.canvas);
    this.body.append(this.tableHost, this.chartHost);
    root.replaceChildren(this.titleElement, this.controls, this.pivotBar, this.status, this.pageBar, this.body);
    this.state = 'rendered';
    this._renderControls();
    if (this.query != null) void this.load();
    else this._message(this.options.emptyText || 'No records');
    return this;
  }

  /**
   * New settings (the visitor's changes are dropped).
   *
   * @param {object|string} settings
   * @param {{reload?: boolean}} [options] reload: false keeps the answer (display only).
   * @returns {Promise<void>}
   */
  async setSettings(settings, { reload = true } = {}) {
    const before = JSON.stringify(crosstabRequest(this.settings));
    this.settings = normalizeCrosstabSettings(settings);
    this._reset();
    this._renderControls();
    if (reload && JSON.stringify(crosstabRequest(this.settings)) !== before) await this.load();
    else this._renderResult();
  }

  /**
   * Count the records of another query.
   *
   * @param {*} query
   * @param {{count?: number|null}} [options] count: the number of records counted when the host knows it already (the
   *        record types of Explorer's result): the request `op=count` before the crosstab is not sent.
   * @returns {Promise<void>}
   */
  async setQuery(query, { count = null } = {}) {
    this.query = query ?? null;
    this.pageIndex = 0;
    await this.load({ count });
  }

  /**
   * Count again (also above the limit).
   *
   * @param {{force?: boolean, count?: number|null}} [options] force: also above the limit; count: the number of records
   *        when known (no `op=count` request).
   * @returns {Promise<void>}
   */
  async load({ force = false, count: known = null } = {}) {
    this._abort?.abort();
    this._merged = null;
    if (!this.container) return;
    const request = this._request();
    if (this.query == null || this.query === '') {
      this.answer = null;
      this._clearOutput();
      this._message(this.options.emptyText || 'No records');
      return;
    }
    if (!request) {
      this.answer = null;
      this._clearOutput();
      this._message('Choose the field of the rows');
      return;
    }
    const abort = new AbortController();
    this._abort = abort;
    this._busy();
    const query = this.countedQuery();
    try {
      const limit = autoLimit(this.options.autoLimit);
      // Always (no limit): no count first
      if (!force && limit !== Infinity) {
        const count = Number.isFinite(known) ? known : await this.options.service.count(query, { signal: abort.signal });
        if (abort.signal.aborted) return;
        if (count > limit) {
          this.answer = null;
          this._clearOutput();
          this._update(count);
          return;
        }
      }
      const answer = await this.options.service.tabulate(query, request, { signal: abort.signal });
      if (abort.signal.aborted || !this.container) return;
      this.answer = answer;
      if (!answer?.pages && this.pageIndex === ALL_PAGES) this.pageIndex = 0;
      this._renderResult();
    } catch (error) {
      if (abort.signal.aborted || error?.name === 'AbortError') return;
      this.answer = null;
      this._clearOutput();
      this._message(error?.message || String(error), false, true);
    }
  }

  /** @returns {object|null} The answer shown now. */
  getAnswer() {
    return this.answer;
  }

  /**
   * The records counted: the query AND the record type of the settings.
   *
   * @returns {*} The query (null without one).
   */
  countedQuery() {
    return recordTypeQuery(this.query, this.settings.fields.rectype);
  }

  /**
   * No records: the output is removed and a message shown (a query that needs values, a result without the record type).
   *
   * @param {string} [text] Message (translated here).
   * @returns {void}
   */
  clear(text = '') {
    this._abort?.abort();
    this.query = null;
    this.answer = null;
    this._merged = null;
    this._clearOutput();
    this._message(text || this.options.emptyText || 'No records');
  }

  /** Stop the calculation (the request is aborted; in Explorer the server query is cancelled too). */
  stop() {
    if (!this._abort || this._abort.signal.aborted) return;
    this._abort.abort();
    this._message('Stopped');
    this._updateButton();
  }

  /** @returns {Promise<void>} */
  async destroy() {
    this._abort?.abort();
    this._destroyOutput();
    await super.destroy();
  }

  // ------------------------------------------------------------------ state

  /** @private The visitor's choices back to the settings. */
  _reset() {
    this.pivot = {};
    this.display = { ...this.settings.display };
    this.chartType = this.settings.chart.type;
    this.show = this.settings.chart.show;
    this.pageIndex = 0;
  }

  /** @private The level: the lower of the place (option) and the settings. */
  _level() {
    const place = CROSSTAB_LEVELS.indexOf(this.options.level || 'pivot');
    const stored = CROSSTAB_LEVELS.indexOf(this.settings.visitor.level);
    return CROSSTAB_LEVELS[Math.min(place < 0 ? 2 : place, stored < 0 ? 1 : stored)];
  }

  /** @private The request with the visitor's pivot. */
  _request() {
    return crosstabRequest(this.settings, this.pivot);
  }

  /** @private A dimension with the visitor's choice. */
  _dimension(name) {
    return Object.hasOwn(this.pivot, name) ? this.pivot[name] : this.settings[name];
  }

  /** @private The caption of a dimension: its label, else the name of its field. */
  _caption(name) {
    const dimension = this._dimension(name);
    if (!dimension) return '';
    const label = dimension.label?.[this.options.language] || dimension.label?.def;
    return label || this.options.fieldLabel?.(dimension.code) || dimension.code;
  }

  /** @private Count, or Sum of … */
  _valueCaption() {
    const measure = this.pivot.measure || this.settings.measure;
    if (!measure || measure.op === 'count') return $HR('Count');
    const field = this.options.fieldLabel?.(String(measure.field)) || String(measure.field);
    return `${$HR(MEASURE_LABELS[measure.op] || measure.op)} ${$HR('of')} ${field}`;
  }

  // ------------------------------------------------------------------ controls

  /** @private The controls of the level. */
  _renderControls() {
    if (!this.controls) return;
    const level = CROSSTAB_LEVELS.indexOf(this._level());
    const bar = this.controls;
    bar.replaceChildren();
    const title = this.settings.display.title?.[this.options.language] || this.settings.display.title?.def || '';
    this.titleElement.textContent = title;
    this.titleElement.hidden = !title;
    // Table | Chart | Both
    const show = select('Show', [['table', 'Table'], ['chart', 'Chart'], ['both', 'Table and chart']], this.show, (value) => {
      this.show = value;
      this._renderResult();
    });
    bar.append(show);
    if (level >= 1) {
      bar.append(select('Chart', CROSSTAB_CHARTS.map((type) => [type, CHART_LABELS[type]]), this.chartType, (value) => {
        this.chartType = value;
        this._renderChart();
      }));
      const flags = element('div', 'h-crosstab-flags');
      for (const [key, label] of DISPLAY_LABELS) {
        flags.append(checkbox(label, this.display[key] === true, (checked) => {
          this.display[key] = checked;
          this._renderResult();
        }));
      }
      bar.append(flags);
      if (this._dimension('columns')) {
        const swap = element('button', 'h-btn h-compact');
        swap.type = 'button';
        swap.title = $HR('Swap rows and columns');
        swap.innerHTML = '<i class="fa-solid fa-right-left" aria-hidden="true"></i>';
        swap.setAttribute('aria-label', swap.title);
        swap.addEventListener('click', () => {
          const rows = this._dimension('rows');
          this.pivot = { ...this.pivot, rows: this._dimension('columns'), columns: rows };
          this._renderControls();
          void this.load();
        });
        bar.append(swap);
      }
    }
    this._renderPivot(level >= 2);
  }

  /**
   * @private The second line: Rows / Columns / Pages (and the measure) to choose from the lists of the settings when the
   * visitor may pivot, else the fields of the dimensions as text.
   * @param {boolean} allowed The level allows pivoting.
   */
  _renderPivot(allowed) {
    const bar = this.pivotBar;
    if (!bar) return;
    bar.replaceChildren();
    const fields = [...new Set([...this.settings.visitor.fields,
      ...['rows', 'columns', 'pages'].map((name) => this.settings[name]?.code).filter(Boolean)])];
    bar.classList.toggle('is-readonly', !allowed);
    if (!allowed) {
      for (const [name, label] of [['rows', 'Rows'], ['columns', 'Columns'], ['pages', 'Pages']]) {
        const caption = this._caption(name);
        if (!caption) continue;
        const item = element('span', 'h-crosstab-pivot-item');
        const term = element('span', 'h-crosstab-pivot-label');
        term.textContent = `${$HR(label)}:`;
        const value = element('span', 'h-crosstab-pivot-value');
        value.textContent = caption;
        item.append(term, value);
        bar.append(item);
      }
      bar.hidden = !bar.childElementCount;
      return;
    }
    bar.hidden = false;
    if (fields.length) {
      const dimensionOf = (code) => ['rows', 'columns', 'pages'].map((name) => this.settings[name])
        .find((dimension) => dimension?.code === code) || { code, label: {}, buckets: 'values' };
      for (const [name, label] of [['rows', 'Rows'], ['columns', 'Columns'], ['pages', 'Pages']]) {
        const choices = [...(name === 'rows' ? [] : [['', '(none)']]),
          ...fields.map((code) => [code, this.options.fieldLabel?.(code) || code])];
        bar.append(select(label, choices, this._dimension(name)?.code || '', (value) => {
          this.pivot = { ...this.pivot, [name]: value ? dimensionOf(value) : null };
          this.pageIndex = 0;
          this._renderControls();
          void this.load();
        }));
      }
    }
    const measures = [...new Set(['count', ...this.settings.visitor.measures])].filter((op) => op === 'count' || this.settings.measure.field);
    if (measures.length > 1) {
      const current = (this.pivot.measure || this.settings.measure).op;
      bar.append(select('Measure', measures.filter((op) => CROSSTAB_MEASURES.includes(op)).map((op) => [op, MEASURE_LABELS[op]]),
        current, (value) => {
          this.pivot = { ...this.pivot, measure: { op: value, field: this.settings.measure.field } };
          void this.load();
        }));
    }
  }

  // ------------------------------------------------------------------ output

  /** @private Table(s) and chart of the answer. */
  _renderResult() {
    if (!this.answer || !this.container) return;
    const labels = {
      termLabel: this.options.labels?.termLabel, rectypeName: this.options.labels?.rectypeName,
      userGroupName: this.options.labels?.userGroupName, translate: $HR
    };
    this.pageTables = crosstabTables(this.answer, { display: this.display }, labels);
    const merged = this.pageIndex === ALL_PAGES && Boolean(this.answer.pages);
    if (merged && !this._merged) {
      void this._loadMerged();
      return;
    }
    this.tables = merged ? crosstabTables(this._merged, { display: this.display }, labels) : this.pageTables;
    if (!merged) this.pageIndex = Math.min(Math.max(0, this.pageIndex), Math.max(0, this.tables.tables.length - 1));
    this._message(`${$HR('Records')}: ${this.tables.total.toLocaleString()} · ${this._valueCaption()}`);
    this._renderPages();
    this.tableHost.hidden = this.show === 'chart';
    this.chartHost.hidden = this.show === 'table';
    void this._renderTable();
    this._renderChart();
  }

  /** @private The page selector (Var 3): All values (the pages merged), then each page. */
  _renderPages() {
    this.pageBar.replaceChildren();
    const shown = this.pageTables?.tables || [];
    this.pageBar.hidden = !this.answer?.pages;
    if (!this.answer?.pages) return;
    const choices = [[String(ALL_PAGES), 'All values'], ...shown.map((table, index) => [String(index), table.page.label])];
    this.pageBar.append(select(this._caption('pages'), choices, String(this.pageIndex), (value) => {
      this.pageIndex = Number(value);
      if (!Number.isInteger(this.pageIndex)) this.pageIndex = 0;
      this._renderResult();
    }));
  }

  /** @private The index of the table shown in `this.tables` (one table when the pages are merged). */
  _tableIndex() {
    return this.pageIndex === ALL_PAGES ? 0 : this.pageIndex;
  }

  /** @private All values of the pages: the crosstab without pages (a record is counted once). */
  async _loadMerged() {
    const request = crosstabRequest(this.settings, { ...this.pivot, pages: null });
    if (!request) return;
    this._abort?.abort();
    const abort = new AbortController();
    this._abort = abort;
    this._busy();
    try {
      const answer = await this.options.service.tabulate(this.countedQuery(), request, { signal: abort.signal });
      if (abort.signal.aborted || !this.container) return;
      this._merged = answer;
      this._renderResult();
    } catch (error) {
      if (abort.signal.aborted || error?.name === 'AbortError') return;
      this._message(error?.message || String(error), false, true);
    }
  }

  /** @private The table of the page shown. */
  async _renderTable() {
    const serial = (this._tableSerial = (this._tableSerial || 0) + 1);
    this._table?.destroy();
    this._table = null;
    this.tableHost.replaceChildren();
    const table = this.tables?.tables?.[this._tableIndex()];
    if (!table) {
      this.tableHost.textContent = $HR('No records');
      return;
    }
    if (!table.rows.length) {
      this.tableHost.textContent = $HR('No values');
      return;
    }
    const drill = typeof this.options.onCellQuery === 'function' && this.settings.visitor.drill !== false
      ? (cell) => this._drill(cell, table) : null;
    const element$ = renderCrosstabTable(table, this.tables, {
      display: this.display,
      rowCaption: this._caption('rows'),
      columnCaption: this._caption('columns'),
      valueCaption: this._valueCaption(),
      translate: $HR,
      language: this.options.language,
      onCell: drill
    });
    this.tableHost.append(element$);
    if (this.options.enhance === false) return;
    const exports = this.settings.visitor.export.filter((item) => item !== 'png');
    const page = table.page.label ? ` – ${this._caption('pages')}: ${table.page.label}` : '';
    const title = `${this.settings.display.title?.def || this._caption('rows')}${page}`;
    const enhanced = await enhanceCrosstabTable(element$, { exports, title, messageTop: this._exportHeader(), filename: fileName(title) });
    if (serial !== this._tableSerial) enhanced?.destroy();
    else this._table = enhanced;
  }

  /** @private The chart of the page shown. */
  _renderChart() {
    const serial = (this._chartSerial = (this._chartSerial || 0) + 1);
    const table = this.tables?.tables?.[this._tableIndex()];
    if (this.show === 'table' || !table?.rows?.length || this.options.enhance === false) {
      this._chart?.destroy();
      this._chart = null;
      this.chartHost.querySelector('.h-crosstab-png')?.remove();
      return;
    }
    const data = crosstabChartData(table, this.tables, this._valueCaption());
    const config = crosstabChartConfig(this.chartType, data, {
      title: table.page.label || '',
      totals: table.rows.map((row) => row.total.value),
      totalsLabel: this._valueCaption(),
      colors: chartColors(this.container),
      onClick: typeof this.options.onCellQuery === 'function' && this.settings.visitor.drill !== false
        ? (index, datasetIndex) => {
          const row = table.rows[index];
          const column = this.tables.hasColumns && !['pie', 'doughnut'].includes(this.chartType) ? table.columns[datasetIndex] : null;
          if (row) this._drill({ row: row.index, column: column ? column.index : null }, table);
        } : null
    });
    const draw = async () => {
      if (this._chart) this._chart.update(config);
      else this._chart = await createCrosstabChart(this.canvas, config);
      if (serial !== this._chartSerial) return;
      if (this.settings.visitor.export.includes('png') && !this.chartHost.querySelector('.h-crosstab-png')) {
        const png = element('button', 'h-btn h-compact h-crosstab-png');
        png.type = 'button';
        png.textContent = $HR('PNG');
        png.title = $HR('Save the chart as an image');
        png.addEventListener('click', () => download(this._chart?.png(), `${fileName(this._caption('rows'))}.png`));
        this.chartHost.prepend(png);
      }
    };
    draw().catch((error) => {
      console.warn('Crosstab: the chart can not be drawn', error);
      this.chartHost.hidden = true;
    });
  }

  /** @private A click on a count: the query of the cell to the host. */
  _drill({ row = null, column = null }, table) {
    const merged = this.pageIndex === ALL_PAGES;
    const page = this.answer?.pages && !merged ? table.page.index : null;
    const query = crosstabCellQuery(this.countedQuery(), merged ? this._merged : this.answer, { row, column, page });
    if (!query) return;
    const label = (name, index) => (index == null ? '' : this.tables?.[name]?.find((item) => item.index === index)?.label || '');
    const title = [label('rows', row), label('columns', column), table.page.label].filter(Boolean).join(' × ');
    this.options.onCellQuery(query, title);
  }

  /** @private Database, date, number of records, query, measure (legacy export header). */
  _exportHeader() {
    const parts = [];
    if (this.options.database) parts.push(`${$HR('Database')}: ${this.options.database}`);
    parts.push(new Date().toLocaleDateString());
    parts.push(`N = ${this.tables?.total ?? 0}`);
    parts.push(this._valueCaption());
    const query = this.countedQuery();
    if (query != null) parts.push(`${$HR('Query')}: ${typeof query === 'string' ? query : JSON.stringify(query)}`);
    return parts.join(', ');
  }

  /** @private The status line. */
  _message(text, busy = false, error = false) {
    if (!this.status) return;
    // while calculating: the spinner big in the middle, the old table and chart hidden (review 5)
    this.container?.classList.toggle('is-busy', busy);
    this.status.replaceChildren();
    this.status.classList.toggle('is-error', error);
    if (busy) this.status.append(element('i', 'fa-solid fa-spinner fa-spin h-crosstab-spinner'), document.createTextNode(' '));
    const caption = element('span', 'h-crosstab-status-text');
    caption.textContent = $HR(text);
    this.status.append(caption);
  }

  /** @private Calculating…, with Stop. */
  _busy() {
    this._message('Calculating…', true);
    const button = element('button', 'h-btn h-compact h-crosstab-stop');
    button.type = 'button';
    button.textContent = $HR('Stop');
    button.title = $HR('Stop the calculation');
    button.addEventListener('click', () => this.stop());
    this.status.append(document.createTextNode(' '), button);
  }

  /** @private More records than the limit: Update. */
  _update(count) {
    this._message(`${$HR('Records')}: ${count.toLocaleString()}. ${$HR('Counting may take a while.')}`);
    this._updateButton();
  }

  /** @private The Update button in the status line (counts also above the limit). */
  _updateButton() {
    const button = element('button', 'h-btn h-btn-primary h-compact');
    button.type = 'button';
    button.textContent = $HR('Update');
    button.addEventListener('click', () => void this.load({ force: true }));
    this.status.append(document.createTextNode(' '), button);
  }

  /** @private Empty output. */
  _clearOutput() {
    this._destroyOutput();
    this.tableHost?.replaceChildren();
    this.pageBar?.replaceChildren();
  }

  /** @private DataTable and chart away. */
  _destroyOutput() {
    this._table?.destroy();
    this._table = null;
    this._chart?.destroy();
    this._chart = null;
    this.chartHost?.querySelector('.h-crosstab-png')?.remove();
  }
}

/**
 * The records counted without Update (option `autoLimit`): 0 never, Infinity always, else the number; the default without
 * a value.
 *
 * @param {*} value
 * @returns {number}
 */
export function autoLimit(value) {
  if (value === Infinity || value === 'always') return Infinity;
  if (value === 0 || value === '0' || value === 'manual') return 0;
  const limit = Number(value);
  return Number.isFinite(limit) && limit > 0 ? limit : CROSSTAB_AUTO_LIMIT;
}

/** A labelled select. */
function select(label, choices, value, onChange) {
  const wrap = element('label', 'h-crosstab-control');
  const caption = element('span');
  caption.textContent = $HR(label);
  const input = element('select', 'h-select h-compact');
  for (const [id, text] of choices) {
    const option = element('option');
    option.value = id;
    option.textContent = $HR(text);
    input.append(option);
  }
  input.value = value ?? '';
  input.addEventListener('change', () => onChange(input.value));
  wrap.append(caption, input);
  return wrap;
}

/** A labelled checkbox. */
function checkbox(label, checked, onChange) {
  const wrap = element('label', 'h-crosstab-check');
  const input = element('input', 'h-checkbox');
  input.type = 'checkbox';
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  const caption = element('span');
  caption.textContent = $HR(label);
  wrap.append(input, caption);
  return wrap;
}

function element(tag, className = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

/** A file name of a title. */
function fileName(text) {
  return String(text || 'crosstab').replace(/[^\p{L}\p{N}_ -]+/gu, '').trim().slice(0, 80) || 'crosstab';
}

/** Save a data URL as a file. */
function download(url, name) {
  if (!url) return;
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
}
