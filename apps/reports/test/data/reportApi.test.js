import test from 'node:test';
import assert from 'node:assert/strict';
import { ReportApi } from '../../src/data/ReportApi.js';

function fakeClient() {
  const calls = [];
  return {
    calls,
    headers: {},
    accessToken: null,
    buildUrl: (p, query) => `http://x/api/db${p}${query ? `?${new URLSearchParams(query)}` : ''}`,
    get: async (p, options) => {
      calls.push(['GET', p, options?.query ?? null]);
      if (p === '/report/setup') return { installed: true, missing: [], unregistered: [{ file: 'old.tpl', title: 'old' }] };
      return { records: [{ rec_ID: '5', rec_Title: 'A' }], meta: { items: { 5: { reportId: 3, canEdit: true } } } };
    },
    post: async (p, options) => { calls.push(['POST', p, options?.body]); return { records: [{ rec_ID: '9' }], ids: [1, 2, 3] }; },
    request: async (p, options) => { calls.push([options.method, p, options.body ?? options.query ?? null]); return {}; }
  };
}

test('ReportApi paths: reports and outputs by record id', async () => {
  const client = fakeClient();
  const api = new ReportApi({ apiClient: client });
  await api.readTemplate(5);
  await api.saveTemplate(5, 'body');
  await api.remove(5);
  await api.removeFile('a&b.tpl');
  await api.createRecord(24, { 1: ['T'] });
  assert.equal(await api.duplicate(5, 'Copy'), 9);
  await api.deleteOutput(60);
  await api.deleteOutputFile(60);
  await api.setup();
  assert.deepEqual(client.calls, [
    ['GET', '/report/5/asset', null],
    ['PUT', '/report/5/asset', { body: 'body' }],
    ['DELETE', '/report/5', null],
    ['DELETE', '/report/setup', { file: 'a&b.tpl' }],
    ['POST', '/report/0', { rec_RecTypeID: 24, details: { 1: ['T'] } }],
    ['POST', '/report/5/duplicate', { title: 'Copy' }],
    ['DELETE', '/output/60', null],
    ['DELETE', '/output/60/asset', null],
    ['POST', '/report/setup', {}]
  ]);
  assert.equal(api.exportUrl(5), 'http://x/api/db/report/5/export');
  assert.equal(api.renderUrl(5, 7), 'http://x/api/db/report/5/execute?recordId=7');
  assert.equal(api.outputUrl(60), 'http://x/api/db/output/60/asset');
  assert.equal(api.outputUrl(60, { download: true }), 'http://x/api/db/output/60/asset?download=1');
  assert.throws(() => api.exportUrl('x.tpl'), 'a name is not an id');
  assert.throws(() => api.outputUrl(''));
});

test('ReportApi.list: the state of /report/setup and the rows of a search with their meta.items', async () => {
  const client = fakeClient();
  const list = await new ReportApi({ apiClient: client }).list();
  assert.deepEqual(client.calls.map((call) => call[1]), ['/report/setup', '/report']);
  assert.deepEqual(list.reports, [{ id: 5, title: 'A', reportId: 3, canEdit: true }]);
  assert.equal(list.unregistered[0].id, null);
  assert.equal(list.unregistered[0].file, 'old.tpl');
  const outputs = await new ReportApi({ apiClient: fakeClient() }).outputs();
  assert.equal(outputs[0].reportId, 3);
});

test('ReportApi.queryIds asks the records API for ids', async () => {
  const client = fakeClient();
  const ids = await new ReportApi({ apiClient: client }).queryIds([{ t: '10' }], 2);
  assert.deepEqual(client.calls[0], ['POST', '/records', { query: [{ t: '10' }], detail: 'ids', limit: 2, total: false }]);
  assert.deepEqual(ids, [1, 2]);
});
