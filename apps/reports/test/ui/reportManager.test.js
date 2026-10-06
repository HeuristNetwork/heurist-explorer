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
      schedules: [{ id: 60, title: 'Monthly file', file: 'monthly', format: 'html', intervalMinutes: 1440, canEdit: false }] }
  ],
  unregistered: [{ id: null, title: 'old', file: 'old.tpl', canEdit: true, schedules: [] }]
};

async function mount(list = LIST, jobClient = {}) {
  const application = new ReportsApplication({
    config: { language: 'eng' },
    reportApi: {
      apiClient: { buildUrl: (p) => `http://x/api/db${p}` },
      list: async () => list,
      exportUrl: (ref) => `http://x/api/db/reports/${ref}/export`
    },
    jobClient,
    host: new ReportsHostAdapter({})
  });
  const host = document.createElement('div');
  document.body.append(host);
  const view = new ReportManager().attach(host, { application, loadEditor: async () => { throw new Error('no editor in tests'); } });
  application.setView(view);
  await application.initialize();
  return { application, host, view };
}

const visible = (button) => !button.hidden;
const label = (button) => button.querySelector('.h-reports-tool-label')?.textContent;

test('toolbar without a selection: every button after the report selector is hidden', async () => {
  const { view } = await mount();
  assert.equal(view.reportTools.hidden, true);
  assert.equal(view.runTools.hidden, true, 'Test, Generate and Schedule hidden too');
  assert.equal(view.buttons.test.disabled, true);
  assert.equal(view.buttons.generate.disabled, true);
  assert.equal(view.buttons.schedule.disabled, true);
  assert.equal(view.selectLabel.textContent, 'Select report');
});

test('a record-set report you cannot edit: Template, Export, Test, Generate, Schedule; no Edit or Delete', async () => {
  const { view, application, host } = await mount();
  await application.selectReport('6');
  assert.equal(view.selectLabel.textContent, 'Monthly');
  assert.equal(view.reportTools.hidden, false);
  assert.ok(visible(view.buttons.template) && visible(view.buttons.export));
  assert.equal(visible(view.buttons.properties), false);
  assert.equal(visible(view.buttons.delete), false);
  assert.equal(view.buttons.test.disabled, false);
  assert.equal(view.buttons.generate.disabled, false);
  assert.equal(view.buttons.schedule.disabled, false);
  assert.equal(host.querySelector('.h-reports-info-title').textContent, 'Monthly');
  assert.equal(host.querySelector('.h-reports-description').textContent, 'Every month');
});

test('a card report: Edit and Delete; Generate and Schedule disabled', async () => {
  const { view, application } = await mount();
  await application.selectReport('5');
  assert.equal(label(view.buttons.properties), 'Edit');
  assert.ok(visible(view.buttons.properties) && visible(view.buttons.delete));
  assert.equal(view.buttons.generate.disabled, true);
  assert.equal(view.buttons.schedule.disabled, true);
});

test('a template without a record: Register', async () => {
  const { view, application } = await mount();
  await application.selectReport('old.tpl');
  assert.equal(label(view.buttons.properties), 'Register');
  assert.ok(visible(view.buttons.properties));
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

test('file name characters: letters A-Z, digits, "-", "_", "(", ")" and spaces', () => {
  assert.equal('Mon rapport (v2) café/2026.tpl'.replace(FILE_NAME_CHARS, ''), 'Mon rapport (v2) caf2026tpl');
  assert.equal(ReportsApplication.outputPrefix({ file: 'a:b.tpl' }), 'a_b');
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

test('a job maps to its report by record id, else by template file', async () => {
  const { application } = await mount();
  assert.equal(application.reportOfJob({ params: { reportId: 6 } }).title, 'Monthly');
  assert.equal(application.reportOfJob({ params: { reportId: null, templateFile: 'old.tpl' } }).title, 'old');
  assert.equal(application.reportOfJob({ params: {} }), null);
});

test('a generation still running after a reload is shown again, and hidden for another report', async () => {
  const jobs = runningJobs();
  const { application, view } = await mount(LIST, jobs);
  await flush();
  assert.equal(application.selectedRef, '6', 'its report is selected');
  assert.equal(application.generateJob.id, 'j1');
  assert.equal(view.followingId, 'j1', 'its progress is followed');
  assert.equal(view.viewer.jobHost.hidden, false);

  await application.selectReport('5');
  assert.equal(view.followingId, null);
  assert.equal(view.viewer.jobHost.hidden, true, 'progress hidden for another report; the job continues');
  assert.deepEqual(jobs.cancelled, []);

  const { buildReportList } = await import('../../src/ui/ReportList.js');
  const list = buildReportList(application, { onSelect: () => {} });
  assert.equal(list.querySelectorAll('.h-reports-running').length, 1, 'the report list marks the report');

  await application.selectReport('6');
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
    const { application, view } = await mount(LIST, { ...jobs, list: async () => [] });
    jobs.start = async () => assert.fail('no second generation');
    await application.selectReport('5');
    application.jobs.list = jobs.list;
    await view.generate();
    assert.equal(application.selectedRef, '6', 'the report of the running generation is selected');
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

test('JavaScript not allowed: toolbar warning and an output frame without scripts', async () => {
  const { view, application } = await mount({ ...LIST, settings: { javaScriptAllowed: false, testRecordLimit: 50 } });
  assert.equal(view.jsWarning.hidden, false);
  assert.ok(!view.viewer.frame.getAttribute('sandbox').includes('allow-scripts'));

  application.data.settings.javaScriptAllowed = true;
  view.update();
  assert.equal(view.jsWarning.hidden, true);
  assert.ok(view.viewer.frame.getAttribute('sandbox').includes('allow-scripts'));
  assert.ok(view.viewer.frame.getAttribute('sandbox').includes('allow-same-origin'));
  await view.destroy();
});

test('no settings in the list (anonymous): no warning', async () => {
  const { view } = await mount();
  assert.equal(view.jsWarning.hidden, true);
  await view.destroy();
});
