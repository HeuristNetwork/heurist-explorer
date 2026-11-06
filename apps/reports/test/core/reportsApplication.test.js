import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from '../../../../shared/test/helpers/fakeDom.js';

installFakeDom();
const { ReportsApplication, sameQuery, starterTemplate, TEST_RECORD_LIMIT } = await import('../../src/core/ReportsApplication.js');
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
    createRecord: async (rectype, details) => { calls.push(['createRecord', rectype, details]); return 7; },
    readTemplate: async () => ({ body: '' }),
    saveTemplate: async (reference, body) => { calls.push(['saveTemplate', reference, body]); },
    remove: async (reference) => { calls.push(['remove', reference]); },
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

test('outputs of a report with the same query: JSON text and values compare equal', async () => {
  const outputs = [
    { id: 1, title: 'B', reportId: 6, query: '[{"t":"10"}]' },
    { id: 2, title: 'A', reportId: 6, query: ' [ { "t" : "10" } ] ' },
    { id: 3, title: 'C', reportId: 6, query: '[{"t":"11"}]' },
    { id: 4, title: 'D', reportId: 5, query: '[{"t":"10"}]' }
  ];
  const application = app(fakeApi({ outputs: async () => outputs }));
  await application.refresh();
  const found = await application.outputsWithQuery(application.findReport('6'), [{ t: '10' }]);
  assert.deepEqual(found.map((output) => output.id), [2, 1], 'by title');
  assert.equal(sameQuery('?t:10', 't:10'), true);
  assert.equal(sameQuery('t:10', 't:11'), false);
  assert.equal(sameQuery(null, ''), true);
});

const DEFINITIONS = { RT_CUSTOM_REPORT: 24, DT_NAME: 1, DT_QUERY_STRING: 12, DT_FILE_NAME: 62, DT_IS_CARD_VIEW: 75, DT_REPORT: 76, TRM_YES: 9 };

/** An application with the definitions and a host that saves new records. */
function editing(api, answer = { saved: true, recordId: 6 }) {
  const added = [];
  const application = app(api, {
    canEditRecords: () => true,
    editRecord: async (id) => { added.push(['edit', id]); return answer; },
    addRecord: async (type, options) => { added.push([type, options]); return answer; }
  });
  application.loadDbDefs = async () => ({ dbconst: (code) => DEFINITIONS[code] });
  return { application, added };
}

test('a template without a record: the record editor with its name; the record takes the file', async () => {
  const api = fakeApi();
  const { application, added } = editing(api);
  await application.refresh();
  await application.registerReport(application.findReport('old.tpl'));
  assert.deepEqual(added, [['RT_CUSTOM_REPORT', { values: { 1: 'old', 62: 'old.tpl' } }]]);
  assert.deepEqual(api.calls, []);
  assert.equal(application.selectedRef, '6');
});

test('a template without a record: a closed editor changes nothing', async () => {
  const closed = editing(fakeApi(), { saved: false });
  await closed.application.refresh();
  assert.equal(await closed.application.registerReport(closed.application.findReport('old.tpl')), null);
});

test('an output is added in the record editor: from the dialog with the owner of the report, from Generate the user\'s own', async () => {
  const { application, added } = editing(fakeApi({ outputs: async () => [{ id: 6, title: 'Monthly' }] }));
  await application.refresh();
  application.userGroups = { currentUserId: 2 };
  assert.equal((await application.newOutput({ id: 6, title: 'Monthly', ownerGroupId: 3 })).id, 6);
  assert.deepEqual(added.at(-1), ['RT_REPORT_SCHEDULE', {
    values: { 1: 'Monthly', 76: 6 },
    access: { owner: 3, visibility: 'viewable', viewGroups: [] }
  }]);
  await application.newOutput({ id: 6, title: 'Monthly', ownerGroupId: 3 }, [{ t: '10' }]);
  assert.deepEqual(added.at(-1), ['RT_REPORT_SCHEDULE', {
    values: { 1: 'Monthly', 76: 6, 12: '[{"t":"10"}]' },
    access: { owner: 2, visibility: 'hidden', viewGroups: [] }
  }]);
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

test('a new report starts with a starter template; a template that has a text keeps it', async () => {
  const api = fakeApi();
  const { application, added } = editing(api);
  await application.refresh();
  await application.newReport();
  assert.deepEqual(added, [['RT_CUSTOM_REPORT', {}]]);
  assert.deepEqual(api.calls, [['saveTemplate', 6, starterTemplate(false)]]);
  assert.equal(application.selectedRef, '6');
  const kept = fakeApi({ readTemplate: async () => ({ body: 'text' }) });
  const other = editing(kept);
  await other.application.newReport();
  assert.deepEqual(kept.calls, []);
  assert.match(starterTemplate(false), /\{foreach \$results as \$r1\}/);
});

test('Save As: a copy of the report with its title, then the text of the editor', async () => {
  const api = fakeApi({ duplicate: async (id, title) => { api.calls.push(['duplicate', id, title]); return 7; } });
  const { application } = editing(api);
  await application.saveAsReport({ id: 5 }, { title: 'Copy', body: 'X' });
  assert.deepEqual(api.calls.slice(0, 2), [['duplicate', 5, 'Copy'], ['saveTemplate', 7, 'X']]);
  assert.equal(application.selectedRef, '7');
});

test('host adapter fallbacks without a bridge', async () => {
  const host = new ReportsHostAdapter(null);
  assert.equal(host.canEditRecords(), false);
  assert.equal(host.describeQuery('t:10'), 't:10');
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
