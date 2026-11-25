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
    setListVisible(visible) { list.visible = visible; },
    async destroy() {}
  };
  return list;
}

async function mount(list = LIST, jobClient = {}, bridge = { editRecord: async () => ({ saved: false }), addRecord: async () => ({ saved: false }) }, headerActions = null) {
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
    application, headerActions, loadEditor: async () => { throw new Error('no editor in tests'); }, createList: () => reportList
  });
  application.setView(view);
  await application.initialize();
  await flush();
  return { application, host, view, list: reportList };
}

test('the pane is the List of the reports (plan 27q3): Card and List Report, New and Import on the toolbar', async () => {
  const { list, view } = await mount();
  assert.deepEqual(list.options.kinds, ['listreport', 'cardreport']);
  assert.equal(typeof list.options.onNew, 'function');
  assert.equal(list.options.showBar, false, 'no title bar (27q3 review 3)');
  assert.ok(view.buttons.new);
  // standalone (no header of a pane): the mode switch at the end of the toolbar
  assert.deepEqual(view.buttons.tools.map((button) => button.getAttribute('aria-label')),
    ['Import', 'Export', 'Template files without a record', 'List of the reports']);
  assert.equal(view.mode, 'view', 'View first (review 4)');
  assert.equal(list.options.kindBadge({ rec_ID: 5 }), 'card');
  assert.equal(list.options.kindBadge({ rec_ID: 6 }), 'list');
  assert.equal(await list.options.describeUse(6), '!This template has generated reports: delete them first (1)', 'a report with outputs is not deleted');
  assert.equal(await list.options.describeUse(5), '');
});

test('without a selection: "Select a report"; the files without a record when there is no report yet', async () => {
  const { list } = await mount();
  await list.select(null);
  assert.equal(list.outputs.querySelector('.h-reports-message').textContent, 'Select a report');
  const empty = await mount({ ...LIST, reports: [] });
  await empty.list.select(null);
  assert.match(empty.list.outputs.textContent, /old\.tpl/);
});

test('a List Report: Show for, Test and Generate on the toolbar, its generated reports on the right', async () => {
  const { list, view, application } = await mount();
  await list.select(6);
  assert.equal(application.selectedRef, '6');
  assert.equal(list.outputs.querySelector('.h-reports-details-title'), null, 'no title, kind or description');
  assert.ok(view.buttons.refresh && view.buttons.generate);
  assert.ok(view.buttons.scope, 'Show for of a list report');
  // review 4: Generate is the primary button of the pane, Test of the editor
  assert.ok(view.buttons.generate.classList.contains('h-btn-primary'));
  assert.ok(!view.buttons.refresh.classList.contains('h-btn-primary'));
  assert.ok(view.outputsPanel, 'the generated reports are in the panel, not in a popup');
  await view.destroy();
});

test('List and View (27q3 review 3, 4): the View hides the list and shows the selector and Edit', async () => {
  const header = document.createElement('span');
  const { list, view } = await mount(LIST, {}, undefined, header);
  await list.select(6);
  // View first (review 4): the generated reports in a badge of the selector
  assert.equal(view.mode, 'view');
  assert.equal(view.buttons.selector.querySelector('.h-presentation-count').textContent, '1');
  view.setMode('list');
  assert.equal(view.buttons.selector, undefined, 'List: no selector (review 4)');
  assert.equal(view.buttons.edit, undefined);
  assert.equal(header.querySelectorAll('button').length, 1, 'the mode switch on the header of the pane');
  assert.equal(header.querySelector('button').getAttribute('aria-label'), 'Back to the report');
  header.querySelector('button').click();
  assert.equal(view.mode, 'view');
  assert.equal(list.visible, false);
  assert.match(view.buttons.selector.textContent, /Monthly/);
  assert.ok(view.buttons.edit);
  assert.equal(view.buttons.selector.querySelector('.h-presentation-badge').textContent, 'list');
  assert.equal(header.querySelector('button').getAttribute('aria-label'), 'List of the reports');
  await view.destroy();
});

test('Unregistered: the template files on the right; without such files no button', async () => {
  const { list, view } = await mount();
  await list.select(6);
  await view.toggleUnregistered();
  assert.match(list.outputs.textContent, /old\.tpl/);
  await view.toggleUnregistered();
  assert.ok(view.outputsPanel);
  await view.destroy();
  const none = await mount({ ...LIST, unregistered: [] });
  assert.deepEqual(none.view.buttons.tools.map((button) => button.getAttribute('aria-label')), ['Import', 'Export', 'List of the reports']);
  await none.list.select(null);
  assert.match(none.list.outputs.textContent, /Select a report/);
  await none.view.destroy();
});

test('a card report: no Show for, Test or Generate (review 4); the preview of the first selected record', async () => {
  const bridge = { editRecord: async () => ({ saved: false }), getSelection: () => [77] };
  const { list, view } = await mount(LIST, {}, bridge);
  const shown = [];
  await list.select(5);
  view.viewer.showUrl = (url) => shown.push(url);
  await view.previewCard(LIST.reports[0]);
  assert.equal(view.buttons.generate, undefined, 'no Generate');
  assert.equal(view.buttons.refresh, undefined, 'no Test');
  assert.equal(view.buttons.scope, undefined, 'no Show for');
  assert.match(list.outputs.querySelector('.h-reports-message').textContent, /Card report shows/);
  assert.equal(view.outputsPanel, null);
  assert.deepEqual(shown, ['http://x/api/db/presentation/5/execute?recordId=77']);
  await view.destroy();
});

test('without a record editor: no New, Properties or Register', async () => {
  const { list, view } = await mount(LIST, {}, {});
  assert.equal(list.options.onNew, null);
  assert.equal(view.buttons.new, undefined);
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

test('Generate: the form dialog of the Publish popups (HEditForm) with Name and Language (27q3 review 4)', async () => {
  const { HMsg } = await import('#shared/ui');
  const show = HMsg.showMsgDlg;
  const close = HMsg.closeMsgDlg;
  let dialog = null;
  HMsg.showMsgDlg = (body, options) => { dialog = { body, options }; return null; };
  HMsg.closeMsgDlg = () => {};
  try {
    const bridge = { editRecord: async () => ({ saved: false }), getCurrentQuery: () => ({ query: 't:10' }) };
    const { application, view, list } = await mount(LIST, { list: async () => [] }, bridge);
    await list.select(6);
    const created = [];
    application.outputLanguages = async () => [{ value: 7, label: 'FRE French' }];
    application.createOutput = async (report, values) => { created.push([report.id, values]); return { id: 60 }; };
    view.runOutput = async () => {};
    const running = view.generate();
    await flush();
    assert.equal(dialog.options.title, 'Generate report');
    assert.ok(dialog.body.classList.contains('h-edit-form'), 'an HEditForm');
    assert.deepEqual(dialog.options.buttons.map((button) => [button.label, button.class]), [['Generate', 'h-btn h-btn-primary'], ['Cancel', 'h-btn']]);
    dialog.options.buttons[0].onClick();
    await running;
    assert.deepEqual(created, [[6, { name: 'Monthly', language: 0, query: 't:10' }]]);
    await view.destroy();
  } finally {
    HMsg.showMsgDlg = show;
    HMsg.closeMsgDlg = close;
  }
});

test('closing the manager stops its own test run, not a generation', async () => {
  const jobs = runningJobs();
  const { view } = await mount(LIST, jobs);
  view.testJob = { id: 't1', type: 'report-preview', status: 'running' };
  await view.destroy();
  assert.deepEqual(jobs.cancelled, ['t1']);
});

test('JavaScript not allowed: an output frame without scripts; the warning is in the editor only', async () => {
  const { view, list } = await mount({ ...LIST, settings: { javaScriptAllowed: false, testRecordLimit: 50 } });
  await list.select(6);
  assert.ok(!/Javascript/.test(list.outputs.textContent), 'no warning in the pane (27q3 review 3)');
  assert.ok(!view.viewer.frame.getAttribute('sandbox').includes('allow-scripts'));
  view.app.data.settings.javaScriptAllowed = true;
  await list.select(6);
  assert.ok(view.viewer.frame.getAttribute('sandbox').includes('allow-scripts'));
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
