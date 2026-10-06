import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom, flush } from '../../../shared/test/helpers/fakeDom.js';

const document = installFakeDom();
const { ExportTool } = await import('../src/tools/export/ExportTool.js');

const dbdefs = {
  field: () => null,
  fields: () => [],
  fieldGlobal: () => null,
  rectypeName: (id) => ({ 10: 'Person', 12: 'Place' }[id] || `#${id}`),
  rectypes: () => []
};

const COUNTS = {
  't:10,12': [{ rec_RecTypeID: 10, count: 3 }, { rec_RecTypeID: 12, count: 95 }],
  't:12': [{ rec_RecTypeID: 12, count: 95 }]
};

function source(q, extra = {}) {
  return { reference: { type: 'query', key: q }, title: `Query ${q}`, request: { q, ...extra }, presentation: {}, meta: {} };
}

async function mountTool() {
  const started = [];
  const apiClient = { post: async (path, { body }) => ({ rectypes: COUNTS[body.q] || [] }) };
  const jobClient = {
    list: async () => [],
    start: async (type, params) => { started.push({ type, params }); return { id: 'a'.repeat(32), type, status: 'queued', progress: {} }; },
    wait: async (job) => ({ ...job, status: 'done', result: {} }),
    cancel: async () => ({}),
    resultUrl: (id) => `/jobs/${id}/result`
  };
  let current = source('t:10,12');
  const tool = new ExportTool({
    apiClient, jobClient, database: 'test',
    getDbDefs: async () => dbdefs,
    getDataSource: () => current,
    getSelection: () => []
  });
  const container = document.createElement('div');
  tool.attach(container);
  await tool.render();
  return { tool, container, started, setSource: (value) => { current = value; } };
}

const find = (root, className) => root.querySelector(`.${className}`);
const options = (select) => select.querySelectorAll('option');

function change(element, value) {
  element.value = value;
  element.dispatchEvent(new Event('change'));
}

test('scope select: result, selection and the record types of the result', async () => {
  const { tool, container } = await mountTool();
  const scope = find(container, 'h-export-scope');
  const values = options(scope).map((option) => option.value);
  assert.deepEqual(values, ['result', 'selection', 'rt:12', 'rt:10'], 'record types by count');
  assert.equal(options(scope)[1].disabled, true, 'no selection yet');
  assert.equal(scope.querySelector('optgroup').label, 'Record type');

  tool.setSelection([1, 2]);
  const selection = options(find(container, 'h-export-scope'))[1];
  assert.equal(selection.disabled, false, 'selection follows Explorer');
  assert.match(selection.textContent, /\(2\)/);
  await tool.destroy();
});

test('a new DataSource rebuilds the scope select', async () => {
  const { tool, container } = await mountTool();
  await tool.setDataSource(source('t:12'));
  const values = options(find(container, 'h-export-scope')).map((option) => option.value);
  assert.deepEqual(values, ['result', 'selection', 'rt:12']);
  await tool.destroy();
});

test('format: value formats and columns only where used; names for JSON/XML; Gephi limits', async () => {
  const { tool, container } = await mountTool();
  const format = find(container, 'h-export-format');
  assert.equal(tool._valuesSectionEl.hidden, false, 'CSV uses value formats');
  assert.equal(tool._namesBox.hidden, true);
  assert.equal(tool._csvBox.hidden, false);

  change(format, 'json');
  assert.equal(tool._valuesSectionEl.hidden, true, 'JSON has no value formats');
  assert.equal(tool._columnsSectionEl.hidden, true, 'JSON has no columns');
  assert.equal(tool._namesBox.hidden, false, 'JSON: names and local ids');
  assert.equal(tool._csvBox.hidden, true);

  change(format, 'gephi');
  assert.deepEqual(options(find(container, 'h-export-limit')).map((option) => option.value), ['1000', '5000', '10000']);
  assert.equal(tool.settings.limit, 10000);

  change(format, 'csv');
  assert.deepEqual(options(find(container, 'h-export-limit')).map((option) => option.textContent),
    ['All', '1K', '5K', '10K', '100K', '500K']);
  await tool.destroy();
});

test('expansion modes: any link kind and depth; data source rules only when the source has rules', async () => {
  const { tool, container } = await mountTool();
  const mode = find(container, 'h-export-rules-mode');
  assert.equal(options(mode)[2].disabled, true, 'no data source rules');
  change(mode, 'any');
  const kind = find(container, 'h-export-any-kind');
  assert.equal(kind.querySelector('optgroup').label, 'Any');
  assert.deepEqual(options(kind).map((option) => option.value), ['connected', 'links', 'lf', 'lt', 'related']);
  assert.deepEqual(options(find(container, 'h-export-any-depth')).map((option) => option.value), ['1', '2', '3', '4']);

  await tool.setDataSource(source('t:10,12', { rules: [{ query: { t: 12 } }] }));
  assert.equal(options(find(container, 'h-export-rules-mode'))[2].disabled, false);
  await tool.destroy();
});

test('Export starts the job with the chosen settings', async () => {
  const { tool, container, started } = await mountTool();
  change(find(container, 'h-export-format'), 'json');
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
  assert.equal(started[0].type, 'export');
  assert.deepEqual(started[0].params.scope, { query: 't:10,12', rectypes: [12] });
  assert.equal(started[0].params.names, true);
  assert.deepEqual(started[0].params.rules, [{ query: { lf: [] }, levels: [{ query: { lf: [] }, levels: [] }] }]);
  await tool.destroy();
});
