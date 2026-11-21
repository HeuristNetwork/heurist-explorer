/**
 * @file crosstabsForm.js
 * @brief Settings form of the Crosstabs tool (plan 27q2 §8): the HEditForm JSON in sections Source / Rows / Columns /
 *        Pages / Measure / Display / Visitors on a website, made of existing inputs and special editors (field path,
 *        ranges, list of fields), and the conversion between the crosstab settings (crosstabModel.js) and the values.
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

import {
  CROSSTAB_CHARTS, CROSSTAB_DIMENSIONS, CROSSTAB_EXPORTS, CROSSTAB_GROUPBY, CROSSTAB_LEVELS, normalizeCrosstabSettings
} from '#shared/widgets/crosstabs/crosstabModel.js';

/** Help texts of the form. */
export const HELP = Object.freeze({
  query: 'Records counted on a website page that gives the crosstab no other records. In Explorer the crosstab counts the current result (or the selection).',
  fieldsOf: 'The record type whose fields (and the fields of the records they point to) are offered. It does not filter the records: all records of the result are counted.',
  code: 'The field whose values make the rows (columns, pages): a field of the records or of the records they point to.',
  buckets: 'Each value: a row per value. Dates by period: years, decades … Equal ranges: numbers in round ranges. Own ranges: intervals and groups of values you define and name.',
  ranges: 'Intervals ("1900<>1909"), values or groups of terms; each with an optional label. Values outside them are counted as "other values".',
  measure: 'Count the records, or the sum / average / minimum / maximum of a numeric field (the first value of each record).',
  showBlanks: 'Show the rows and columns without records, the records without a value and the other values.',
  title: 'Title above the table and of the exports.',
  level: 'What a visitor of a website page can change. View: Table / Chart and export. Display: also values, totals, percentages and chart type. Pivot: also the fields of rows, columns, pages and the measure, from the lists below.',
  visitorFields: 'Fields a visitor may choose for rows, columns and pages (level Pivot).',
  drill: 'A click on a count shows its records in the modules of the page that take their records from the crosstab.'
});

const DIMENSION_LABELS = Object.freeze({ rows: 'Rows', columns: 'Columns', pages: 'Pages' });
const BUCKET_TERMS = Object.freeze([
  { id: 'values', label: 'Each value' }, { id: 'groupby', label: 'Dates by period' },
  { id: 'count', label: 'Equal ranges (numbers)' }, { id: 'ranges', label: 'Own ranges' }
]);
const GROUPBY_LABELS = Object.freeze({ month: 'Months', year: 'Years', decade: 'Decades', century: 'Centuries' });
const CHART_LABELS = Object.freeze({
  bar: 'Bars', stackedBar: 'Stacked bars', horizontalBar: 'Horizontal bars', line: 'Line', pie: 'Pie', doughnut: 'Doughnut'
});
const MEASURE_TERMS = Object.freeze([
  { id: 'count', label: 'Count of records' }, { id: 'sum', label: 'Sum' }, { id: 'avg', label: 'Average' },
  { id: 'min', label: 'Minimum' }, { id: 'max', label: 'Maximum' }
]);
const FLAGS = Object.freeze([
  ['values', 'Show values'], ['totals', 'Show totals'], ['percentRow', 'Row %'], ['percentColumn', 'Column %'],
  ['blankZero', 'Blank for zero'], ['showBlanks', 'Show blank rows and columns']
]);

/**
 * The form JSON.
 *
 * @param {object} context
 * @param {{query: number}} context.ids Field id of the query (its special editor).
 * @param {Array<{id: number, label: string}>} context.rectypes Record types of *Fields of*.
 * @param {Array<{id: number, label: string}>} context.numericFields Numeric fields of that type (the measure).
 * @returns {object} heurist-edit-form/1.
 */
export function crosstabsForm({ ids = {}, rectypes = [], numericFields = [] }) {
  const dimension = (name) => ({
    id: name, type: 'accordion', label: DIMENSION_LABELS[name], open: name === 'rows',
    children: [
      { name: `${name}Code`, type: 'special', special: 'fieldCode', label: 'Field', help: HELP.code, ...(name === 'rows' ? { req: 'required' } : {}) },
      { name: `${name}Label`, type: 'freetext', label: 'Caption', multilang: true },
      { name: `${name}Buckets`, type: 'enum', mode: 'select', label: 'Values', help: HELP.buckets, clearable: false, terms: BUCKET_TERMS },
      { name: `${name}Groupby`, type: 'enum', mode: 'select', label: 'Period', clearable: false, showWhen: { [`${name}Buckets`]: 'groupby' },
        terms: CROSSTAB_GROUPBY.map((id) => ({ id, label: GROUPBY_LABELS[id] })) },
      { name: `${name}Count`, type: 'integer', label: 'Number of ranges', minValue: 1, maxValue: 20, clearable: false,
        showWhen: { [`${name}Buckets`]: 'count' } },
      { name: `${name}Ranges`, type: 'special', special: 'ranges', label: 'Ranges', help: HELP.ranges, showWhen: { [`${name}Buckets`]: 'ranges' } }
    ]
  });
  return {
    format: 'heurist-edit-form/1',
    groups: [
      {
        id: 'source', type: 'accordion', label: 'Source', open: true,
        children: [
          { name: 'title', type: 'freetext', label: 'Name', req: 'required' },
          { name: String(ids.query || 'query'), type: 'special', special: 'query', label: 'Records on a website', help: HELP.query },
          { name: 'fieldsOf', type: 'enum', mode: 'select', label: 'Fields of', help: HELP.fieldsOf, req: 'required',
            terms: rectypes.map((item) => ({ id: String(item.id), label: item.label })) }
        ]
      },
      ...CROSSTAB_DIMENSIONS.map(dimension),
      {
        id: 'measure', type: 'accordion', label: 'Measure', open: false,
        children: [
          { name: 'measureOp', type: 'enum', mode: 'select', label: 'Measure', help: HELP.measure, clearable: false, terms: MEASURE_TERMS },
          { name: 'measureField', type: 'enum', mode: 'select', label: 'Numeric field', showWhen: { measureOp: ['sum', 'avg', 'min', 'max'] },
            terms: numericFields.map((item) => ({ id: String(item.id), label: item.label })) }
        ]
      },
      {
        id: 'display', type: 'accordion', label: 'Display', open: false,
        children: [
          { name: 'displayTitle', type: 'freetext', label: 'Title', help: HELP.title, multilang: true },
          ...FLAGS.map(([key, label]) => ({ name: key, type: 'boolean', mode: 'checkbox', label, ...(key === 'showBlanks' ? { help: HELP.showBlanks } : {}) })),
          { name: 'decimals', type: 'integer', label: 'Decimals', minValue: 0, maxValue: 6, clearable: false },
          { name: 'chartShow', type: 'enum', mode: 'select', label: 'Show', clearable: false,
            terms: [{ id: 'table', label: 'Table' }, { id: 'chart', label: 'Chart' }, { id: 'both', label: 'Table and chart' }] },
          { name: 'chartType', type: 'enum', mode: 'select', label: 'Chart', clearable: false,
            terms: CROSSTAB_CHARTS.map((id) => ({ id, label: CHART_LABELS[id] })) }
        ]
      },
      {
        id: 'visitor', type: 'accordion', label: 'Visitors on a website', open: false,
        children: [
          { name: 'level', type: 'enum', mode: 'radio', label: 'Visitors can', help: HELP.level, clearable: false,
            terms: CROSSTAB_LEVELS.map((id) => ({ id, label: { view: 'View', display: 'Change the display', pivot: 'Choose the fields' }[id] })) },
          { name: 'visitorFields', type: 'special', special: 'fieldCodes', label: 'Fields to choose', help: HELP.visitorFields, showWhen: { level: 'pivot' } },
          { name: 'visitorMeasures', type: 'enum', mode: 'checkbox', max: 0, label: 'Measures to choose', showWhen: { level: 'pivot' },
            terms: MEASURE_TERMS.filter((term) => term.id !== 'count') },
          { name: 'export', type: 'enum', mode: 'checkbox', max: 0, label: 'Export',
            terms: CROSSTAB_EXPORTS.map((id) => ({ id, label: { csv: 'CSV', xlsx: 'Excel', pdf: 'PDF', png: 'Chart image (PNG)', print: 'Print' }[id] })) },
          { name: 'drill', type: 'boolean', mode: 'checkbox', label: 'A click shows the records', help: HELP.drill }
        ]
      }
    ]
  };
}

/**
 * The values of the form.
 *
 * @param {{title: string, query: string, settings: object}} values Name, query text and normalised settings.
 * @param {{query: number}} ids
 * @returns {object}
 */
export function formValues({ title, query, settings }, ids = {}) {
  const values = {
    title,
    [String(ids.query || 'query')]: query || '',
    fieldsOf: settings.fields.rectype ? String(settings.fields.rectype) : null,
    measureOp: settings.measure.op,
    measureField: settings.measure.field ? String(settings.measure.field) : null,
    displayTitle: textValues(settings.display.title),
    decimals: settings.display.decimals,
    chartShow: settings.chart.show,
    chartType: settings.chart.type,
    level: settings.visitor.level,
    visitorFields: settings.visitor.fields.length ? JSON.stringify(settings.visitor.fields) : '',
    visitorMeasures: settings.visitor.measures.filter((op) => op !== 'count'),
    export: [...settings.visitor.export],
    drill: settings.visitor.drill
  };
  for (const [key] of FLAGS) values[key] = settings.display[key];
  for (const name of CROSSTAB_DIMENSIONS) {
    const dimension = settings[name];
    const buckets = dimension?.buckets ?? 'values';
    values[`${name}Code`] = dimension?.code || '';
    values[`${name}Label`] = textValues(dimension?.label);
    values[`${name}Buckets`] = bucketMode(buckets);
    values[`${name}Groupby`] = buckets?.groupby || 'decade';
    values[`${name}Count`] = Number.isInteger(buckets?.ranges) ? buckets.ranges : 10;
    values[`${name}Ranges`] = Array.isArray(buckets?.ranges) ? JSON.stringify(buckets.ranges) : '';
  }
  return values;
}

/**
 * Name, query and settings from the values of the form.
 *
 * @param {object} values Form values.
 * @param {{query: number}} ids
 * @returns {{title: string, query: string, settings: object}}
 */
export function valuesSettings(values, ids = {}) {
  const one = (value) => (Array.isArray(value) ? value[0] : value);
  const list = (value) => [value ?? []].flat().map(String).filter(Boolean);
  const json = (value) => {
    try {
      return value ? JSON.parse(one(value)) : null;
    } catch {
      return null;
    }
  };
  const raw = {
    fields: { rectype: Number(one(values.fieldsOf)) || null },
    measure: { op: one(values.measureOp) || 'count', field: Number(one(values.measureField)) || null },
    display: {
      ...Object.fromEntries(FLAGS.map(([key]) => [key, one(values[key]) === true])),
      decimals: Number(one(values.decimals)) || 0,
      title: valueTexts(values.displayTitle)
    },
    chart: { show: one(values.chartShow), type: one(values.chartType) },
    visitor: {
      level: one(values.level),
      fields: json(values.visitorFields) || [],
      measures: ['count', ...list(values.visitorMeasures)],
      export: list(values.export),
      drill: one(values.drill) === true
    }
  };
  for (const name of CROSSTAB_DIMENSIONS) {
    const code = String(one(values[`${name}Code`]) ?? '').trim();
    if (!code) continue;
    const mode = one(values[`${name}Buckets`]) || 'values';
    let buckets = 'values';
    if (mode === 'groupby') buckets = { groupby: one(values[`${name}Groupby`]) || 'decade' };
    else if (mode === 'count') buckets = { ranges: Number(one(values[`${name}Count`])) || 10 };
    else if (mode === 'ranges') buckets = { ranges: json(values[`${name}Ranges`]) || [] };
    raw[name] = { code, label: valueTexts(values[`${name}Label`]), buckets };
  }
  return {
    title: String(one(values.title) ?? '').trim(),
    query: String(one(values[String(ids.query || 'query')]) ?? '').trim(),
    settings: normalizeCrosstabSettings(raw)
  };
}

/** The mode of the buckets select. */
function bucketMode(buckets) {
  if (buckets?.groupby) return 'groupby';
  if (Number.isInteger(buckets?.ranges)) return 'count';
  if (Array.isArray(buckets?.ranges)) return 'ranges';
  return 'values';
}

/** Texts by language → values of a multilingual field. */
export function textValues(texts) {
  const list = [];
  if (texts?.def) list.push(texts.def);
  for (const [language, text] of Object.entries(texts || {})) {
    if (language !== 'def' && text) list.push(`${language}:${text}`);
  }
  return list;
}

/** Values of a multilingual field → texts by language. */
export function valueTexts(values) {
  const texts = {};
  for (const value of [values ?? []].flat()) {
    const text = String(value ?? '');
    const match = /^([a-z]{3}):([\s\S]*)$/.exec(text);
    if (match) texts[match[1]] = match[2];
    else if (text.trim()) texts.def = text;
  }
  return texts;
}
