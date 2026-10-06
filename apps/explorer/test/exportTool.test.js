import test from 'node:test';
import assert from 'node:assert/strict';
import {
  anyRules, buildExportParams, columnsForRecordType, defaultExportState, effectiveLimit, exportFormat, exportProblems,
  exportRules, fieldCodeRecordType, limitChoices, recordTypeList, scopeRecordType
} from '../src/tools/export/exportParams.js';

const dbdefs = {
  field: (rty, dty) => ({ 10: [1, 18, 20, 134], 12: [1, 26, 28] }[rty] || []).includes(dty) ? { id: dty } : null,
  rectypeName: (id) => ({ 10: 'Person', 12: 'Place' }[id] || '')
};

test('field codes of paths belong to their first record type', () => {
  assert.equal(fieldCodeRecordType('10:lf134:12:1'), 10);
  assert.equal(fieldCodeRecordType('1'), null);
  assert.equal(fieldCodeRecordType('rec_Title'), null);
});

test('DataSource column fields are sorted to record types', () => {
  const fields = [
    { field: 'rec_Title', title: 'Title' },
    { field: '1', title: 'Name' },
    { field: '20', title: 'Gender (Code)', ext: 'code' },
    { field: '26', title: 'Country' },
    { field: '10:lf134:12:1', title: 'Birth place' },
    { field: '18', title: 'Hidden', visible: false }
  ];
  assert.deepEqual(columnsForRecordType(fields, 10, dbdefs).map((c) => c.field), ['rec_Title', '1', '20', '10:lf134:12:1']);
  assert.deepEqual(columnsForRecordType(fields, 12, dbdefs).map((c) => c.field), ['rec_Title', '1', '26']);
  assert.equal(columnsForRecordType(fields, 10, dbdefs)[2].ext, 'code', 'enum output is kept');
});

test('CSV parameters: columns per record type, enum outputs, value formats, separator', () => {
  const state = defaultExportState();
  state.columns = { 10: [{ field: '1', title: 'Name' }, { field: '20', title: 'Gender', ext: 'internalid' }] };
  state.csv.sep = ';';
  state.limit = 5000;
  const params = buildExportParams(state, { query: 't:10', title: 'Persons', rules: [{ query: { t: 12 } }] });
  assert.deepEqual(params.scope, { query: 't:10' });
  assert.deepEqual(params.columns, { 10: ['1', { field: '20', ext: 'internalid' }] });
  assert.equal(params.csv.sep, ';');
  assert.equal(params.limit, 5000);
  assert.equal(params.title, 'Persons');
  assert.deepEqual(params.values, { date: 'asis', file: 'url', pointer: 'id', enum: 'term' });
  assert.equal('rules' in params, false, 'no expansion by default');
  assert.equal('names' in params, false, 'names apply to JSON and XML only');
});

test('scope: selection or one record type of the result', () => {
  assert.equal(scopeRecordType('rt:12'), 12);
  assert.equal(scopeRecordType('result'), null);
  const selection = buildExportParams({ ...defaultExportState(), format: 'tsv', scope: 'selection',
    columns: { 12: [{ field: '1' }] } }, { query: 't:10,12', selection: [5, '7'] });
  assert.deepEqual(selection.scope.ids, [5, 7]);
  assert.equal(selection.csv.sep, 'tab');
  const byType = buildExportParams({ ...defaultExportState(), scope: 'rt:12',
    columns: { 10: [{ field: '18' }], 12: [{ field: '1' }] } }, { query: 't:10,12' });
  assert.deepEqual(byType.scope.rectypes, [12]);
  assert.deepEqual(byType.columns, { 12: ['1'] }, 'only the columns of the chosen record type');
});

test('JSON and XML: names option, no columns and no value formats', () => {
  for (const format of ['json', 'xml']) {
    const params = buildExportParams({ ...defaultExportState(), format, names: true }, { query: 't:10' });
    assert.equal(params.names, true);
    assert.equal('columns' in params, false);
    assert.equal('values' in params, false, `${format} writes values as stored`);
    assert.equal('csv' in params, false);
  }
  assert.equal(buildExportParams({ ...defaultExportState(), format: 'json' }, { query: 't:10' }).names, false);
});

test('expansion: any link kind with depth, data source rules, custom rules', () => {
  assert.deepEqual(anyRules('lf', 1), [{ query: { lf: [] }, levels: [] }]);
  assert.deepEqual(anyRules('related', 3), [{ query: { related: [] }, levels: [
    { query: { related: [] }, levels: [{ query: { related: [] }, levels: [] }] }] }]);
  assert.deepEqual(anyRules('nope', 9), anyRules('connected', 4), 'unknown kind and depth are corrected');

  const source = [{ query: { t: 12 } }];
  const state = defaultExportState();
  assert.equal(exportRules(state, source), null);
  assert.deepEqual(exportRules({ ...state, rulesMode: 'source' }, source), source);
  assert.deepEqual(exportRules({ ...state, rulesMode: 'custom', customRules: [{ query: { t: 5 } }] }, source), [{ query: { t: 5 } }]);
  assert.deepEqual(buildExportParams({ ...state, format: 'json', rulesMode: 'any', anyKind: 'links', anyDepth: 2 },
    { query: 't:10' }).rules, anyRules('links', 2));
});

test('limits: all, 1K ... 500K; Gephi at most 10K', () => {
  assert.deepEqual(limitChoices('csv'), [0, 1000, 5000, 10000, 100000, 500000]);
  assert.deepEqual(limitChoices('gephi'), [1000, 5000, 10000]);
  assert.equal(effectiveLimit(0, 'gephi'), 10000);
  assert.equal(effectiveLimit(500000, 'gephi'), 10000);
  assert.equal(effectiveLimit(5000, 'gephi'), 5000);
  assert.equal(effectiveLimit(0, 'json'), 0);
  const state = { ...defaultExportState(), format: 'gephi', useColumns: true,
    columns: { 10: [{ field: '1' }, { field: '20', ext: 'term' }], 12: [{ field: '1' }] } };
  const params = buildExportParams(state, { query: 't:10' });
  assert.equal(params.limit, 10000);
  assert.deepEqual(params.columns, { '*': ['1', { field: '20', ext: 'term' }] }, 'one attribute list for Gephi');
});

test('problems block the export', () => {
  const state = defaultExportState();
  assert.deepEqual(exportProblems(state, { query: 't:10' }), ['Choose the columns to export'], 'CSV needs columns');
  state.columns = { 10: [{ field: '1' }] };
  assert.deepEqual(exportProblems(state, { query: 't:10' }), []);
  assert.ok(exportProblems({ ...state, scope: 'selection' }, { query: 't:10', selection: [] }).includes('No records are selected'));
  assert.ok(exportProblems({ ...state, scope: 'rt:12' }, { query: 't:10' }).includes('Choose the columns to export'),
    'the chosen record type needs columns');
  assert.ok(exportProblems({ ...state, rulesMode: 'source' }, { query: 't:10', rules: null })
    .includes('The data source has no expansion rules'));
  assert.ok(exportProblems({ ...state, rulesMode: 'custom' }, { query: 't:10' }).includes('Define the custom expansion rules'));
  assert.ok(exportProblems({ ...state, fileName: '../x' }, { query: 't:10' }).length > 0);
  assert.deepEqual(exportProblems({ ...defaultExportState(), format: 'json' }, { query: 't:10' }), [], 'JSON needs no columns');
  assert.equal(exportFormat('nope').value, 'csv');
});

test('record types of the result, largest first', () => {
  assert.deepEqual(recordTypeList([{ rec_RecTypeID: 10, count: 3 }, { rec_RecTypeID: 12, count: 95 }], dbdefs), [
    { id: 12, name: 'Place', count: 95 },
    { id: 10, name: 'Person', count: 3 }
  ]);
});
