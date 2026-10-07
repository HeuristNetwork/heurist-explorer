import test from 'node:test';
import assert from 'node:assert/strict';
import {
  METADATA_FIELDS, MINIMAL_FIELDS, anyRules, buildExportParams, columnsForRecordType, dataSourceFields, defaultExportState,
  defaultLimit, effectiveLimit, exportFormat, exportProblems, exportRules, fieldCodeRecordType, limitChoices,
  presetColumns, recordTypeColumns, recordTypeList, scopeRecordType
} from '../src/tools/export/exportParams.js';

const dbdefs = {
  field: (rty, dty) => ({ 10: [1, 18, 20, 134, 10], 12: [1, 26, 28] }[rty] || []).includes(dty) ? { id: dty } : null,
  fields: (rty) => ({
    10: [{ id: 1, type: 'freetext' }, { id: 99, type: 'separator' }, { id: 20, type: 'enum' }, { id: 235, type: 'relmarker' }],
    12: [{ id: 1, type: 'freetext' }, { id: 28, type: 'geo' }]
  }[rty] || []),
  rectypeName: (id) => ({ 10: 'Person', 12: 'Place' }[id] || '')
};

const source = {
  request: { q: 't:10,12' },
  presentation: {
    data: { fields: [{ field: 'rec_Title' }, { field: '20', ext: 'code' }, { field: '26' }] },
    map: { geoFields: ['28', '10:lf134:12:28'] },
    timeline: { fields: ['10'] }
  }
};

test('field codes of paths belong to their first record type', () => {
  assert.equal(fieldCodeRecordType('10:lf134:12:1'), 10);
  assert.equal(fieldCodeRecordType('1'), null);
  assert.equal(fieldCodeRecordType('rec_Title'), null);
});

test('DataSource fields are sorted to record types', () => {
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
  assert.deepEqual(dataSourceFields(source).geo, ['28', '10:lf134:12:28']);
  assert.deepEqual(dataSourceFields(source).time, ['10']);
});

test('column presets: minimal, metadata, all (no separators/markers), custom (empty = minimal)', () => {
  assert.deepEqual(presetColumns('minimal', 10).map((c) => c.field), MINIMAL_FIELDS);
  assert.deepEqual(presetColumns('metadata', 10).map((c) => c.field), METADATA_FIELDS);
  assert.deepEqual(presetColumns('all', 10, [], dbdefs).map((c) => c.field), [...METADATA_FIELDS, '1', '20']);
  assert.deepEqual(presetColumns('custom', 10, [], dbdefs).map((c) => c.field), MINIMAL_FIELDS);
  assert.deepEqual(presetColumns('custom', 10, [{ field: '20', ext: 'conceptid', title: 'x' }]), [{ field: '20', ext: 'conceptid' }]);
});

test('record type columns: preset merged with the marked data source settings', () => {
  const state = { ...defaultExportState(), format: 'csv' };
  assert.deepEqual(recordTypeColumns(state, 10, source, dbdefs), [
    { field: 'rec_ID' }, { field: 'rec_RecTypeID' }, { field: 'rec_Title' }, { field: '20', ext: 'code' }, { field: '10' }
  ], 'column fields and time fields; no geo fields for CSV; rec_Title once');
  const geo = recordTypeColumns({ ...state, format: 'geojson' }, 10, source, dbdefs).map((c) => c.field);
  assert.ok(geo.includes('10:lf134:12:28'), 'geo fields for GeoJSON');
  const none = recordTypeColumns({ ...state, useColumnFields: false, useTimeFields: false }, 10, source, dbdefs);
  assert.deepEqual(none.map((c) => c.field), MINIMAL_FIELDS);
});

test('CSV parameters: columns of every record type, value formats, separator', () => {
  const state = { ...defaultExportState(), format: 'csv', columnModes: { 12: 'custom' },
    columns: { 12: [{ field: '1', title: 'Name' }] }, useColumnFields: false, useTimeFields: false };
  state.csv.sep = ';';
  state.limit = 5000;
  state.values = { ...state.values, date: 'readable', pointerTitle: true, termHierarchy: true };
  const params = buildExportParams(state, { query: 't:10,12', title: 'Persons', source, recordTypes: [12, 10], dbdefs,
    rules: [{ query: { t: 12 } }] });
  assert.deepEqual(params.scope, { query: 't:10,12' });
  assert.deepEqual(params.columns, { 12: ['1'], 10: MINIMAL_FIELDS });
  assert.equal(params.csv.sep, ';');
  assert.equal(params.limit, 5000);
  assert.deepEqual(params.values, { date: 'readable', file: 'url', pointerTitle: true, termHierarchy: true });
  assert.equal('rules' in params, false, 'no expansion for CSV');
  assert.equal('names' in params, false);
});

test('scope: selection or one record type of the result', () => {
  assert.equal(scopeRecordType('rt:12'), 12);
  const selection = buildExportParams({ ...defaultExportState(), format: 'tsv', scope: 'selection' },
    { query: 't:10,12', selection: [5, '7'], recordTypes: [12] });
  assert.deepEqual(selection.scope.ids, [5, 7]);
  assert.equal(selection.csv.sep, 'tab');
  const byType = buildExportParams({ ...defaultExportState(), format: 'csv', scope: 'rt:12', useColumnFields: false,
    useTimeFields: false }, { query: 't:10,12', recordTypes: [12, 10] });
  assert.deepEqual(byType.scope.rectypes, [12]);
  assert.deepEqual(Object.keys(byType.columns), ['12'], 'only the chosen record type');
});

test('XML is the default; JSON and XML: names option, expansion, no columns or value formats', () => {
  assert.equal(defaultExportState().format, 'xml');
  for (const format of ['json', 'xml']) {
    const params = buildExportParams({ ...defaultExportState(), format, names: true, rulesMode: 'any' }, { query: 't:10' });
    assert.equal(params.names, true);
    assert.deepEqual(params.rules, anyRules('connected', 1));
    assert.equal('columns' in params, false);
    assert.equal('values' in params, false);
  }
});

test('geo and time fields of the data source for GeoJSON and KML', () => {
  const kml = buildExportParams({ ...defaultExportState(), format: 'kml' }, { query: 't:12', source, recordTypes: [12] });
  assert.deepEqual(kml.geofields, ['28', '10:lf134:12:28']);
  assert.deepEqual(kml.timefields, ['10']);
  const geojson = buildExportParams({ ...defaultExportState(), format: 'geojson', useGeoFields: false },
    { query: 't:12', source, recordTypes: [12] });
  assert.equal('geofields' in geojson, false, 'not marked');
});

test('expansion: any link kind with depth, data source rules, custom rules; only JSON, XML, Gephi', () => {
  assert.deepEqual(anyRules('lf', 1), [{ query: { lf: [] }, levels: [] }]);
  assert.deepEqual(anyRules('related', 2), [{ query: { related: [] }, levels: [{ query: { related: [] }, levels: [] }] }]);
  const state = { ...defaultExportState(), format: 'gephi' };
  const rules = [{ query: { t: 12 } }];
  assert.equal(exportRules(state, rules), null);
  assert.deepEqual(exportRules({ ...state, rulesMode: 'source' }, rules), rules);
  assert.deepEqual(exportRules({ ...state, rulesMode: 'custom', customRules: [{ query: { t: 5 } }] }, rules), [{ query: { t: 5 } }]);
  assert.equal(exportRules({ ...state, format: 'kml', rulesMode: 'any' }, rules), null, 'no expansion for KML');
});

test('limits: all, 50, 1K ... 500K; Gephi 50 ... 10K; format change resets', () => {
  assert.deepEqual(limitChoices('csv'), [0, 50, 1000, 5000, 10000, 100000, 500000]);
  assert.deepEqual(limitChoices('gephi'), [50, 1000, 5000, 10000]);
  assert.equal(defaultLimit('csv'), 0);
  assert.equal(defaultLimit('gephi'), 10000);
  assert.equal(effectiveLimit(500000, 'gephi'), 10000);
  assert.equal(effectiveLimit(50, 'gephi'), 50);
});

test('problems block the export', () => {
  const state = { ...defaultExportState(), format: 'csv' };
  assert.deepEqual(exportProblems(state, { query: 't:10' }), [], 'CSV without custom columns exports the minimal ones');
  assert.ok(exportProblems({ ...state, scope: 'selection' }, { query: 't:10', selection: [] }).includes('No records are selected'));
  assert.ok(exportProblems({ ...state, format: 'json', rulesMode: 'source' }, { query: 't:10', rules: null })
    .includes('The data source has no expansion rules'));
  assert.ok(exportProblems({ ...state, format: 'xml', rulesMode: 'custom' }, { query: 't:10' }).includes('Define the custom expansion rules'));
  assert.deepEqual(exportProblems({ ...state, rulesMode: 'custom' }, { query: 't:10' }), [], 'CSV ignores the expansion setting');
  assert.ok(exportProblems({ ...state, fileName: '../x' }, { query: 't:10' }).length > 0);
  assert.equal(exportFormat('nope').value, 'xml');
});

test('record types of the result, largest first', () => {
  assert.deepEqual(recordTypeList([{ rec_RecTypeID: 10, count: 3 }, { rec_RecTypeID: 12, count: 95 }], dbdefs), [
    { id: 12, name: 'Place', count: 95 },
    { id: 10, name: 'Person', count: 3 }
  ]);
});
