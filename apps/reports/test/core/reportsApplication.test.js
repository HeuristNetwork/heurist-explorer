import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from '../../../../shared/test/helpers/fakeDom.js';

installFakeDom();
const { ReportsApplication, starterTemplate, TEST_RECORD_LIMIT } = await import('../../src/core/ReportsApplication.js');
const { ReportsHostAdapter } = await import('../../src/host/ReportsHostAdapter.js');
const { createHeuristReportsConfig } = await import('../../src/reportsConfig.js');

const LIST = {
  installed: true,
  reports: [
    { id: 5, title: 'Person card', file: 'person card.tpl', isCardView: true, ownerGroupId: 1, canEdit: true, schedules: [] },
    { id: 6, title: 'Monthly', file: 'monthly.tpl', isCardView: false, ownerGroupId: 2, canEdit: true,
      schedules: [{ id: 60, title: 'Monthly', file: 'monthly-out', format: 'html' }] }
  ],
  unregistered: [{ id: null, title: 'old', file: 'old.tpl', canEdit: true, schedules: [] }]
};

function fakeApi(overrides = {}) {
  const calls = [];
  return {
    calls,
    apiClient: { buildUrl: (p) => `http://x/api/db${p}` },
    list: async () => LIST,
    create: async (values) => { calls.push(['create', values]); return { id: 7, file: 'new.tpl' }; },
    queryIds: async (query, limit) => { calls.push(['queryIds', query, limit]); return [11, 12]; },
    ...overrides
  };
}

function app(api = fakeApi(), bridge = {}) {
  return new ReportsApplication({
    config: createHeuristReportsConfig({ runtime: { database: 'db' } }),
    reportApi: api,
    jobClient: { start: async (type, params) => ({ id: 'j', type, params }) },
    host: new ReportsHostAdapter(bridge)
  });
}

test('refresh loads the list; reports are found by record id or file name', async () => {
  const application = app();
  let changes = 0;
  application.addEventListener('listchange', () => changes++);
  await application.refresh();
  assert.equal(changes, 1);
  assert.equal(application.allReports().length, 3);
  assert.equal(application.findReport('6').title, 'Monthly');
  assert.equal(application.findReport('old.tpl').title, 'old');
  assert.equal(ReportsApplication.reference(LIST.unregistered[0]), 'old.tpl');
  assert.equal(ReportsApplication.reference(LIST.reports[0]), '5');
});

test('generated files of a report are asked for with its file name as prefix', async () => {
  const prefixes = [];
  const application = app(fakeApi({ generated: async (prefix) => { prefixes.push(prefix); return [{ file: `${prefix}.html` }]; } }));
  await application.refresh();
  assert.deepEqual(await application.generatedFiles(application.findReport('6')), [{ file: 'monthly.html' }]);
  assert.deepEqual(prefixes, ['monthly']);
});

test('properties: an unregistered file is renamed, then registered; a record is updated', async () => {
  const calls = [];
  const api = fakeApi({
    update: async (ref, values) => { calls.push(['update', ref, values]); return { id: ref === 'old.tpl' ? null : 6, file: `${values.file || 'monthly'}.tpl` }; },
    register: async (file, values) => { calls.push(['register', file, values]); return { id: 9, file }; }
  });
  const application = app(api);
  await application.refresh();
  await application.saveProperties(application.findReport('old.tpl'), { title: 'Old', description: '', isCardView: false, file: 'renamed' });
  assert.deepEqual(calls.slice(0, 2), [
    ['update', 'old.tpl', { file: 'renamed' }],
    ['register', 'renamed.tpl', { title: 'Old', isCardView: false, description: '' }]
  ]);
  await application.saveProperties(application.findReport('6'), { title: 'M', description: 'x', isCardView: false });
  assert.deepEqual(calls[2], ['update', 6, { title: 'M', description: 'x', isCardView: false }]);
});

test('current result with its record count; parameterized Query Sources are left out', async () => {
  const application = app(fakeApi({ queryCount: async () => 42 }), {
    getCurrentQuery: () => ({ query: 't:10', title: 'People' }),
    getQuerySources: () => [{ id: 1, title: 'A' }, { id: 2, title: 'B', parametrized: true }]
  });
  assert.deepEqual(await application.currentResult(), { query: 't:10', title: 'People', total: 42 });
  assert.deepEqual((await application.querySourcesForReports()).map((s) => s.id), [1]);
});

test('test records: the host selection first, else the first records of the current result', async () => {
  const api = fakeApi();
  const withSelection = app(api, { getSelection: () => Array.from({ length: 80 }, (_, i) => i + 1) });
  const fromSelection = await withSelection.testRecordIds();
  assert.equal(fromSelection.source, 'selection');
  assert.equal(fromSelection.ids.length, TEST_RECORD_LIMIT);

  const fromResult = await app(api, { getSelection: () => [], getCurrentQuery: () => ({ query: [{ t: '10' }], title: 'People' }) }).testRecordIds();
  assert.deepEqual(fromResult, { ids: [11, 12], source: 'result', title: 'People' });
  assert.deepEqual(api.calls.at(-1), ['queryIds', [{ t: '10' }], TEST_RECORD_LIMIT]);

  assert.deepEqual((await app(api).testRecordIds()).ids, []);
});

test('a single record (card) report is tested on one record', async () => {
  const api = fakeApi();
  const card = { isCardView: true };
  const fromSelection = await app(api, { getSelection: () => [7, 8, 9] }).testRecordIds(card);
  assert.deepEqual(fromSelection.ids, [7]);
  await app(api, { getSelection: () => [], getCurrentQuery: () => ({ query: [{ t: '10' }] }) }).testRecordIds(card);
  assert.deepEqual(api.calls.at(-1), ['queryIds', [{ t: '10' }], 1]);
});

test('a new report starts with a starter template unless a body is given', async () => {
  const api = fakeApi();
  const application = app(api);
  await application.createReport({ title: 'A', isCardView: true });
  assert.equal(api.calls[0][1].body, starterTemplate(true));
  await application.createReport({ title: 'B', isCardView: false, body: 'X' });
  assert.equal(api.calls[1][1].body, 'X');
  assert.equal(application.selectedRef, '7');
  assert.match(starterTemplate(false), /\{foreach \$results as \$r1\}/);
});

test('host adapter fallbacks without a bridge', async () => {
  const host = new ReportsHostAdapter(null);
  assert.equal(host.canEditRecords(), false);
  assert.deepEqual(await host.getSelection(), []);
  assert.equal(await host.getCurrentQuery(), null);
  assert.deepEqual(await host.getQuerySources(), []);
  await assert.rejects(() => host.editRecord(5));
  const bridged = new ReportsHostAdapter({
    editRecord: async () => ({ saved: true }), canEditRecords: () => true,
    getQuerySources: () => [{ id: 3, title: 'Cities' }, { id: 0, title: 'bad' }]
  });
  assert.equal(bridged.canEditRecords(), true);
  assert.deepEqual(await bridged.getQuerySources(), [{ id: 3, title: 'Cities', parametrized: false }]);
});

test('configuration normalization', () => {
  const config = createHeuristReportsConfig({ runtime: { database: 'db', language: 'FRE', baseUrl: 'http://h/' }, state: { report: 5 } });
  assert.equal(config.language, 'fre');
  assert.equal(config.initialReport, 5);
  assert.equal(config.containerId, 'heurist-reports');
});

test('the test record limit and the JavaScript setting come from the server list', () => {
  assert.equal(ReportsApplication.testLimit({ isCardView: false }, { testRecordLimit: 20 }), 20);
  assert.equal(ReportsApplication.testLimit({ isCardView: true }, { testRecordLimit: 20 }), 1, 'card reports: one record');
  assert.equal(ReportsApplication.testLimit(null, null), TEST_RECORD_LIMIT);
  const application = app(fakeApi());
  application.data = { settings: { javaScriptAllowed: true, testRecordLimit: 20 } };
  assert.equal(application.scriptsAllowed(), true);
  assert.ok(application.testTip({}).includes('20'));
  application.data = {};
  assert.equal(application.scriptsAllowed(), false);
});
