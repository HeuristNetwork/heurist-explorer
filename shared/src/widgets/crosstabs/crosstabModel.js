/**
 * @file crosstabModel.js
 * @brief Crosstabs (plan 27q2): the settings of a Presentation set of kind Crosstab, the `crosstab` parameter of
 *        `/records/aggregate?op=crosstab`, and the answer turned into tables (labels, totals, percentages), chart data
 *        and the query of a cell. No DOM: used by HCrosstab, the Explorer tool and the website element.
 *
 * Settings (plan 27q2 §5): `rows` / `columns` / `pages` = `{code, label, buckets}` (the form of the request: a field path
 * code of the thematic maps and its buckets, plus a caption), `measure`, `display`, `chart`, `visitor`. The server checks
 * the same form (srv Presentations/CrosstabSettings.php).
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

import { parseRange } from '../../data/ranges/rangeDefinitions.js';

export const CROSSTAB_DIMENSIONS = Object.freeze(['rows', 'columns', 'pages']);
export const CROSSTAB_MEASURES = Object.freeze(['count', 'sum', 'avg', 'min', 'max']);
export const CROSSTAB_LEVELS = Object.freeze(['view', 'display', 'pivot']);
export const CROSSTAB_SHOW = Object.freeze(['table', 'chart', 'both']);
export const CROSSTAB_CHARTS = Object.freeze(['bar', 'stackedBar', 'horizontalBar', 'line', 'pie', 'doughnut']);
export const CROSSTAB_EXPORTS = Object.freeze(['csv', 'xlsx', 'pdf', 'png', 'print']);
export const CROSSTAB_GROUPBY = Object.freeze(['month', 'year', 'decade', 'century']);
/** Most records counted without the Update button (Artem, 2026-11-20). */
export const CROSSTAB_AUTO_LIMIT = 50000;
/** Concept code of the term Crosstab of Presentation Type. */
export const CROSSTAB_TERM = '2-10642';

const DISPLAY_FLAGS = Object.freeze({
  values: true, totals: true, percentRow: false, percentColumn: false, blankZero: true, showBlanks: false
});
const LINKS = Object.freeze({ lt: 'lt', lf: 'lf', rt: 'rt', rf: 'rf', r: 'related' });
const HEADER_FIELDS = Object.freeze(['rectype', 'owner', 'addedby', 'access', 'tag', 'title', 'added', 'modified']);

/**
 * The settings with their defaults; a JSON text is read.
 *
 * @param {object|string|null} raw
 * @returns {{fields: {rectype: number|null}, rows: object|null, columns: object|null, pages: object|null,
 *          measure: {op: string, field: number|null}, display: object, chart: {show: string, type: string},
 *          visitor: {level: string, fields: string[], measures: string[], export: string[], drill: boolean}}}
 */
export function normalizeCrosstabSettings(raw) {
  let source = raw;
  if (typeof source === 'string') {
    try {
      source = source.trim() ? JSON.parse(source) : {};
    } catch {
      source = {};
    }
  }
  if (!isObject(source)) source = {};
  const display = isObject(source.display) ? source.display : {};
  const chart = isObject(source.chart) ? source.chart : {};
  const visitor = isObject(source.visitor) ? source.visitor : {};
  const measure = isObject(source.measure) ? source.measure : {};
  const op = CROSSTAB_MEASURES.includes(measure.op) ? measure.op : 'count';
  const result = {
    fields: { rectype: Number(source.fields?.rectype) > 0 ? Number(source.fields.rectype) : null },
    rows: null,
    columns: null,
    pages: null,
    measure: { op, field: op !== 'count' && Number(measure.field) > 0 ? Number(measure.field) : null },
    display: {
      ...Object.fromEntries(Object.entries(DISPLAY_FLAGS).map(([key, value]) => [key, typeof display[key] === 'boolean' ? display[key] : value])),
      decimals: Number.isInteger(display.decimals) && display.decimals >= 0 && display.decimals <= 6 ? display.decimals : 0,
      title: texts(display.title)
    },
    chart: {
      show: CROSSTAB_SHOW.includes(chart.show) ? chart.show : 'table',
      type: CROSSTAB_CHARTS.includes(chart.type) ? chart.type : 'bar'
    },
    visitor: {
      level: CROSSTAB_LEVELS.includes(visitor.level) ? visitor.level : 'display',
      fields: Array.isArray(visitor.fields) ? visitor.fields.filter((code) => typeof code === 'string' && crosstabCodePath(code)) : [],
      measures: Array.isArray(visitor.measures) ? visitor.measures.filter((item) => CROSSTAB_MEASURES.includes(item)) : [],
      export: Array.isArray(visitor.export) ? visitor.export.filter((item) => CROSSTAB_EXPORTS.includes(item)) : [...CROSSTAB_EXPORTS],
      drill: visitor.drill === true
    }
  };
  for (const name of CROSSTAB_DIMENSIONS) result[name] = normalizeDimension(source[name]);
  return result;
}

/**
 * One dimension: `{code, label, buckets}`; null without a valid code.
 *
 * @param {*} value
 * @returns {{code: string, label: object, buckets: string|object}|null}
 */
export function normalizeDimension(value) {
  if (!isObject(value) || typeof value.code !== 'string' || !crosstabCodePath(value.code)) return null;
  return { code: value.code.trim(), label: texts(value.label), buckets: normalizeBuckets(value.buckets) };
}

/**
 * Buckets: `"values"`, `{groupby}`, `{ranges: N}` or `{ranges: [...]}`.
 *
 * @param {*} buckets
 * @returns {string|object}
 */
export function normalizeBuckets(buckets) {
  if (!isObject(buckets)) return 'values';
  if (CROSSTAB_GROUPBY.includes(buckets.groupby)) return { groupby: buckets.groupby };
  if (Number.isInteger(buckets.ranges) && buckets.ranges >= 1 && buckets.ranges <= 20) return { ranges: buckets.ranges };
  if (Array.isArray(buckets.ranges)) {
    const ranges = buckets.ranges.map((range) => {
      if (typeof range === 'string') return range.trim();
      if (isObject(range) && typeof range.value === 'string') {
        return range.label ? { value: range.value.trim(), label: String(range.label) } : range.value.trim();
      }
      return '';
    }).filter((range) => (typeof range === 'string' ? range !== '' : range.value !== ''));
    if (ranges.length) return { ranges };
  }
  return 'values';
}

/**
 * Read a field path code: `[rty:]{link dty[:rty]}*:field` (as srv CrossTabulator::parseCode).
 *
 * @param {string} code `10:20`, `10:lt240:48:237`, `rectype`.
 * @returns {{field: string, hops: Array<{key: string, rectype: string|null}>}|null}
 */
export function crosstabCodePath(code) {
  const tokens = String(code ?? '').toLowerCase().split(':').map((token) => token.trim()).filter(Boolean);
  if (!tokens.length) return null;
  const field = tokens.pop();
  if (!/^\d+$/.test(field) && !HEADER_FIELDS.includes(field)) return null;
  let index = /^\d+$/.test(tokens[0] || '') ? 1 : 0;
  const hops = [];
  while (index < tokens.length) {
    const match = /^(lt|lf|rt|rf|r)(\d*)$/.exec(tokens[index]);
    if (!match) return null;
    const target = /^\d+$/.test(tokens[index + 1] || '') ? tokens[index + 1] : null;
    hops.push({ key: `${LINKS[match[1]]}${match[2] ? `:${match[2]}` : ''}`, rectype: target });
    index += target ? 2 : 1;
  }
  return { field, hops };
}

/**
 * The `crosstab` parameter of the request, optionally with other dimensions (the visitor's pivot).
 *
 * @param {object} settings Normalised settings.
 * @param {{rows?: object|null, columns?: object|null, pages?: object|null, measure?: object}} [override]
 * @returns {object|null} null without rows.
 */
export function crosstabRequest(settings, override = {}) {
  const pick = (name) => (Object.hasOwn(override, name) ? override[name] : settings[name]);
  const rows = pick('rows');
  if (!rows?.code) return null;
  const request = {};
  for (const name of CROSSTAB_DIMENSIONS) {
    const dimension = pick(name);
    if (dimension?.code) request[name] = { code: dimension.code, buckets: dimension.buckets ?? 'values' };
  }
  const measure = override.measure || settings.measure;
  request.measure = measure?.op && measure.op !== 'count' && measure.field ? { op: measure.op, field: Number(measure.field) } : { op: 'count' };
  return request;
}

/**
 * The label of a bucket.
 *
 * @param {object} bucket A bucket of the answer.
 * @param {object} dimension The dimension of the answer (`fieldType`).
 * @param {{termLabel?: Function, rectypeName?: Function, userGroupName?: Function, translate?: Function}} [labels]
 * @returns {string}
 */
export function bucketLabel(bucket, dimension = {}, labels = {}) {
  const translate = labels.translate || ((text) => text);
  if (bucket?.blank) return translate('(no value)');
  if (bucket?.other) return translate('(other values)');
  if (bucket?.label != null && bucket.label !== '') return String(bucket.label);
  const value = bucket?.value;
  const type = dimension.fieldType;
  if ((type === 'enum' || type === 'relationtype') && labels.termLabel) {
    const parsed = parseRange(value);
    const ids = parsed.kind === 'list' ? parsed.values : [String(value)];
    const names = ids.map((id) => labels.termLabel(Number(id)) || id);
    return names.join(', ');
  }
  if (type === 'rectype' && labels.rectypeName) return labels.rectypeName(Number(value)) || String(value);
  if ((type === 'owner' || type === 'addedby') && labels.userGroupName) return labels.userGroupName(Number(value)) || String(value);
  if (type === 'boolean') return ['1', 'true', 'yes', 'y'].includes(String(value).toLowerCase()) ? translate('Yes') : translate('No');
  return String(value ?? '');
}

/**
 * The answer as tables, one per page: visible rows and columns (blank / other and empty ones only with `showBlanks`),
 * cells with records, value and percentages, totals.
 *
 * @param {object} answer The answer of op=crosstab.
 * @param {object} settings Normalised settings (display).
 * @param {object} [labels] bucketLabel labels.
 * @returns {{total: number, measure: object, rows: Array<{index: number, label: string}>,
 *          columns: Array<{index: number, label: string}>, pages: Array<{index: number, label: string}>,
 *          hasColumns: boolean, tables: Array<object>}}
 */
export function crosstabTables(answer, settings, labels = {}) {
  const display = settings?.display || normalizeCrosstabSettings({}).display;
  const op = answer?.measure?.op || 'count';
  const measured = op !== 'count';
  const buckets = (name) => (answer?.[name]?.buckets || []).map((bucket, index) => ({
    index, label: bucketLabel(bucket, answer[name], labels), bucket, extra: Boolean(bucket.blank || bucket.other)
  }));
  const allRows = buckets('rows');
  const hasColumns = Boolean(answer?.columns);
  const allColumns = hasColumns ? buckets('columns') : [{ index: 0, label: '', bucket: {}, extra: false }];
  const pages = answer?.pages ? buckets('pages') : [{ index: 0, label: '', bucket: {}, extra: false }];
  const aggregate = (row) => ({ records: row?.[0] ?? 0, value: measured ? (row?.[1] ?? null) : (row?.[0] ?? 0), withValue: measured ? (row?.[2] ?? 0) : null });
  const cells = new Map();
  for (const cell of answer?.cells || []) cells.set(`${cell[0]}:${cell[1]}:${cell[2]}`, aggregate(cell.slice(3)));
  const rowTotals = new Map();
  for (const row of answer?.totals?.rows || []) rowTotals.set(`${row[0]}:${row[1]}`, aggregate(row.slice(2)));
  const columnTotals = new Map();
  for (const row of answer?.totals?.columns || []) columnTotals.set(`${row[0]}:${row[1]}`, aggregate(row.slice(2)));
  const pageTotals = new Map();
  for (const row of answer?.totals?.pages || []) pageTotals.set(row[0], aggregate(row.slice(1)));
  const empty = { records: 0, value: measured ? null : 0, withValue: 0 };
  const percents = op === 'count' || op === 'sum';
  const percent = (part, whole) => (percents && Number(whole) ? (Number(part) || 0) * 100 / Number(whole) : null);
  const tables = pages
    .filter((page) => display.showBlanks || !page.extra)
    .map((page) => {
      const total = (answer?.pages ? pageTotals.get(page.index) : null) || (answer?.pages ? empty : aggregate(answer?.totals?.grand));
      const columnTotal = (column) => (hasColumns ? columnTotals.get(`${page.index}:${column.index}`) : total) || empty;
      const rowTotal = (row) => rowTotals.get(`${page.index}:${row.index}`) || empty;
      const columns = allColumns.filter((column) => display.showBlanks || (!column.extra && columnTotal(column).records > 0));
      const rows = allRows
        .filter((row) => display.showBlanks || (!row.extra && rowTotal(row).records > 0))
        .map((row) => {
          const own = rowTotal(row);
          return {
            index: row.index,
            label: row.label,
            bucket: row.bucket,
            cells: columns.map((column) => {
              const cell = cells.get(`${row.index}:${column.index}:${page.index}`) || empty;
              return { column: column.index, ...cell,
                percentRow: percent(cell.value, own.value), percentColumn: percent(cell.value, columnTotal(column).value) };
            }),
            total: { ...own, percentColumn: percent(own.value, total.value) }
          };
        });
      return {
        page: { index: page.index, label: page.label, bucket: page.bucket },
        columns: columns.map((column) => ({ index: column.index, label: column.label, bucket: column.bucket,
          total: { ...columnTotal(column), percentRow: percent(columnTotal(column).value, total.value) } })),
        rows,
        total
      };
    });
  return {
    total: Number(answer?.total) || 0,
    measure: answer?.measure || { op: 'count' },
    rows: allRows,
    columns: hasColumns ? allColumns : [],
    pages: answer?.pages ? pages : [],
    hasColumns,
    tables
  };
}

/**
 * The text of a number of a cell: the decimals of the settings, '' for zero with `blankZero`.
 *
 * @param {number|null} value
 * @param {object} display
 * @param {string} [language]
 * @returns {string}
 */
export function formatCellValue(value, display = {}, language = '') {
  if (value == null) return '';
  if (Number(value) === 0 && display.blankZero) return '';
  const decimals = Number.isInteger(display.decimals) ? display.decimals : 0;
  return Number(value).toLocaleString(locale(language), { minimumFractionDigits: 0, maximumFractionDigits: decimals });
}

/**
 * The text of a percentage (one decimal), '' without one.
 *
 * @param {number|null} value
 * @param {string} [language]
 * @returns {string}
 */
export function formatPercent(value, language = '') {
  if (value == null || !Number.isFinite(Number(value))) return '';
  return `${Number(value).toLocaleString(locale(language), { maximumFractionDigits: 1 })}%`;
}

/**
 * Chart data of one table: the rows as labels, one dataset per column (a single dataset without columns).
 *
 * @param {object} table A table of crosstabTables.
 * @param {{hasColumns: boolean, measure: object}} tables crosstabTables result.
 * @param {string} [valueLabel] Name of the single dataset.
 * @returns {{labels: string[], datasets: Array<{label: string, data: Array<number|null>}>}}
 */
export function crosstabChartData(table, tables, valueLabel = '') {
  const labels = (table?.rows || []).map((row) => row.label);
  if (!tables?.hasColumns) {
    return { labels, datasets: [{ label: valueLabel, data: (table?.rows || []).map((row) => numberOrNull(row.cells[0]?.value)) }] };
  }
  return {
    labels,
    datasets: (table?.columns || []).map((column, index) => ({
      label: column.label,
      data: (table?.rows || []).map((row) => numberOrNull(row.cells[index]?.value))
    }))
  };
}

/**
 * The query of a cell (or of a row / column header: pass null for the other): the base query AND the conditions of the
 * buckets, so it finds the counted records. Terms are exact (`=id`: the crosstab counts the stored term, plan 27q2 §15).
 *
 * @param {Array|object} baseQuery The query of the crosstab (JSON).
 * @param {object} answer The answer of op=crosstab.
 * @param {{row?: number|null, column?: number|null, page?: number|null}} cell Bucket indexes.
 * @returns {Array|null} null when a bucket can not be searched (other values, a text query, a header field).
 */
export function crosstabCellQuery(baseQuery, answer, { row = null, column = null, page = null } = {}) {
  if (baseQuery == null || typeof baseQuery === 'string') return null;
  const query = Array.isArray(baseQuery) ? [...baseQuery] : [baseQuery];
  for (const [name, index] of [['rows', row], ['columns', column], ['pages', page]]) {
    if (index == null || !answer?.[name]) continue;
    const dimension = answer[name];
    const condition = bucketCondition(dimension, dimension.buckets?.[index]);
    if (!condition) return null;
    query.push(condition);
  }
  return query;
}

/** The search condition of one bucket of a dimension, null when it can not be searched. */
function bucketCondition(dimension, bucket) {
  if (!bucket || bucket.other) return null;
  const path = crosstabCodePath(dimension.code);
  if (!path) return null;
  let condition;
  if (path.field === 'rectype') {
    if (bucket.blank) return null;
    condition = { t: String(bucket.value) };
  } else if (/^\d+$/.test(path.field)) {
    condition = fieldCondition(path.field, dimension.fieldType, bucket);
  } else {
    return null;
  }
  if (!condition) return null;
  // through the links: the records that point to (or are related to) records with the value
  for (const hop of [...path.hops].reverse()) {
    condition = { [hop.key]: [...(hop.rectype ? [{ t: hop.rectype }] : []), ...[condition].flat()] };
  }
  return condition;
}

/** The condition of a bucket of a detail field. */
function fieldCondition(field, type, bucket) {
  const key = `f:${field}`;
  if (bucket.blank) return { [key]: 'NULL' };
  if (bucket.from != null) return { [key]: `${bucket.from}<>${bucket.to}` };
  const exact = (value) => (['enum', 'relationtype', 'freetext'].includes(type) ? `=${value}` : String(value));
  if (type === 'resource') {
    const parsed = parseRange(bucket.value);
    const ids = parsed.kind === 'list' ? parsed.values : [String(bucket.value)];
    return { [`lt:${field}`]: [{ ids: ids.join(',') }] };
  }
  if (type === 'relmarker') return null;
  const parsed = parseRange(bucket.value);
  if (parsed.kind === 'interval') return { [key]: `${parsed.min}<>${parsed.max}` };
  if (parsed.kind === 'list') return { any: parsed.values.map((value) => ({ [key]: exact(value) })) };
  return { [key]: exact(parsed.value ?? bucket.value) };
}

/** Texts by language `{def, fre}` (a plain text is `def`). */
function texts(value) {
  if (typeof value === 'string') return value.trim() ? { def: value } : {};
  if (!isObject(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, text]) => typeof text === 'string' && text !== ''));
}

/** A JSON object (not a list). */
function isObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

/** A number, or null. */
function numberOrNull(value) {
  return value == null || !Number.isFinite(Number(value)) ? null : Number(value);
}

/** A locale of a Heurist language code. */
function locale(language) {
  return { eng: 'en', fre: 'fr', ger: 'de', por: 'pt', spa: 'es', ita: 'it' }[String(language || '').toLowerCase()] || undefined;
}
