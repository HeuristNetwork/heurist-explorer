/**
 * @file crosstabsForm.test.js
 * @brief Crosstabs tool (plan 27q2 §8): the form JSON and the round trip settings → form values → settings.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { bucketTermsFor, crosstabsForm, defaultBucketMode, formValues, valuesSettings } from '../src/tools/crosstabs/crosstabsForm.js';
import { groupCrosstabPresets } from '../src/tools/crosstabs/crosstabsPresets.js';
import { installFakeDom } from '../../../shared/test/helpers/fakeDom.js';
import { normalizeCrosstabSettings } from '#shared/widgets/crosstabs/crosstabModel.js';

const IDS = { query: 12, form: 13 };

installFakeDom();
const { crosstabCode } = await import('../src/tools/crosstabs/CrosstabsDesigner.js');

test('form: sections, required rows field and record type, the measure fields', () => {
  const form = crosstabsForm({ ids: IDS, rectypes: [{ id: 10, label: 'Person' }], numericFields: [{ id: 1160, label: 'Population' }] });
  assert.deepEqual(form.groups.map((group) => group.id), ['source', 'rows', 'columns', 'pages', 'measure', 'display', 'visitor']);
  const fields = form.groups.flatMap((group) => group.children);
  assert.equal(fields.find((field) => field.name === 'rowsCode').req, 'required');
  assert.equal(fields.find((field) => field.name === 'columnsCode').req, undefined);
  assert.equal(fields.find((field) => field.name === '12').special, 'query');
  assert.deepEqual(fields.find((field) => field.name === 'measureField').terms, [{ id: '1160', label: 'Population' }]);
});

test('round trip: every part of the settings', () => {
  const settings = normalizeCrosstabSettings({
    fields: { rectype: 10 },
    rows: { code: '10:lt240:48:237', label: { def: 'Event', fre: 'Événement' } },
    columns: { code: '10:10', buckets: { groupby: 'century' } },
    pages: { code: '10:1160', buckets: { ranges: ['0<>10', { value: '11<>20', label: 'Big' }] } },
    measure: { op: 'avg', field: 1160 },
    display: { values: false, percentRow: true, decimals: 2, title: { def: 'Events' } },
    chart: { show: 'both', type: 'pie' },
    visitor: { level: 'pivot', fields: ['10:20'], measures: ['count', 'sum'], export: ['csv'], drill: true }
  });
  const values = formValues({ title: 'Test', query: '[{"t":"10"}]', settings }, IDS);
  assert.equal(values.columnsBuckets, 'groupby');
  assert.equal(values.pagesBuckets, 'ranges');
  assert.deepEqual(values.rowsLabel, ['Event', 'fre:Événement']);
  const back = valuesSettings(values, IDS);
  assert.equal(back.title, 'Test');
  assert.equal(back.query, '[{"t":"10"}]');
  assert.deepEqual(back.settings, settings);
});

test('a dimension without a field is left out; equal ranges', () => {
  const values = formValues({ title: '', query: '', settings: normalizeCrosstabSettings({ rows: { code: '10:20' } }) }, IDS);
  values.columnsCode = '10:1160';
  values.columnsBuckets = 'count';
  values.columnsCount = 5;
  const { settings } = valuesSettings(values, IDS);
  assert.equal(settings.pages, null);
  assert.deepEqual(settings.columns.buckets, { ranges: 5 });
});

test('review 2026-11-22: labels, the hidden filter form, Show totals after Column %', () => {
  const form = crosstabsForm({ ids: IDS, fieldTypes: { rows: 'date' } });
  const fields = form.groups.flatMap((group) => group.children);
  assert.equal(fields.find((field) => field.name === '12').label, 'Query');
  assert.equal(fields.find((field) => field.name === 'fieldsOf').label, 'Record type');
  assert.equal(fields.find((field) => field.name === '13').special, 'filterForm');
  assert.equal(form.groups.find((group) => group.id === 'display').label, 'Display and default values');
  const flags = form.groups.find((group) => group.id === 'display').children.map((field) => field.name);
  assert.equal(flags.indexOf('totals'), flags.indexOf('percentColumn') + 1);
  assert.deepEqual(fields.find((field) => field.name === 'rowsBuckets').terms.map((term) => term.id), ['groupby', 'values', 'ranges']);
  assert.deepEqual(fields.find((field) => field.name === 'columnsBuckets').terms.map((term) => term.id), ['values']);
});

test('values by field type and their defaults', () => {
  assert.equal(defaultBucketMode('date'), 'groupby');
  assert.equal(defaultBucketMode('integer'), 'count');
  assert.equal(defaultBucketMode('year'), 'count');
  assert.equal(defaultBucketMode('enum'), 'values');
  assert.deepEqual(bucketTermsFor('enum').map((term) => term.id), ['values', 'ranges']);
  assert.deepEqual(bucketTermsFor('freetext').map((term) => term.id), ['values']);
  assert.deepEqual(bucketTermsFor('resource').map((term) => term.id), ['values']);
  assert.deepEqual(bucketTermsFor(null).map((term) => term.id), ['values']);
});

test('the filter form of the parameters round trip', () => {
  const settings = normalizeCrosstabSettings({ rows: { code: '10:20' }, filterForm: { fields: [{ name: 'LIBRARY' }] } });
  const values = formValues({ title: 'T', query: '[{"f:1":"$LIBRARY$"}]', settings }, IDS);
  assert.equal(values['13'], JSON.stringify({ fields: [{ name: 'LIBRARY' }] }));
  assert.deepEqual(valuesSettings(values, IDS).settings.filterForm, { fields: [{ name: 'LIBRARY' }] });
});

test('field tree codes as crosstab codes: header fields renamed, ID and URL refused', () => {
  assert.equal(crosstabCode('10:20'), '10:20');
  assert.equal(crosstabCode('rec_Added'), 'added');
  assert.equal(crosstabCode('10:lt5:12:rec_OwnerUGrpID'), '10:lt5:12:owner');
  assert.equal(crosstabCode('rec_ID'), '');
  assert.equal(crosstabCode('rec_URL'), '');
  assert.equal(crosstabCode(''), '');
});

test('chooser: crosstabs for the record types of the result first, the others after', () => {
  const presets = [{ id: 1, title: 'A', rectype: 10 }, { id: 2, title: 'B', rectype: 12 }, { id: 3, title: 'C', rectype: null }];
  const grouped = groupCrosstabPresets(presets, [{ id: 10, name: 'Person', count: 40 }]);
  assert.deepEqual(grouped.fitting.map((item) => [item.id, item.count]), [[1, 40]]);
  assert.deepEqual(grouped.other.map((item) => item.id), [2, 3]);
  assert.deepEqual(groupCrosstabPresets(presets, null).fitting.length, 3);
});
