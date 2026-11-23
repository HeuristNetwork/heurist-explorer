/**
 * Own records of a module on a website page (plan 27l §11.3, §12): `dataSource` (a query source, saved filter, query or
 * one record), `records` / `selection`; the section Records and selection of the designer; the page sync also in the
 * preview of the designer (§11.5).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from '../../../shared/test/helpers/fakeDom.js';

installFakeDom();
const { cmsInstanceDataSource, cmsInstanceProblem } = await import('#shared/site/cmsDocument.js');
const { CmsRecordDocument } = await import('#shared/site/cmsEdit.js');
const { applyInstanceSettings, instanceSourceRequest, pageSyncOf } = await import('../src/siteRuntime.js');
const { recordsIssues, recordsResult, recordsValues } = await import('../src/designer/widgetForms.js');

test('cmsInstanceDataSource: one key; a record only for Record View; a query without parameters', () => {
  assert.deepEqual(cmsInstanceDataSource({ source: 12 }), { source: 12 });
  assert.deepEqual(cmsInstanceDataSource({ filter: '34' }), { filter: 34 });
  assert.deepEqual(cmsInstanceDataSource({ query: { t: '10' } }), { query: [{ t: '10' }] });
  assert.deepEqual(cmsInstanceDataSource({ record: 5 }, 'recordview'), { record: 5 });
  assert.equal(cmsInstanceDataSource({ record: 5 }, 'data'), null);
  assert.equal(cmsInstanceDataSource({ query: [{ t: '$X$' }] }), null, 'parameters');
  assert.equal(cmsInstanceDataSource({ source: 1, filter: 2 }), null, 'two keys');
  assert.equal(cmsInstanceDataSource({ source: true }), null);
  assert.equal(cmsInstanceProblem({ kind: 'module', type: 'map', sync: 'none', dataSource: { source: 3 } }), null);
  assert.equal(cmsInstanceProblem({ kind: 'module', type: 'explorer', dataSource: { source: 3 } })[0], 'data_source');
});

test('setInstance: records and selection replace sync; the default is not written', () => {
  const doc = new CmsRecordDocument({
    config: JSON.stringify({ schema: 'heurist-cms/4', instances: { i1: { kind: 'module', type: 'data', sync: 'none' } } }) });
  doc.setInstance('i1', { records: { from: ['own', 'links'] }, selection: false, dataSource: { source: 7 } });
  assert.deepEqual(doc.instance('i1').records, { from: ['own', 'links'] });
  assert.equal(doc.instance('i1').selection, false);
  assert.deepEqual(doc.instance('i1').dataSource, { source: 7 });
  assert.equal(doc.instance('i1').sync, undefined, 'sync of round 1 removed');
  doc.setInstance('i1', { records: null, selection: true, dataSource: null });
  assert.equal(doc.instance('i1').records, undefined);
  assert.equal(doc.instance('i1').selection, undefined);
  assert.equal(doc.instance('i1').dataSource, undefined);
});

test('the section values: sources, own query (query source or query), selection; Record View own or selected record', () => {
  const instances = { f1: { kind: 'widget', type: 'filter' } };
  assert.deepEqual(recordsValues({ type: 'data', sync: 'none', dataSource: { filter: 4 } }, instances),
    { from: ['own'], source: 'filter:4', query: '', selection: false, shows: 'selection', record: null });
  assert.deepEqual(recordsValues({ type: 'map' }, instances).from, ['links', 'filter:f1'], 'the default');
  assert.deepEqual(recordsResult({ from: ['links', 'filter:f1'], selection: true }, 'data', instances),
    { records: null, selection: true, dataSource: null }, 'the default is not written');
  assert.deepEqual(recordsResult({ from: ['own', 'filter:f1'], source: 'source:9', query: '[{"t":"1"}]', selection: false }, 'data', instances),
    { records: { from: ['own', 'filter:f1'] }, selection: false, dataSource: { source: 9 } }, 'the query source wins');
  assert.deepEqual(recordsResult({ from: ['own'], source: '', query: '[{"t":"1"}]', selection: true }, 'map').dataSource, { query: [{ t: '1' }] });
  assert.equal(recordsResult({ from: ['links'], source: 'source:9' }, 'data').dataSource, null, 'no own query: none kept');
  assert.deepEqual(recordsResult({ shows: 'own', record: [15] }, 'recordview'), { records: null, selection: false, dataSource: { record: 15 } });
  assert.deepEqual(recordsResult({ shows: 'selection', record: 15 }, 'recordview'), { records: null, selection: true, dataSource: null });
  assert.equal(recordsIssues({ from: ['own'], source: '', query: 'not json' }, 'data').length, 1);
  assert.equal(recordsIssues({ from: ['own'], source: '', query: '' }, 'data')[0].field, 'query');
  assert.equal(recordsIssues({ from: ['links'], query: 'not json' }, 'data').length, 0);
  assert.equal(recordsIssues({ shows: 'own', record: null }, 'recordview')[0].field, 'record');
});

test('instanceSourceRequest: a query as it is, a query source read with the rights of the visitor', async () => {
  const query = await instanceSourceRequest({ type: 'data', sync: 'none', dataSource: { query: [{ t: '10' }] } });
  assert.deepEqual(query.dataSource.request.q, [{ t: '10' }]);
  const urls = [];
  const load = async (url) => {
    urls.push(url);
    return { ok: true, json: async () => ({ querySource: { id: 3, title: 'People', source: { query: { t: '10' } } } }) };
  };
  const source = await instanceSourceRequest({ type: 'map', sync: 'selection', dataSource: { source: 3 } },
    { apiBaseUrl: 'http://h/api', database: 'db' }, load);
  assert.deepEqual(urls, ['http://h/api/db/records/querysource/3']);
  assert.equal(source.dataSource.title, 'People');
  assert.equal(await instanceSourceRequest({ type: 'recordview', dataSource: { record: 5 } }), null, 'a record: state.recordId');
});

test('page sync in the preview of the designer: one per page runtime (the designer copies the block)', () => {
  const runtime = { design: true };
  const first = pageSyncOf({ runtime, instances: {} });
  assert.ok(first);
  assert.equal(pageSyncOf({ runtime, instances: { i1: {} } }), first);
  assert.notEqual(pageSyncOf({ runtime: { design: true } }), first);
});

test('other records and selection or own records: the module is mounted again', () => {
  const api = { setConfiguration: () => {} };
  const before = { kind: 'module', type: 'data', settings: {} };
  assert.equal(applyInstanceSettings(api, before, { ...before, settings: { a: 1 } }), true);
  assert.equal(applyInstanceSettings(api, before, { ...before, records: { from: ['own'] } }), false);
  assert.equal(applyInstanceSettings(api, before, { ...before, selection: false }), false);
  assert.equal(applyInstanceSettings(api, before, { ...before, dataSource: { source: 1 } }), false);
});

test('a query source by id becomes its query when the form opens; the ▾ list of the query field (plan 27n1 §4)', async () => {
  const { storedQuery, cardsQuerySpecial, presentationSettings } = await import('../src/designer/widgetForms.js');
  const services = {
    querySourceDefinition: async (id) => ({ source: { query: [{ t: String(id) }] } }),
    savedFilterDefinition: async () => ({ source: { query: 't:5' } })
  };
  assert.equal(await storedQuery('source:9', services), '[{"t":"9"}]');
  assert.equal(await storedQuery('filter:4', services), 't:5', 'a legacy text stays text');
  assert.equal(await storedQuery('source:0', services), undefined);
  assert.equal(await storedQuery('other:3', services), undefined);
  // Edit and ▾ (only with the one list of query choices, review 7)
  const special = cardsQuerySpecial({ editQuery: async () => null, queryChoices: async () => [], ...services });
  assert.deepEqual(special.actions.map((action) => action.icon), ['fa-sliders', 'fa-caret-down']);
  assert.equal(cardsQuerySpecial({}).actions.length, 0);
  // tabs of Record cards: the look only when not the default (plan 27n1 §2d)
  assert.deepEqual(presentationSettings({ presentation: 'tabs', tabOrientation: 'vertical', tabStyle: 'tabs' }).tabs, { orientation: 'vertical' });
  assert.equal(presentationSettings({ presentation: 'tabs', tabOrientation: 'horizontal', tabStyle: 'tabs' }).tabs, undefined);
  assert.equal(presentationSettings({ presentation: 'list', tabStyle: 'pills' }).tabs, undefined);
});
