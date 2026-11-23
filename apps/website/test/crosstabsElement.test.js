/**
 * @file crosstabsElement.test.js
 * @brief Website element Crosstabs (plan 27q2 §10): its sources (`settings.from`), the PageSync member (records in,
 *        no selection, nothing sent on by itself) and a clicked count sent on as `module:<id>`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { cmsInstanceRecords } from '#shared/site/cmsRecords.js';
import { normalizeDataSource } from '#shared/data/DataSource.js';
import { PageSync } from '../src/PageSync.js';

const INSTANCES = {
  f1: { kind: 'widget', type: 'filter', settings: {} },
  x1: { kind: 'widget', type: 'crosstabs', settings: { preset: 5 } }
};

test('sources: own query, Saved filter links and the Filter widgets by default; settings.from when stored', () => {
  assert.deepEqual(cmsInstanceRecords(INSTANCES.x1, INSTANCES), { from: ['own', 'links', 'filter:f1'], selection: false, own: null });
  const stored = { ...INSTANCES.x1, settings: { preset: 5, from: ['filter:f1', 'bad token', 'filter:f1'] } };
  assert.deepEqual(cmsInstanceRecords(stored, INSTANCES).from, ['filter:f1']);
});

test('PageSync: the crosstab counts the searches of its sources and sends nothing on by itself', async () => {
  const sync = new PageSync();
  const queries = [];
  const widget = { setQuery: async (query) => { queries.push(query); } };
  const member = sync.register('x1', 'crosstabs', widget, { from: ['own', 'filter:f1'], selection: true });
  assert.equal(member.selection, false);
  assert.deepEqual(member.from, ['filter:f1']);
  const taken = [];
  sync.register('d1', 'data', { setDataSource: async (source) => { taken.push(source); return true; } }, { from: ['module:x1'] });
  const dataSource = normalizeDataSource({ reference: { type: 'query' }, title: 'Facets', request: { q: [{ t: '10' }] } });
  await sync.setRequest({ dataSource, values: {}, missing: [] }, { origin: 'filter:f1' });
  assert.deepEqual(queries, [[{ t: '10' }]]);
  assert.equal(sync.latest(['module:x1']), null);
  // a clicked count: the widget sends the records of the cell as module:x1
  const cell = normalizeDataSource({ reference: { type: 'query' }, title: 'City', request: { q: [{ t: '10' }, { 'f:20': '=414' }] } });
  await sync.setRequest({ dataSource: cell, values: {}, missing: [] }, { origin: 'module:x1' });
  assert.equal(sync.latest(['module:x1']).dataSource.title, 'City');
  sync.destroy();
});

test('own query parameters from the page URL (v.<NAME>=, within the limits)', async () => {
  const { installFakeDom } = await import('../../../shared/test/helpers/fakeDom.js');
  installFakeDom();
  const { urlValues } = await import('../src/siteCrosstabs.js');
  assert.deepEqual(urlValues('?v.LIBRARY=77&x=1&v.TYPE=a&v.TYPE=b'), { LIBRARY: '77', TYPE: ['a', 'b'] });
  assert.deepEqual(urlValues(''), {});
});

test('crosstabs member: a page request goes to applyPageRequest (the Filter Form of a Saved filter link, review 6)', async () => {
  const sync = new PageSync();
  const requests = [];
  const api = { setQuery: async () => { throw new Error('not used'); }, applyPageRequest: async (request) => { requests.push(request); } };
  const member = sync.register('x1', 'crosstabs', api, { from: ['own', 'links'] });
  const request = { dataSource: { request: { q: [{ t: '10' }] } }, raw: { request: { q: [{ title: '$A$' }] } }, values: { A: 'x' }, missing: [] };
  await member.setDataSource(request.dataSource, request);
  assert.equal(requests[0], request);
});
