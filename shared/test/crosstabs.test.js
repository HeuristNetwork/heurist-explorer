/**
 * @file crosstabs.test.js
 * @brief Crosstabs (plan 27q2): settings, request, tables (labels, totals, percentages, blank / other), chart data, the
 *        query of a cell, the HTML table, the chart configuration, the service and the widget with a fake service.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 * @since       8.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom, flush } from './helpers/fakeDom.js';
import {
  bucketLabel, crosstabCellQuery, crosstabChartData, crosstabCodePath, crosstabRequest, crosstabTables, formatCellValue,
  normalizeCrosstabSettings
} from '../src/widgets/crosstabs/crosstabModel.js';
import { crosstabChartConfig } from '../src/widgets/crosstabs/crosstabChart.js';
import { CrosstabService } from '../src/widgets/crosstabs/crosstabService.js';

installFakeDom();
const { renderCrosstabTable, crosstabSubColumns, dataTablesLanguage } = await import('../src/widgets/crosstabs/crosstabTable.js');
const { HCrosstab } = await import('../src/widgets/crosstabs/HCrosstab.js');

/** An answer of op=crosstab: Place type (enum) × Country (enum), blank country, one "other". */
const ANSWER = {
  total: 10,
  rows: { code: '12:133', field: '133', type: 'category', fieldType: 'enum',
    buckets: [{ value: 5321 }, { value: 5324 }, { blank: true }] },
  columns: { code: '12:lt5:7:26', field: '26', type: 'category', fieldType: 'enum',
    buckets: [{ value: 108 }, { value: 109 }, { other: true }] },
  pages: null,
  measure: { op: 'count' },
  cells: [[0, 0, 0, 4], [0, 1, 0, 2], [1, 0, 0, 1], [1, 2, 0, 1], [2, 1, 0, 2]],
  totals: {
    rows: [[0, 0, 6], [0, 1, 2], [0, 2, 2]],
    columns: [[0, 0, 5], [0, 1, 4], [0, 2, 1]],
    pages: [[0, 10]],
    grand: [10]
  }
};
const TERMS = { 5321: 'City', 5324: 'Locality', 108: 'France', 109: 'Germany' };
const labels = { termLabel: (id) => TERMS[id] || '' };

test('settings: defaults, a JSON text, invalid parts dropped', () => {
  const empty = normalizeCrosstabSettings(null);
  assert.equal(empty.rows, null);
  assert.deepEqual(empty.measure, { op: 'count', field: null });
  assert.equal(empty.visitor.level, 'display');
  assert.deepEqual(empty.visitor.export, ['csv', 'xlsx', 'pdf', 'png', 'print']);
  const settings = normalizeCrosstabSettings(JSON.stringify({
    rows: { code: '10:20', label: 'Gender' },
    columns: { code: '10:x', buckets: 'values' },
    pages: { code: '10:10', buckets: { groupby: 'decade' } },
    measure: { op: 'sum', field: 1160 },
    chart: { type: 'radar', show: 'both' },
    visitor: { level: 'all', fields: ['10:20', 'bad?'], measures: ['count', 'median'] }
  }));
  assert.deepEqual(settings.rows, { code: '10:20', label: { def: 'Gender' }, buckets: 'values' });
  assert.equal(settings.columns, null);
  assert.deepEqual(settings.pages.buckets, { groupby: 'decade' });
  assert.deepEqual(settings.measure, { op: 'sum', field: 1160 });
  assert.deepEqual(settings.chart, { show: 'both', type: 'bar' });
  assert.equal(settings.visitor.level, 'display');
  assert.deepEqual(settings.visitor.fields, ['10:20']);
  assert.deepEqual(settings.visitor.measures, ['count']);
  const ranges = normalizeCrosstabSettings({ rows: { code: '10:1160', buckets: { ranges: ['0<>10', { value: '11<>20', label: 'Big' }, ''] } } });
  assert.deepEqual(ranges.rows.buckets, { ranges: ['0<>10', { value: '11<>20', label: 'Big' }] });
});

test('field path codes as the server reads them', () => {
  assert.deepEqual(crosstabCodePath('10:lt240:48:237'), { field: '237', hops: [{ key: 'lt:240', rectype: '48' }] });
  assert.deepEqual(crosstabCodePath('rectype'), { field: 'rectype', hops: [] });
  assert.deepEqual(crosstabCodePath('10:r:12:26'), { field: '26', hops: [{ key: 'related', rectype: '12' }] });
  assert.equal(crosstabCodePath('10:x5:26'), null);
});

test('request: the dimensions, the pivot of the visitor, the measure', () => {
  const settings = normalizeCrosstabSettings({ rows: { code: '12:133' }, columns: { code: '12:26' }, measure: { op: 'avg', field: 1160 } });
  assert.deepEqual(crosstabRequest(settings), {
    rows: { code: '12:133', buckets: 'values' }, columns: { code: '12:26', buckets: 'values' }, measure: { op: 'avg', field: 1160 }
  });
  assert.deepEqual(crosstabRequest(settings, { columns: null, measure: { op: 'count' } }),
    { rows: { code: '12:133', buckets: 'values' }, measure: { op: 'count' } });
  assert.equal(crosstabRequest(normalizeCrosstabSettings({})), null);
});

test('labels of buckets', () => {
  const enumDimension = { fieldType: 'enum' };
  assert.equal(bucketLabel({ value: 5321 }, enumDimension, labels), 'City');
  assert.equal(bucketLabel({ value: '5321,5324' }, enumDimension, labels), 'City, Locality');
  assert.equal(bucketLabel({ value: '1900<>1909', label: '1900s' }, { fieldType: 'date' }), '1900s');
  assert.equal(bucketLabel({ blank: true }, enumDimension), '(no value)');
  assert.equal(bucketLabel({ other: true }, enumDimension), '(other values)');
  assert.equal(bucketLabel({ value: 10 }, { fieldType: 'rectype' }, { rectypeName: () => 'Person' }), 'Person');
});

test('tables: blank and other hidden by default, totals as the server gives them, percentages', () => {
  const settings = normalizeCrosstabSettings({ display: { percentRow: true, percentColumn: true } });
  const tables = crosstabTables(ANSWER, settings, labels);
  assert.equal(tables.total, 10);
  assert.equal(tables.tables.length, 1);
  const [table] = tables.tables;
  assert.deepEqual(table.rows.map((row) => row.label), ['City', 'Locality']);
  assert.deepEqual(table.columns.map((column) => column.label), ['France', 'Germany']);
  const city = table.rows[0];
  assert.equal(city.total.records, 6);
  assert.deepEqual(city.cells.map((cell) => cell.records), [4, 2]);
  assert.equal(Math.round(city.cells[0].percentRow), 67);
  assert.equal(city.cells[0].percentColumn, 80);
  assert.equal(table.total.records, 10);
  const all = crosstabTables(ANSWER, normalizeCrosstabSettings({ display: { showBlanks: true } }), labels).tables[0];
  assert.deepEqual(all.rows.map((row) => row.label), ['City', 'Locality', '(no value)']);
  assert.deepEqual(all.columns.map((column) => column.label), ['France', 'Germany', '(other values)']);
});

test('tables: a measure, pages', () => {
  const answer = {
    total: 3,
    rows: { code: '12:133', fieldType: 'enum', buckets: [{ value: 5321 }] },
    columns: null,
    pages: { code: '12:26', fieldType: 'enum', buckets: [{ value: 108 }, { value: 109 }] },
    measure: { op: 'sum', field: 1160 },
    cells: [[0, 0, 0, 2, 300, 2], [0, 0, 1, 1, 50, 1]],
    totals: { rows: [[0, 0, 2, 300, 2], [1, 0, 1, 50, 1]], columns: [], pages: [[0, 2, 300, 2], [1, 1, 50, 1]], grand: [3, 350, 3] }
  };
  const tables = crosstabTables(answer, normalizeCrosstabSettings({}), labels);
  assert.deepEqual(tables.tables.map((table) => table.page.label), ['France', 'Germany']);
  assert.equal(tables.tables[0].rows[0].cells[0].value, 300);
  assert.equal(tables.tables[1].total.value, 50);
  assert.equal(formatCellValue(0, { blankZero: true }), '');
  assert.equal(formatCellValue(1234.567, { decimals: 1 }, 'eng'), '1,234.6');
});

test('chart data: datasets per column; the config by type', () => {
  const tables = crosstabTables(ANSWER, normalizeCrosstabSettings({}), labels);
  const data = crosstabChartData(tables.tables[0], tables, 'Count');
  assert.deepEqual(data.labels, ['City', 'Locality']);
  assert.deepEqual(data.datasets.map((set) => [set.label, set.data]), [['France', [4, 1]], ['Germany', [2, 0]]]);
  const stacked = crosstabChartConfig('stackedBar', data);
  assert.equal(stacked.type, 'bar');
  assert.equal(stacked.options.scales.x.stacked, true);
  assert.equal(crosstabChartConfig('horizontalBar', data).options.indexAxis, 'y');
  const pie = crosstabChartConfig('pie', data, { totals: [6, 2] });
  assert.deepEqual(pie.data.datasets[0].data, [6, 2]);
  assert.equal(pie.data.datasets[0].backgroundColor.length, 2);
});

test('the query of a cell: exact terms, blank, through links, other values', () => {
  const base = [{ t: '12' }];
  assert.deepEqual(crosstabCellQuery(base, ANSWER, { row: 0, column: 0 }),
    [{ t: '12' }, { 'f:133': '=5321' }, { 'lt:5': [{ t: '7' }, { 'f:26': '=108' }] }]);
  assert.deepEqual(crosstabCellQuery(base, ANSWER, { row: 2 }), [{ t: '12' }, { 'f:133': 'NULL' }]);
  assert.equal(crosstabCellQuery(base, ANSWER, { row: 0, column: 2 }), null);
  assert.equal(crosstabCellQuery('t:12', ANSWER, { row: 0 }), null);
  const ranges = { rows: { code: '10:10', fieldType: 'date', buckets: [{ from: '1900', to: '1909' }, { value: '1,2' }] } };
  assert.deepEqual(crosstabCellQuery([], ranges, { row: 0 }), [{ 'f:10': '1900<>1909' }]);
  const list = { rows: { code: '10:20', fieldType: 'enum', buckets: [{ value: '414,415' }] } };
  assert.deepEqual(crosstabCellQuery([], list, { row: 0 }), [{ any: [{ 'f:20': '=414' }, { 'f:20': '=415' }] }]);
  const pointer = { rows: { code: '10:134', fieldType: 'resource', buckets: [{ value: 96, label: 'Berlin' }] } };
  assert.deepEqual(crosstabCellQuery([], pointer, { row: 0 }), [{ 'lt:134': [{ ids: '96' }] }]);
});

test('HTML table: two header rows with percentages, totals, clicks', () => {
  const settings = normalizeCrosstabSettings({ display: { percentRow: true } });
  const tables = crosstabTables(ANSWER, settings, labels);
  assert.deepEqual(crosstabSubColumns(settings.display), ['value', 'percentRow']);
  const clicks = [];
  const table = renderCrosstabTable(tables.tables[0], tables, {
    display: settings.display, rowCaption: 'Place type', valueCaption: 'Count', onCell: (cell) => clicks.push(cell)
  });
  const part = (tag) => [...table.children].find((node) => node.tagName?.toLowerCase() === tag);
  assert.equal(part('thead').children.length, 2);
  assert.equal(part('tbody').children.length, 2);
  assert.ok(part('tfoot'));
  table.querySelector('.h-crosstab-clickable').dispatchEvent(new Event('click'));
  // the first one is the row header: the whole row
  assert.deepEqual(clicks, [{ row: 0, column: null }]);
});

test('service: GET of the crosstab, POST for a long request, errors', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, json: async () => ({ total: 3 }) };
  };
  const service = new CrosstabService({ apiBaseUrl: 'http://h/api/', database: 'db', fetchImpl });
  assert.equal(await service.count([{ t: '10' }]), 3);
  assert.match(calls[0].url, /^http:\/\/h\/api\/db\/records\/aggregate\?op=count&q=/);
  await service.tabulate([{ ids: '1,'.repeat(3000) }], { rows: { code: '10:20' } });
  assert.equal(calls[1].init.method, 'POST');
  assert.equal(JSON.parse(calls[1].init.body).op, 'crosstab');
  const failing = new CrosstabService({ apiBaseUrl: '/api', database: 'db',
    fetchImpl: async () => ({ ok: false, status: 400, json: async () => ({ message: 'bad field' }) }) });
  await assert.rejects(failing.tabulate([], {}), /bad field/);
});

test('widget: counts, shows the table, Update above the limit, level controls', async () => {
  const requests = [];
  let count = 10;
  const service = {
    async count() { return count; },
    async tabulate(query, crosstab) { requests.push({ query, crosstab }); return structuredClone(ANSWER); }
  };
  const host = document.createElement('div');
  document.body.append(host);
  const widget = new HCrosstab().attach(host, {
    service, labels, enhance: false, level: 'display', fieldLabel: (code) => `F${code}`,
    settings: { rows: { code: '12:133' }, columns: { code: '12:lt5:7:26' } }
  }).render();
  await widget.setQuery([{ t: '12' }]);
  await flush();
  assert.equal(requests.length, 1);
  assert.ok(host.querySelector('table.h-crosstab-table'));
  assert.match(host.querySelector('.h-crosstab-status').textContent, /10/);
  // display level: the flags and the swap button, no pivot selects
  assert.ok(host.querySelector('.h-crosstab-flags'));
  assert.equal([...host.querySelectorAll('.h-crosstab-control span')].some((node) => node.textContent === 'Rows'), false);
  count = 60000;
  await widget.setQuery([{ t: '12' }]);
  await flush();
  assert.equal(requests.length, 1);
  assert.match(host.querySelector('.h-crosstab-status').textContent, /Update/);
  await widget.load({ force: true });
  assert.equal(requests.length, 2);
  // the count known by the host: no op=count request
  service.count = async () => { throw new Error('count must not be asked'); };
  await widget.setQuery([{ t: '12' }], { count: 10 });
  await flush();
  assert.equal(requests.length, 3);
  await widget.destroy();
});

test('widget: the visitor level is the lower of the place and the settings; pivot changes the request', async () => {
  const requests = [];
  const service = { async count() { return 1; }, async tabulate(query, crosstab) { requests.push(crosstab); return structuredClone(ANSWER); } };
  const host = document.createElement('div');
  document.body.append(host);
  const viewOnly = new HCrosstab().attach(host, {
    service, labels, enhance: false, level: 'pivot', settings: { rows: { code: '12:133' }, visitor: { level: 'view' } }
  }).render();
  assert.equal(host.querySelector('.h-crosstab-flags'), null);
  await viewOnly.destroy();
  const host2 = document.createElement('div');
  document.body.append(host2);
  const pivot = new HCrosstab().attach(host2, {
    service, labels, enhance: false, level: 'pivot',
    settings: { rows: { code: '12:133' }, visitor: { level: 'pivot', fields: ['12:26'] } }
  }).render();
  await pivot.setQuery([{ t: '12' }]);
  const rowsSelect = [...host2.querySelectorAll('.h-crosstab-control')].find((node) => node.textContent.startsWith('Rows')).querySelector('select');
  rowsSelect.value = '12:26';
  rowsSelect.dispatchEvent(new Event('change'));
  await flush();
  assert.equal(requests.at(-1).rows.code, '12:26');
  await pivot.destroy();
});

test('HRangeList (taken out of the thematic map editor): intervals, remove, extra columns', async () => {
  const { HRangeList } = await import('../src/widgets/symbology/HRangeList.js');
  const ranges = [{ value: '1<>5' }, { value: '6' }];
  let changes = 0;
  const host = document.createElement('div');
  const list = new HRangeList().attach(host, {
    ranges, enumField: false, onChange: () => { changes++; },
    extras: (row, range) => {
      const label = document.createElement('span');
      label.className = 'extra';
      label.textContent = range.value;
      return [label];
    }
  }).render();
  assert.equal(host.children.length, 2);
  assert.equal(host.querySelectorAll('.extra').length, 2);
  const [from, to] = host.children[1].querySelectorAll('input');
  to.value = '9';
  to.dispatchEvent(new Event('input'));
  assert.equal(ranges[1].value, '6<>9');
  host.children[0].querySelector('.h-thematic-range-remove').dispatchEvent(new Event('click'));
  assert.deepEqual(ranges, [{ value: '6<>9' }]);
  assert.equal(changes, 2);
  assert.ok(from);
  await list.destroy();
});

test('widget: the second line — Rows / Columns as text without pivot, selects with pivot', async () => {
  const service = { async count() { return 1; }, async tabulate() { return structuredClone(ANSWER); } };
  const host = document.createElement('div');
  document.body.append(host);
  const settings = { rows: { code: '12:133' }, columns: { code: '12:lt5:7:26' }, visitor: { level: 'pivot', fields: ['12:133', '12:lt5:7:26'] } };
  const shown = new HCrosstab().attach(host, { service, labels, enhance: false, level: 'display', fieldLabel: (code) => `F${code}`, settings }).render();
  const line = host.querySelector('.h-crosstab-pivot');
  assert.ok(line.classList.contains('is-readonly'));
  assert.equal(line.querySelectorAll('select').length, 0);
  assert.deepEqual([...line.querySelectorAll('.h-crosstab-pivot-value')].map((node) => node.textContent), ['F12:133', 'F12:lt5:7:26']);
  await shown.destroy();
  const pivot = new HCrosstab().attach(host, { service, labels, enhance: false, level: 'pivot', fieldLabel: (code) => `F${code}`, settings }).render();
  const second = host.querySelector('.h-crosstab-pivot');
  assert.equal(second.classList.contains('is-readonly'), false);
  assert.equal(second.querySelectorAll('select').length, 3, 'Rows, Columns, Pages in the second line');
  assert.equal(host.querySelector('.h-crosstab-controls').querySelectorAll('select').length, 2, 'Show and Chart stay in the first');
  await pivot.destroy();
});

test('configuration: modes of the form, stored settings, publication', async () => {
  const { crosstabsConfiguration, crosstabsFormFields, crosstabsAutoLimit } = await import('../src/widgets/crosstabs/crosstabsConfiguration.js');
  const names = (mode) => crosstabsFormFields(mode, { crosstabPresets: [{ id: '5', label: 'A' }] }).map((field) => field.name);
  assert.deepEqual(names('website'), ['preset', 'from', 'level', 'ui.showSourceHeader', 'config.defaults.maxAutoReload']);
  assert.deepEqual(names('publication'), ['preset', 'records', 'level', 'ui.showSourceHeader', 'ui.language']);
  assert.deepEqual(names('configuration'), ['source', 'level']);
  assert.deepEqual(crosstabsFormFields('website', { crosstabPresets: [{ id: '5', label: 'A' }] })[0].terms, [{ id: '5', label: 'A' }]);
  const { normalize, serialize, preparePublication } = crosstabsConfiguration;
  assert.deepEqual(serialize(normalize({ preset: ['7'], from: ['own', 'links', ''], level: 'bogus', records: 'own' })),
    { preset: 7, from: ['own', 'links'] });
  // header and limit kept; the default limit and an unchecked header are not stored
  assert.deepEqual(serialize(normalize({ preset: 7, ui: { showSourceHeader: true }, config: { defaults: { maxAutoReload: '25000' } } })),
    { preset: 7, ui: { showSourceHeader: true }, config: { defaults: { maxAutoReload: '25000' } } });
  // the language of a published page is kept, Automatic is not (review 7: Test module configuration)
  assert.deepEqual(serialize(normalize({ preset: 7, ui: { language: 'fre' } })), { preset: 7, ui: { language: 'fre' } });
  assert.deepEqual(serialize(normalize({ preset: 7, ui: { language: 'auto' } })), { preset: 7 });
  // a value no longer in the list (review 6): the default
  assert.deepEqual(serialize(normalize({ preset: 7, config: { defaults: { maxAutoReload: '200000' } } })), { preset: 7 });
  assert.deepEqual(serialize(normalize({ preset: 7, ui: { showSourceHeader: false }, config: { defaults: { maxAutoReload: '50000' } } })),
    { preset: 7 });
  assert.equal(crosstabsAutoLimit({ config: { defaults: { maxAutoReload: 'manual' } } }), 0);
  assert.equal(crosstabsAutoLimit({ config: { defaults: { maxAutoReload: 'always' } } }), undefined);
  assert.equal(crosstabsAutoLimit({ config: { defaults: { maxAutoReload: '100000' } } }), 100000);
  assert.equal(crosstabsAutoLimit({}), undefined);
  assert.deepEqual(preparePublication({ settings: { preset: 7, records: 'current', level: 'view' }, publication: { query: [{ t: '10' }] } }),
    { settings: { preset: 7, from: ['own'], level: 'view', query: [{ t: '10' }], ui: { language: 'auto' } }, state: null });
  assert.deepEqual(preparePublication({ settings: { preset: 7, records: 'own' }, publication: { query: [{ t: '10' }] } }).settings,
    { preset: 7, from: ['own'], ui: { language: 'auto' } });
  // as Explorer publishes (review 5): the serialized settings lose `records`, the form values keep it
  const values = normalize({ preset: 7, records: 'own', ui: { showSourceHeader: true, language: 'fre' } });
  assert.deepEqual(preparePublication({ settings: serialize(values), values, publication: { query: [{ t: '10' }] } }).settings,
    { preset: 7, from: ['own'], ui: { showSourceHeader: true, language: 'fre' } });
});

test('configuration: every field of a mode is shown without Advanced (review 6)', async () => {
  const { crosstabsConfiguration } = await import('../src/widgets/crosstabs/crosstabsConfiguration.js');
  const { normalizeEditForm, ruleHides } = await import('../src/data/editFormSchema.js');
  const { form } = normalizeEditForm(crosstabsConfiguration.form);
  for (const mode of ['website', 'publication', 'configuration']) {
    const context = { mode, showOptional: false };
    const shown = form.groups.filter((group) => !ruleHides(group, context))
      .flatMap((group) => group.children.filter((field) => !ruleHides(field, context)).map((field) => field.name));
    const all = form.groups.flatMap((group) => group.children).filter((field) => !field.modes || field.modes.includes(mode))
      .map((field) => field.name);
    assert.deepEqual(shown, all, mode);
  }
});

test('own query: counts with some values, the empty parameters left out (review 6)', async () => {
  const { ownCount } = await import('../src/widgets/crosstabs/crosstabParams.js');
  const query = [{ t: '10' }, { title: '$A$' }, { 'f:9': '$B$' }];
  assert.match(ownCount(query, { values: {} }).message, /needs a value of 'title', 'f:9'/);
  assert.equal(ownCount(query, { values: {} }).q, null);
  assert.deepEqual(ownCount(query, { values: { A: 'x' } }).q, [{ t: '10' }, { title: 'x' }]);
  assert.equal(ownCount([{ ids: '$SELECTED$' }, { title: '$A$' }], { values: { A: 'x' } }).q, null, 'the selection is needed');
  assert.deepEqual(ownCount([{ t: '10' }], {}).q, [{ t: '10' }]);
  assert.equal(ownCount(null).q, null);
});

test('crosstab: the automatic count limit (manual: Update, always: no count request)', async () => {
  const { autoLimit } = await import('../src/widgets/crosstabs/HCrosstab.js');
  assert.equal(autoLimit(undefined), 50000);
  assert.equal(autoLimit(0), 0);
  assert.equal(autoLimit('manual'), 0);
  assert.equal(autoLimit('always'), Infinity);
  assert.equal(autoLimit(100000), 100000);
});

test('parameter captions: the Filter Form label, else the field, else the name', async () => {
  const { parameterCaptions, missingValuesText } = await import('../src/widgets/crosstabs/crosstabParams.js');
  const dbdefs = { fieldGlobal: (id) => (id === 9 ? { id: 9, name: 'Year', type: 'year' } : null), rectypeName: () => '' };
  const query = [{ t: '10' }, { 'f:9': '$X1$' }, { title: '$X2$' }, { 'f:5': '$X3$' }];
  const filterForm = { groups: [{ children: [{ input: 'X3', label: 'Country' }] }] };
  assert.deepEqual(parameterCaptions(['X1', 'X3', 'Q'], query, filterForm, dbdefs), ['Year', 'Country', 'Q']);
  assert.match(missingValuesText(['X1'], query, null, dbdefs), /needs a value of 'Year'$/);
});

test('parameter form: shown for a query with parameters, kept for the same crosstab, hidden without them', async () => {
  const { CrosstabParams, askedParameters } = await import('../src/widgets/crosstabs/crosstabParams.js');
  assert.deepEqual(askedParameters([{ t: '10' }, { title: '$NAME$' }, { ids: '$SELECTED$' }]), ['NAME']);
  const host = document.createElement('div');
  host.className = 'own-class';
  document.body.append(host);
  const params = new CrosstabParams(host, { onSubmit: () => {} });
  const preset = { id: 3, query: [{ t: '10' }, { title: '$NAME$' }], settings: { filterForm: null } };
  assert.equal(params.show(preset, {}), true);
  const form = params.form;
  assert.equal(host.hidden, false);
  assert.ok(host.classList.contains('own-class') && host.classList.contains('h-crosstab-params'), 'the host keeps its classes');
  params.show(preset, { NAME: 'x' });
  assert.equal(params.form, form, 'the same crosstab keeps its form (Filter does not close it)');
  assert.equal(params.show({ id: 4, query: [{ t: '10' }] }, {}), false);
  assert.equal(host.hidden, true);
  // vertical (default) at the left of the crosstab, horizontal above it (review 6); the extent picker goes to the form
  const layout = document.createElement('div');
  const selectExtent = () => null;
  const placed = new CrosstabParams(document.createElement('div'), { layout, selectExtent, onSubmit: () => {} });
  placed.show(preset, {});
  assert.equal(layout.classList.contains('h-crosstab-params-left'), true);
  assert.equal(placed.form.options.selectExtent, selectExtent);
  placed.show({ ...preset, id: 5, settings: { filterForm: { settings: { orientation: 'horizontal' }, groups: [] } } }, {});
  assert.equal(layout.classList.contains('h-crosstab-params-left'), false);
  placed.hide();
});

test('the texts of DataTables come from the language of the UI', () => {
  const fre = { Search: 'Rechercher', 'No records': 'Aucun enregistrement', 'No matching records': 'Aucun enregistrement correspondant', Print: 'Imprimer' };
  const language = dataTablesLanguage((text) => fre[text] || text);
  assert.equal(language.search, 'Rechercher:');
  assert.equal(language.emptyTable, 'Aucun enregistrement');
  assert.equal(language.zeroRecords, 'Aucun enregistrement correspondant');
  assert.equal(language.buttons.print, 'Imprimer');
});
