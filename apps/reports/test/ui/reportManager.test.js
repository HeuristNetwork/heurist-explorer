import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom, flush } from '../../../../shared/test/helpers/fakeDom.js';

const document = installFakeDom();
const { ReportsApplication } = await import('../../src/core/ReportsApplication.js');
const { ReportsHostAdapter } = await import('../../src/host/ReportsHostAdapter.js');
const { ReportManager } = await import('../../src/ui/ReportManager.js');
const { buildReportList } = await import('../../src/ui/ReportList.js');
const { FILE_NAME_CHARS } = await import('../../src/ui/formDialog.js');

const LIST = {
  installed: true,
  canSetup: true,
  reports: [
    { id: 5, title: 'Person card', file: 'person card.tpl', isCardView: true, ownerGroupId: 1, canEdit: true, schedules: [], fileExists: true },
    { id: 6, title: 'Monthly', file: 'monthly.tpl', isCardView: false, ownerGroupId: 2, canEdit: false, description: 'Every month',
      outputCount: 1, schedules: [{ id: 60, title: 'Monthly file', file: 'monthly', format: 'html', intervalMinutes: 1440, canEdit: false }] }
  ],
  unregistered: [{ id: null, title: 'old', file: 'old.tpl', canEdit: true, schedules: [] }]
};

/** The List of the reports (HPresentationList) without its record list: `select` fills the right side. */
function fakeList() {
  const list = {
    selectedId: null,
    reloaded: 0,
    attach(host, options) {
      list.host = host;
      list.options = options;
      list.selectedId = options.selectedId || null;
      list.outputs = document.createElement('div');
      host.append(list.outputs);
      return list;
    },
    async render() { await list.select(list.selectedId); },
    async select(id) {
      list.selectedId = Number(id) || null;
      await list.options.renderOutputs(list.selectedId, list.outputs);
    },
    async reload() { list.reloaded += 1; await list.select(list.selectedId); },
    async destroy() {}
  };
  return list;
}

async function mount(list = LIST, jobClient = {}, bridge = { editRecord: async () => ({ saved: false }), addRecord: async () => ({ saved: false }) }) {
  const application = new ReportsApplication({
    config: { language: 'eng' },
    reportApi: {
      apiClient: { buildUrl: (p) => `http://x/api/db${p}` },
      list: async () => list,
      outputs: async () => [],
      exportUrl: (ref) => `http://x/api/db/presentation/${ref}/export`,
      renderUrl: (id, recordId) => `http://x/api/db/presentation/${id}/execute?recordId=${recordId}`
    },
    jobClient,
    host: new ReportsHostAdapter(bridge)
  });
  application.loadDbDefs = async () => null;
  const host = document.createElement('div');
  document.body.append(host);
  const reportList = fakeList();
  const view = new ReportManager().attach(host, {
    application, loadEditor: async () => { throw new Error('no editor in tests'); }, createList: () => reportList
  });
  application.setView(view);
  await application.initialize();
  await flush();
  return { application, host, view, list: reportList };
}

test('the pane is the List of the reports (plan 27q3): Card and List Report, New and Import', async () => {
  const { list } = await mount();
  assert.deepEqual(list.options.kinds, ['listreport', 'cardreport']);
  assert.equal(typeof list.options.onNew, 'function');
  assert.deepEqual(list.options.barTools.map((tool) => tool.label), ['Import']);
  assert.equal(await list.options.describeUse(6), '!This template has generated reports: delete them first (1)', 'a report with outputs is not deleted');
  assert.equal(await list.options.describeUse(5), '');
});

test('without a selection: the template files without a record (Register, Delete)', async () => {
  const { list } = await mount();
  await list.select(null);
  assert.match(list.outputs.textContent, /old\.tpl/);
});

test('a List Report: Test, Generate and more beside the List, with its generated reports', async () => {
  const { list, view, application } = await mount();
  await list.select(6);
  assert.equal(application.selectedRef, '6');
  assert.match(list.outputs.querySelector('.h-reports-details-title').textContent, /Monthly/);
  assert.ok(view.detailButtons.refresh && view.detailButtons.generate && view.detailButtons.more);
  assert.ok(view.outputsPanel, 'the generated reports are in the panel, not in a popup');
  await view.destroy();
});

test('a card report: Test without Generate; the preview of the first selected record', async () => {
  const bridge = { editRecord: async () => ({ saved: false }), getSelection: () => [77] };
  const { list, view } = await mount(LIST, {}, bridge);
  const shown = [];
  await list.select(5);
  view.viewer.showUrl = (url) => shown.push(url);
  await view.previewCard(LIST.reports[0]);
  assert.equal(view.detailButtons.generate, undefined);
  assert.equal(view.outputsPanel, null);
  assert.deepEqual(shown, ['http://x/api/db/presentation/5/execute?recordId=77']);
  await view.destroy();
});

test('without a record editor: no New, Properties or Register', async () => {
  const { list } = await mount(LIST, {}, {});
  assert.equal(list.options.onNew, null);
  assert.equal(list.options.editRecord, null);
  await list.select(null);
  assert.equal(list.outputs.querySelector('[title="Register: create the report record of this template"]'), null);
});

test('report list: accordions by group, no file names, type and text filters', async () => {
  const { application } = await mount();
  const chosen = [];
  const list = buildReportList(application, { onSelect: (report) => chosen.push(report.title) });
  const titles = () => list.querySelectorAll('.h-reports-picker-item-title').map((node) => node.textContent);
  assert.deepEqual(titles(), ['Person card', 'Monthly', 'old']);
  assert.equal(list.querySelectorAll('.h-reports-picker-section').length, 3);
  assert.ok(!list.textContent.includes('.tpl'), 'file names are not shown');
  const type = list.querySelector('.h-reports-picker-type');
  type.value = 'set';
  type.fire('change');
  assert.deepEqual(titles(), ['Monthly']);
  type.value = 'all';
  type.fire('change');
  const search = list.querySelector('.h-reports-picker-search');
  search.value = 'person';
  search.fire('input');
  assert.deepEqual(titles(), ['Person card']);
  list.querySelectorAll('.h-reports-picker-item')[0].click();
  assert.deepEqual(chosen, ['Person card']);
  search.value = '';
  search.fire('input');
  await flush();
});

test('file name characters: letters, digits, spaces and - _ ( ) . , @', () => {
  assert.equal('Mon rapport (v2) café/2026.tpl'.replace(FILE_NAME_CHARS, ''), 'Mon rapport (v2) café2026.tpl');
  assert.equal('Smith & Co #1'.replace(FILE_NAME_CHARS, ''), 'Smith  Co 1');
});

/** Jobs API with one running generation of report 6; `wait` ends only when aborted. */
function runningJobs() {
  const jobs = {
    cancelled: [],
    active: [{ id: 'j1', type: 'report-generate', status: 'running', title: 'Monthly', params: { reportId: 6, templateFile: 'monthly.tpl' } }],
    list: async () => jobs.active,
    cancel: async (id) => { jobs.cancelled.push(id); },
    wait: (job, { signal } = {}) => new Promise((resolve, reject) => {
      signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    })
  };
  return jobs;
}

test('a job maps to its report by record id', async () => {
  const { application } = await mount();
  assert.equal(application.reportOfJob({ params: { reportId: 6 } }).title, 'Monthly');
  assert.equal(application.reportOfJob({ params: {} }), null);
});

test('a generation still running after a reload is shown with its report, and hidden for another report', async () => {
  const jobs = runningJobs();
  const { application, view, list } = await mount(LIST, jobs);
  assert.equal(application.generateJob.id, 'j1');
  await list.select(6);
  assert.equal(view.followingId, 'j1', 'its progress is followed');
  assert.equal(view.viewer.jobHost.hidden, false);
  await list.select(5);
  assert.equal(view.followingId, null, 'another report: the job continues');
  assert.deepEqual(jobs.cancelled, []);
  await list.select(6);
  assert.equal(view.followingId, 'j1', 'shown again for its report');
  await view.destroy();
});

test('Generate while a generation runs shows the running one instead of starting another', async () => {
  const { HMsg } = await import('#shared/ui');
  const flash = HMsg.showMsgFlash;
  const messages = [];
  HMsg.showMsgFlash = (message) => messages.push(message);
  try {
    const jobs = runningJobs();
    const { application, view, list } = await mount(LIST, { ...jobs, list: async () => [] });
    jobs.start = async () => assert.fail('no second generation');
    await list.select(5);
    application.jobs.list = jobs.list;
    await view.generate();
    assert.equal(list.selectedId, 6, 'the report of the running generation is selected');
    assert.equal(view.followingId, 'j1');
    assert.equal(messages.length, 1);
    await view.destroy();
  } finally {
    HMsg.showMsgFlash = flash;
  }
});

test('closing the manager stops its own test run, not a generation', async () => {
  const jobs = runningJobs();
  const { view } = await mount(LIST, jobs);
  view.testJob = { id: 't1', type: 'report-preview', status: 'running' };
  await view.destroy();
  assert.deepEqual(jobs.cancelled, ['t1']);
});

test('JavaScript not allowed: a warning and an output frame without scripts', async () => {
  const { view, list } = await mount({ ...LIST, settings: { javaScriptAllowed: false, testRecordLimit: 50 } });
  await list.select(6);
  assert.equal(view.jsWarning.hidden, false);
  assert.ok(!view.viewer.frame.getAttribute('sandbox').includes('allow-scripts'));
  view.app.data.settings.javaScriptAllowed = true;
  await list.select(6);
  assert.equal(view.jsWarning.hidden, true);
  assert.ok(view.viewer.frame.getAttribute('sandbox').includes('allow-scripts'));
  await view.destroy();
});

test('no settings in the list (anonymous): no warning', async () => {
  const { view, list } = await mount();
  await list.select(6);
  assert.equal(view.jsWarning.hidden, true);
  await view.destroy();
});

test('record types not installed, database manager: explanation and Install; Install loads the definitions again', async () => {
  const missing = { ...LIST, installed: false, missingDefinitions: ['RT_PRESENTATION_SET'], reports: [] };
  let changed = 0;
  const { application, host } = await mount(missing, {}, { editRecord: async () => ({ saved: false }), definitionsChanged: () => { changed += 1; } });
  assert.match(host.querySelector('.h-setup-notice-text').textContent, /install the new record types/);
  assert.match(host.querySelector('.h-setup-notice').textContent, /Missing: RT_PRESENTATION_SET/);
  let installed = false;
  application.api.setup = async () => { installed = true; return { report: ['Imported'] }; };
  application.api.list = async () => (installed ? LIST : missing);
  application.loadDbDefs = async () => null;
  const { HMsg } = await import('#shared/ui');
  const dialog = HMsg.showMsgDlg;
  const shown = [];
  const closeDialog = HMsg.closeMsgDlg;
  HMsg.showMsgDlg = (content, options) => shown.push([content.textContent, options.preventClose === true]);
  HMsg.closeMsgDlg = () => {};
  try {
    host.querySelector('.h-setup-notice-install').click();
    await flush();
    await flush();
  } finally {
    HMsg.showMsgDlg = dialog;
    HMsg.closeMsgDlg = closeDialog;
  }
  assert.deepEqual(shown, [['Importing...', true], ['Imported', false]], 'a modal popup while importing, then the setup report');
  assert.equal(installed, true);
  assert.equal(changed, 1, 'the host reloads its definitions');
  assert.equal(host.querySelector('.h-setup-notice'), null, 'the notice is gone after the install');
});

test('record types not installed, other users: explanation, no Install', async () => {
  const { host } = await mount({ ...LIST, installed: false, canSetup: false, reports: [] });
  assert.ok(host.querySelector('.h-setup-notice-text'));
  assert.equal(host.querySelector('.h-setup-notice-install'), null);
  assert.match(host.querySelector('.h-setup-notice').textContent, /Ask the database owner/);
});
