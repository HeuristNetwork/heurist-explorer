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
    get: async (p, options) => { calls.push(['GET', p, options?.query ?? null]); return { status: 0, data: { p } }; },
    post: async (p, options) => { calls.push(['POST', p, options?.body]); return { status: 0, data: { p }, ids: [1, 2, 3] }; },
    request: async (p, options) => { calls.push([options.method, p, options.body ?? options.query ?? null]); return { status: 0, data: { p } }; }
  };
}

test('ReportApi paths: record ids and file names are encoded', async () => {
  const client = fakeClient();
  const api = new ReportApi({ apiClient: client });
  await api.list('card');
  await api.readTemplate('my report.tpl');
  await api.saveTemplate(5, 'body');
  await api.register('a&b.tpl', { title: 'T' });
  await api.remove(5, { keepFile: true });
  await api.createSchedule(5, { querySource: 3 });
  await api.deleteSchedule(5, 60);
  assert.deepEqual(client.calls, [
    ['GET', '/reports', { scope: 'card' }],
    ['GET', '/reports/my%20report.tpl/template', null],
    ['PUT', '/reports/5/template', { body: 'body' }],
    ['POST', '/reports/a%26b.tpl/register', { title: 'T', isCardView: false }],
    ['DELETE', '/reports/5', { keepFile: 1 }],
    ['POST', '/reports/5/schedules', { querySource: 3 }],
    ['DELETE', '/reports/5/schedules/60', null]
  ]);
  assert.equal(api.exportUrl('x.tpl'), 'http://x/api/db/reports/x.tpl/export');
  assert.equal(api.renderUrl(5, 7), 'http://x/api/db/reports/5/render?rec=7');
  assert.throws(() => api.exportUrl(''));
});

test('ReportApi.queryIds asks the records API for ids', async () => {
  const client = fakeClient();
  const ids = await new ReportApi({ apiClient: client }).queryIds([{ t: '10' }], 2);
  assert.deepEqual(client.calls[0], ['POST', '/records', { query: [{ t: '10' }], detail: 'ids', limit: 2, total: false }]);
  assert.deepEqual(ids, [1, 2]);
});
