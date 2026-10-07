import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom, flush } from '../../../shared/test/helpers/fakeDom.js';

const document = installFakeDom();
const { ExportTool } = await import('../src/tools/export/ExportTool.js');
const { HMsg } = await import('#shared/ui');

const dbdefs = {
  field: () => null,
  fields: () => [],
  fieldGlobal: () => null,
  rectypeName: (id) => ({ 10: 'Person', 12: 'Place' }[id] || `#${id}`),
  rectypes: () => []
};

const COUNTS = {
  't:10,12': { total: 98, rectypes: [{ rec_RecTypeID: 10, count: 3 }, { rec_RecTypeID: 12, count: 95 }] },
  't:12': { total: 95, rectypes: [{ rec_RecTypeID: 12, count: 95 }] }
};

/** A DataSource of a direct search: no meta.count. */
function source(q, extra = {}, presentation = {}) {
  return { reference: { type: 'query', key: q }, title: '', request: { q, ...extra }, presentation, meta: {} };
}

async function mountTool(initial = source('t:10,12'), { jobs = [], finishes = true } = {}) {
  const started = [];
  const removed = [];
  const apiClient = { post: async (path, { body }) => ({ query: body.q, ...(COUNTS[body.q] || { total: 0, rectypes: [] }) }) };
  const jobClient = {
    list: async ({ type } = {}) => jobs.filter((job) => !type || job.type === type),
    remove: async (id) => { removed.push(id); return { id, deleted: true }; },
    start: async (type, params) => { started.push({ type, params }); return { id: 'a'.repeat(32), type, status: 'queued', progress: {} }; },
    wait: (job) => (finishes ? Promise.resolve({ ...job, status: 'done', result: {} }) : new Promise(() => {})),
    cancel: async () => ({}),
    resultUrl: (id) => `/jobs/${id}/result`
  };
  const tool = new ExportTool({
    apiClient, jobClient, database: 'test',
    getDbDefs: async () => dbdefs,
    getDataSource: () => initial,
    getSelection: () => []
  });
  const container = document.createElement('div');
  tool.attach(container);
  await tool.render();
  await flush();
  return { tool, container, started, removed };
}

const find = (root, className) => root.querySelector(`.${className}`);
const options = (select) => select.querySelectorAll('option');

function change(element, value) {
  element.value = value;
  element.dispatchEvent(new Event('change'));
}

test('direct search: the total of the query, the record types of the result', async () => {
  const { tool, container } = await mountTool();
  assert.match(find(container, 'h-export-intro').textContent, /98 records/);
  const scope = find(container, 'h-export-scope');
  assert.deepEqual(options(scope).map((option) => option.value), ['result', 'selection', 'rt:12', 'rt:10']);
  assert.match(options(scope)[0].textContent, /\(98\)/);
  assert.equal(options(scope)[1].disabled, true, 'no selection yet');

  tool.setSelection([1, 2]);
  const selection = options(find(container, 'h-export-scope'))[1];
  assert.equal(selection.disabled, false, 'selection follows Explorer');
  assert.match(selection.textContent, /\(2\)/);

  await tool.setDataSource(source('t:12'));
  assert.deepEqual(options(find(container, 'h-export-scope')).map((option) => option.value), ['result', 'selection', 'rt:12']);
  await tool.destroy();
});

test('XML by default: expansion and names; no columns, value formats or CSV options', async () => {
  const { tool, container } = await mountTool();
  assert.equal(find(container, 'h-export-format').value, 'xml');
  assert.equal(tool._rulesSection.hidden, false);
  assert.equal(tool._columnsSectionEl.hidden, true);
  assert.equal(tool._valuesSectionEl.hidden, true);
  assert.equal(tool._namesBox.hidden, false);
  assert.equal(tool._csvBox.hidden, true);
  await tool.destroy();
});

test('CSV: columns and value formats, no expansion; limits reset on format change', async () => {
  const { tool, container } = await mountTool();
  const format = find(container, 'h-export-format');
  change(format, 'csv');
  assert.equal(tool._rulesSection.hidden, true, 'no expansion for CSV');
  assert.equal(tool._columnsSectionEl.hidden, false);
  assert.equal(tool._valuesSectionEl.hidden, false);
  assert.deepEqual(options(find(container, 'h-export-limit')).map((option) => option.textContent),
    ['All', '50', '1K', '5K', '10K', '100K', '500K']);
  assert.equal(find(container, 'h-export-csv-mvsep').size, 1);

  change(find(container, 'h-export-limit'), '5000');
  assert.equal(tool.settings.limit, 5000);
  change(format, 'gephi');
  assert.deepEqual(options(find(container, 'h-export-limit')).map((option) => option.value), ['50', '1000', '5000', '10000']);
  assert.equal(tool.settings.limit, 10000);
  assert.equal(tool._rulesSection.hidden, false, 'Gephi has expansion and columns');
  assert.equal(tool._columnsSectionEl.hidden, false);
  change(format, 'json');
  assert.equal(tool.settings.limit, 0, 'back to All');
  await tool.destroy();
});

test('columns: preset radio group per record type; field selector only for custom', async () => {
  const { tool, container } = await mountTool();
  change(find(container, 'h-export-format'), 'csv');
  const blocks = container.querySelectorAll('.h-export-rectype');
  assert.equal(blocks.length, 2);
  const radios = blocks[0].querySelectorAll('input');
  assert.deepEqual(radios.map((radio) => radio.value), ['minimal', 'metadata', 'all', 'custom']);
  assert.equal(radios[0].checked, true, 'minimal by default');
  const body = find(blocks[0], 'h-export-rectype-body');
  assert.equal(body.hidden, true);
  radios[3].checked = true;
  radios[3].dispatchEvent(new Event('change'));
  assert.equal(body.hidden, false, 'custom shows the field selector');
  assert.equal(tool.settings.columnModes[12], 'custom');
  await tool.destroy();
});

test('data source settings: column, geo (GeoJSON, KML) and time fields', async () => {
  const withFields = source('t:10,12', {}, {
    data: { fields: [{ field: 'rec_Title' }] }, map: { geoFields: ['28'] }, timeline: { fields: ['10'] }
  });
  const { tool, container } = await mountTool(withFields);
  change(find(container, 'h-export-format'), 'csv');
  const box = find(container, 'h-export-source-fields');
  assert.equal(box.hidden, false);
  assert.equal(box.querySelectorAll('input').length, 3);
  assert.equal(tool._geoFieldsBox.hidden, true, 'geo fields only for GeoJSON and KML');
  change(find(container, 'h-export-format'), 'kml');
  assert.equal(tool._geoFieldsBox.hidden, false);
  await tool.destroy();
});

test('expansion modes: any link kind (no group) and depth', async () => {
  const { tool, container } = await mountTool();
  const mode = find(container, 'h-export-rules-mode');
  assert.equal(options(mode)[2].disabled, true, 'no data source rules');
  change(mode, 'any');
  const kind = find(container, 'h-export-any-kind');
  assert.equal(kind.querySelector('optgroup'), null);
  assert.deepEqual(options(kind).map((option) => option.value), ['connected', 'links', 'lf', 'lt', 'related']);
  assert.deepEqual(options(find(container, 'h-export-any-depth')).map((option) => option.value), ['1', '2', '3', '4']);
  await tool.destroy();
});

test('Export starts the job with the chosen settings', async () => {
  const { tool, container, started } = await mountTool();
  tool._namesBox.querySelector('input').checked = true;
  tool._namesBox.querySelector('input').dispatchEvent(new Event('change'));
  change(find(container, 'h-export-rules-mode'), 'any');
  change(find(container, 'h-export-any-kind'), 'lf');
  change(find(container, 'h-export-any-depth'), '2');
  change(find(container, 'h-export-scope'), 'rt:12');
  assert.equal(tool._exportButton.disabled, false);
  tool._exportButton.dispatchEvent(new Event('click'));
  await flush();
  assert.equal(started.length, 1);
  assert.equal(started[0].params.format, 'xml');
  assert.deepEqual(started[0].params.scope, { query: 't:10,12', rectypes: [12] });
  assert.equal(started[0].params.names, true);
  assert.deepEqual(started[0].params.rules, [{ query: { lf: [] }, levels: [{ query: { lf: [] }, levels: [] }] }]);
  await tool.destroy();
});

test('custom: the field selector is in its own element, so the record type body can be hidden', async () => {
  const { tool, container } = await mountTool();
  change(find(container, 'h-export-format'), 'csv');
  const block = container.querySelectorAll('.h-export-rectype')[0];
  const radios = block.querySelectorAll('input');
  radios[3].checked = true;
  radios[3].dispatchEvent(new Event('change'));
  const body = find(block, 'h-export-rectype-body');
  assert.ok(body.classList.contains('h-export-rectype-body'), 'body keeps its class');
  assert.ok(find(body, 'h-qse-helper'), 'the editor is inside');
  radios[0].checked = true;
  radios[0].dispatchEvent(new Event('change'));
  assert.equal(body.hidden, true, 'minimal hides the field selector');
  await tool.destroy();
});

test('data source settings: hidden when none of its checkboxes is shown', async () => {
  const geoOnly = source('t:10,12', {}, { map: { geoFields: ['28'] } });
  const { tool, container } = await mountTool(geoOnly);
  change(find(container, 'h-export-format'), 'csv');
  assert.equal(find(container, 'h-export-source-fields').hidden, true, 'only geo fields, not for CSV');
  change(find(container, 'h-export-format'), 'geojson');
  assert.equal(find(container, 'h-export-source-fields').hidden, false);
  await tool.destroy();
});

test('Export on top and at the bottom; the job monitor is hidden until an export starts', async () => {
  const { tool, container } = await mountTool();
  assert.ok(find(find(container, 'h-export-toolbar'), 'h-export-start'), 'Export on top');
  assert.ok(find(find(container, 'h-export-toolbar'), 'h-export-results-button'), 'Export results on top');
  assert.ok(find(tool._form, 'h-export-start-bottom'), 'Export at the bottom of the form');
  assert.equal(tool._monitorBox.hidden, true, 'no job monitor before an export');
  assert.equal(find(container, 'h-export-limits'), null, 'no server limits text');
  await tool.destroy();
});

test('Title for target pointers and Terms hierarchy are checked when the tool opens', async () => {
  const { tool } = await mountTool();
  assert.equal(tool.settings.values.pointerTitle, true);
  assert.equal(tool.settings.values.termHierarchy, true);
  await tool.destroy();
});

test('a running export: only the job monitor is shown, also when the tool is opened again', async () => {
  const running = { id: 'b'.repeat(32), type: 'export', status: 'running', progress: { done: 100, total: 1000, message: 'writing records' } };
  const { tool } = await mountTool(source('t:10,12'), { jobs: [running], finishes: false });
  assert.equal(tool._toolbar.hidden, true);
  assert.equal(tool._form.hidden, true);
  assert.equal(tool._monitorBox.hidden, false);
  await tool.destroy();
});

test('Export results: finished exports with download and delete', async () => {
  const done = { id: 'c'.repeat(32), type: 'export', status: 'done', finishedAt: 1791700000, title: 'Export CSV',
    result: { file: 'Places.csv', size: 2048, records: 10, download: true } };
  const report = { id: 'd'.repeat(32), type: 'report-generate', status: 'done', result: { file: 'r.html' } };
  const { tool, container, removed } = await mountTool(source('t:10,12'), { jobs: [done, report] });
  tool._resultsButton.dispatchEvent(new Event('click'));
  await flush();
  const popover = document.body.querySelector('.h-export-results-popover');
  assert.ok(popover, 'dropdown opened');
  const rows = popover.querySelectorAll('.h-export-results-row');
  assert.equal(rows.length, 1, 'only finished exports');
  assert.equal(find(rows[0], 'h-export-results-name').textContent, 'Places.csv');
  assert.equal(find(rows[0], 'h-export-results-name').href, `/jobs/${done.id}/result`);
  assert.equal(find(rows[0], 'h-export-results-size').textContent, '2 KB');
  const showMsgDlg = HMsg.showMsgDlg;
  const closeMsgDlg = HMsg.closeMsgDlg;
  HMsg.closeMsgDlg = () => {};
  let asked = null;
  let openWhenAsked = null;
  HMsg.showMsgDlg = (message, options) => {
    asked = message.textContent;
    openWhenAsked = document.body.querySelector('.h-export-results-popover');
    options.buttons[0].onClick();
    return null;
  };
  assert.equal(rows[0].querySelectorAll('button').length, 0, 'no delete icon in the rows');
  const links = rows[0].querySelectorAll('a');
  assert.ok(links.some((link) => link.href === `/jobs/${done.id}/result?inline=1` && link.target === '_blank'),
    'open in a new tab');
  const footerButtons = find(popover, 'h-export-results-footer').querySelectorAll('button');
  assert.deepEqual(footerButtons.map((button) => button.textContent), ['Remove marked', 'Remove all']);
  assert.equal(footerButtons[0].disabled, true, 'nothing marked yet');
  const mark = find(rows[0], 'h-export-results-mark');
  mark.checked = true;
  mark.dispatchEvent(new Event('change'));
  assert.equal(footerButtons[0].disabled, false);
  footerButtons[0].dispatchEvent(new Event('click'));
  await flush();
  HMsg.showMsgDlg = showMsgDlg;
  HMsg.closeMsgDlg = closeMsgDlg;
  assert.equal(openWhenAsked, null, 'the list is closed before the question');
  assert.match(asked, /Places\.csv/, 'Heurist confirmation dialog');
  assert.deepEqual(removed, [done.id]);
  await tool.destroy();
});


test('a refused export shows the server message with a warning icon', async () => {
  const { tool, container } = await mountTool();
  tool.jobs.start = async () => {
    const error = new Error('Heurist API request failed: Your export folder is full. Please clear it first.');
    error.details = { status: 403, error: 'access_denied', message: 'Your export folder is full. Please clear it first.' };
    throw error;
  };
  find(container, 'h-export-start').dispatchEvent(new Event('click'));
  await flush();
  const box = find(tool._monitorBox, 'h-export-error');
  assert.ok(box, 'warning shown');
  assert.ok(find(box, 'fa-triangle-exclamation'), 'warning icon');
  assert.equal(box.textContent.trim(), 'Your export folder is full. Please clear it first.');
  await tool.destroy();
});
