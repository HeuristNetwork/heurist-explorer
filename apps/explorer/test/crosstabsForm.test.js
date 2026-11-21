/**
 * @file crosstabsForm.test.js
 * @brief Crosstabs tool (plan 27q2 §8): the form JSON and the round trip settings → form values → settings.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { crosstabsForm, formValues, valuesSettings } from '../src/tools/crosstabs/crosstabsForm.js';
import { normalizeCrosstabSettings } from '#shared/widgets/crosstabs/crosstabModel.js';

const IDS = { query: 12 };

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
