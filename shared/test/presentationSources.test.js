/**
 * @file presentationSources.test.js
 * @brief Presentation sources (presentation-sources.md, plan 27q2 §17): the record type of a configuration and the own
 *        query with parameters (`$SELECTED$`); HCrosstab counts only that record type, All values of the pages, Stop;
 *        the service through the HeuristApiClient; Current result of the ▾ query chooser; the type filter of a field
 *        tree with fixed types.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 * @since       8.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom, flush } from './helpers/fakeDom.js';
import { ownQuery, readQuery, recordTypeQuery, SELECTED_PARAMETER } from '../src/data/presentationSource.js';
import { CrosstabService } from '../src/widgets/crosstabs/crosstabService.js';
import { normalizeCrosstabSettings } from '../src/widgets/crosstabs/crosstabModel.js';

installFakeDom();
const { HCrosstab } = await import('../src/widgets/crosstabs/HCrosstab.js');
const { querySourceAction } = await import('../src/widgets/edit-form/querySourceChooser.js');
const { HFieldTree } = await import('../src/widgets/field-tree/HFieldTree.js');

/** An answer with pages: Place type × Country, pages by century. */
const PAGED = {
  total: 6,
  rows: { code: '12:133', field: '133', type: 'category', fieldType: 'enum', buckets: [{ value: 1 }, { value: 2 }] },
  columns: null,
  pages: { code: '12:10', field: '10', type: 'date', fieldType: 'date', buckets: [{ from: '1800', to: '1899', label: '1800s' }, { from: '1900', to: '1999', label: '1900s' }] },
  measure: { op: 'count' },
  cells: [[0, 0, 0, 2], [1, 0, 0, 1], [0, 0, 1, 2], [1, 0, 1, 1]],
  totals: { rows: [[0, 0, 2], [0, 1, 1], [1, 0, 2], [1, 1, 1]], columns: [], pages: [[0, 3], [1, 3]], grand: [6] }
};
/** The same without pages (a record counted once). */
const MERGED = {
  total: 5,
  rows: PAGED.rows,
  columns: null,
  pages: null,
  measure: { op: 'count' },
  cells: [[0, 0, 0, 3], [1, 0, 0, 2]],
  totals: { rows: [[0, 0, 3], [0, 1, 2]], columns: [], pages: [[0, 5]], grand: [5] }
};

test('record type query: JSON, JSON text, object, legacy text, without a type', () => {
  assert.deepEqual(recordTypeQuery([{ f: '1' }], 10), [{ t: '10' }, { f: '1' }]);
  assert.deepEqual(recordTypeQuery('[{"t":"10,12"}]', '12'), [{ t: '12' }, { t: '10,12' }]);
  assert.deepEqual(recordTypeQuery({ any: [] }, 5), [{ t: '5' }, { any: [] }]);
  assert.equal(recordTypeQuery('f:1:smith', 10), 't:10 f:1:smith');
  assert.deepEqual(recordTypeQuery([{ t: 117 }, { "f:1163": "Niger" }], 117), [{ t: 117 }, { "f:1163": "Niger" }], "the type is there already");
  assert.deepEqual(recordTypeQuery([{ f: '1' }], null), [{ f: '1' }]);
  assert.equal(recordTypeQuery(null, 10), null);
  assert.equal(readQuery('  '), null);
});

test('own query: parameters from values, $SELECTED$ from the selection, missing values', () => {
  const query = [{ t: '10' }, { lt: [{ ids: `$${SELECTED_PARAMETER}$` }] }, { 'f:20': '$LIBRARY$' }];
  const none = ownQuery(query);
  assert.deepEqual(none.names.sort(), ['LIBRARY', 'SELECTED']);
  assert.deepEqual(none.missing.sort(), ['LIBRARY', 'SELECTED']);
  const filled = ownQuery(JSON.stringify(query), { values: { LIBRARY: '77' }, selection: [5, 6] });
  assert.deepEqual(filled.missing, []);
  assert.equal(JSON.stringify(filled.q).includes('5,6'), true);
  assert.equal(JSON.stringify(filled.q).includes('77'), true);
  const plain = ownQuery([{ t: '10' }]);
  assert.deepEqual(plain, { q: [{ t: '10' }], names: [], missing: [] });
});

test('settings keep the filter form of the parameters', () => {
  assert.deepEqual(normalizeCrosstabSettings({ filterForm: { fields: [] } }).filterForm, { fields: [] });
  assert.equal(normalizeCrosstabSettings({ filterForm: 'x' }).filterForm, null);
});

test('HCrosstab: only the record type of the settings is counted; All values of the pages; Stop', async () => {
  const requests = [];
  let pending = null;
  const service = {
    async count(query) { requests.push({ op: 'count', query }); return 6; },
    async tabulate(query, crosstab, { signal } = {}) {
      requests.push({ op: 'crosstab', query, crosstab });
      if (pending) {
        await new Promise((resolve, reject) => {
          pending = resolve;
          signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
        });
      }
      return structuredClone(crosstab.pages ? PAGED : MERGED);
    }
  };
  const host = document.createElement('div');
  document.body.append(host);
  const widget = new HCrosstab().attach(host, {
    service, enhance: false, level: 'display',
    settings: { fields: { rectype: 12 }, rows: { code: '12:133' }, pages: { code: '12:10', buckets: { groupby: 'century' } } }
  }).render();
  await widget.setQuery([{ f: '1' }]);
  await flush();
  assert.deepEqual(requests[0].query, [{ t: '12' }, { f: '1' }]);
  assert.deepEqual(widget.countedQuery(), [{ t: '12' }, { f: '1' }]);
  // the page selector: All values first, then the pages
  const select = host.querySelector('.h-crosstab-pages').querySelector('select');
  assert.deepEqual(select.querySelectorAll('option').map((option) => option.textContent), ['All values', '1800s', '1900s']);
  select.value = '-1';
  select.dispatchEvent(new Event('change'));
  await flush();
  const merged = requests.at(-1);
  assert.equal(merged.op, 'crosstab');
  assert.equal(merged.crosstab.pages, undefined);
  assert.match(host.querySelector('.h-crosstab-status').textContent, /5/);
  // Stop while calculating
  pending = true;
  const loading = widget.load({ force: true });
  await flush();
  assert.ok(host.querySelector('.h-crosstab-stop'));
  host.querySelector('.h-crosstab-stop').dispatchEvent(new Event('click'));
  await loading;
  assert.match(host.querySelector('.h-crosstab-status').textContent, /Stopped/);
  assert.match(host.querySelector('.h-crosstab-status').textContent, /Update/);
  widget.clear('Nothing here');
  assert.match(host.querySelector('.h-crosstab-status').textContent, /Nothing here/);
  await widget.destroy();
});

test('service: through the HeuristApiClient (GET, POST for a long query)', async () => {
  const calls = [];
  const apiClient = { async request(path, options) { calls.push({ path, options }); return { data: { total: 4 } }; } };
  const service = new CrosstabService({ apiBaseUrl: '/api', database: 'db', apiClient });
  assert.equal(await service.count([{ t: '10' }]), 4);
  assert.equal(calls[0].path, '/records/aggregate');
  assert.equal(calls[0].options.query.op, 'count');
  assert.equal(calls[0].options.query.q, '[{"t":"10"}]');
  await service.tabulate([{ ids: '1,'.repeat(3000) }], { rows: { code: '10:20' } });
  assert.equal(calls[1].options.method, 'POST');
  assert.equal(calls[1].options.body.op, 'crosstab');
});

test('query chooser: the one picker (HValuePicker), fixed items first, marks, parameterized left out (27q3 review 4)', async () => {
  const anchor = document.createElement('button');
  document.body.append(anchor);
  const action = querySourceAction({
    list: async () => [{ value: 'source:3', kind: 'source', id: 3, label: 'Persons', parameterized: true },
      { value: 'filter:4', kind: 'filter', id: 4, label: 'Places', parameterized: false }],
    definition: async (choice) => (choice.value === 'current' ? { query: [{ t: '10' }] } : null),
    apply: (found) => JSON.stringify(found.query),
    first: [{ value: 'current', label: 'Current result' }]
  });
  const running = action.run('', {}, anchor);
  await flush();
  const rows = document.body.querySelectorAll('.h-value-picker-item');
  assert.deepEqual(rows.map((row) => row.querySelector('.h-value-picker-label').textContent), ['Current result', 'Places'], 'parameters without a Filter Form field: left out');
  assert.deepEqual(rows[1].querySelectorAll('.h-value-picker-mark').map((mark) => mark.textContent), ['filter']);
  rows[0].dispatchEvent(new Event('click', { bubbles: true }));
  assert.equal(await running, '[{"t":"10"}]');
});

test('field tree: the type filter of fixed types offers only their filters', () => {
  const dbdefs = {
    rectypeName: () => 'Person',
    fields: () => [{ id: 1, name: 'Name', type: 'freetext' }, { id: 2, name: 'Born', type: 'date' }, { id: 3, name: 'Map', type: 'geo' }],
    linkedFromTypes: () => [],
    rectypeCounts: () => null
  };
  const host = document.createElement('div');
  document.body.append(host);
  const tree = new HFieldTree({ dbdefs });
  tree.mount(host, { rtyId: 10, selectableTypes: ['freetext', 'date'], hideUnselectable: true, typeFilter: true, includeHeaders: false }, () => {});
  const filter = host.querySelector('.h-fbtree-type-filter');
  assert.ok(filter);
  assert.deepEqual(filter.querySelectorAll('option').map((option) => option.value), ['all', 'text', 'date']);
  const plain = new HFieldTree({ dbdefs });
  const host2 = document.createElement('div');
  plain.mount(host2, { rtyId: 10, selectableTypes: ['freetext', 'date'], hideUnselectable: true }, () => {});
  assert.equal(host2.querySelector('.h-fbtree-type-filter'), null);
});
