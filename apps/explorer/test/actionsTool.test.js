import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installFakeDom, flush } from '../../../shared/test/helpers/fakeDom.js';

const document = installFakeDom();
const vocabulary = JSON.parse(readFileSync(new URL('../src/utils/queryVocabulary.json', import.meta.url), 'utf8'));
const { ACTIONS, actionById } = await import('../src/tools/actions/actionCatalog.js');
const {
  conditionFromRow, fieldValueParams, fieldValuePatch, fieldValueProblems, unitedFieldList, valueList
} = await import('../src/tools/actions/fieldValueParams.js');
const { singleRecordReport, renderActionReport } = await import('../src/tools/actions/ActionReport.js');
const { ActionsTool } = await import('../src/tools/actions/ActionsTool.js');
const { HMsg } = await import('#shared/ui');
const { emptyFieldRow } = await import('../src/utils/queryModel.js');

const FIELDS = {
  10: [
    { id: 1, name: 'Family name', type: 'freetext' },
    { id: 132, name: 'Alias', type: 'freetext' },
    { id: 240, name: 'Life events', type: 'resource' },
    { id: 10, name: 'Birth date', type: 'date' }
  ],
  12: [
    { id: 1, name: 'Place name', type: 'freetext' },
    { id: 133, name: 'Population', type: 'float' }
  ]
};

const dbdefs = {
  fields: (rty) => FIELDS[rty] || [],
  field: (rty, dty) => (FIELDS[rty] || []).find((field) => field.id === Number(dty)) || null,
  fieldGlobal: (dty) => Object.values(FIELDS).flat().find((field) => field.id === Number(dty)) || null,
  fieldType: (rty, dty) => Object.values(FIELDS).flat().find((field) => field.id === Number(dty))?.type || '',
  fieldName: (rty, dty) => Object.values(FIELDS).flat().find((field) => field.id === Number(dty))?.name || '',
  rectypeName: (id) => ({ 10: 'Person', 12: 'Place' }[id] || `#${id}`),
  rectypes: () => [],
  vocabRoot: () => 0
};

test('catalog: implemented actions and their forms', () => {
  assert.deepEqual(ACTIONS.filter((action) => action.implemented).map((action) => action.id),
    ['field-add', 'field-replace', 'field-delete', 'calculations', 'ownership', 'titles', 'delete']);
  assert.equal(actionById('field-replace').mode, 'replace');
  assert.equal(actionById('ownership').form, 'ownership');
  assert.equal(actionById('titles').form, 'none');
  assert.equal(actionById('delete').danger, true);
  assert.equal(actionById('link').implemented, false);
});

test('united field list: each field once, allowed types, the record types that have it', () => {
  const list = unitedFieldList(dbdefs, [10, 12]);
  assert.deepEqual(list.map((field) => field.id), [132, 10, 1, 133]);
  const name = list.find((field) => field.id === 1);
  assert.equal(name.name, 'Family name');
  assert.deepEqual(name.rectypes.map((item) => item.name), ['Person', 'Place']);
  assert.equal(list.some((field) => field.type === 'resource'), false);
});

test('condition of a Filter Builder row = the value of f:<field>', () => {
  const row = (kind, op, values, extra = {}) => ({ ...emptyFieldRow(), dty: 132, kind, op, values, ...extra });
  assert.deepEqual(conditionFromRow(row('text', 'op.exact', ['Johnson']), vocabulary), { condition: '=Johnson', problem: null });
  assert.equal(conditionFromRow(row('text', 'op.starts_with', ['son']), vocabulary).condition, 'son%');
  assert.equal(conditionFromRow(row('text', 'op.not_contains', ['Johnson']), vocabulary).condition, '-Johnson');
  assert.equal(conditionFromRow(row('number', 'op.between', ['1900', '2000']), vocabulary).condition, '1900<>2000');
  assert.equal(conditionFromRow(row('text', 'op.exact', ['']), vocabulary).problem, 'Enter the value of the condition');
  const many = conditionFromRow(row('text', 'op.contains', ['a', 'b'], { valueConj: 'all' }), vocabulary);
  assert.equal(many.condition, null);
  assert.match(many.problem, /one condition/);
});

test('job parameters and the PATCH body of one record', () => {
  const field = { id: 132, name: 'Alias' };
  const replace = fieldValueParams({ mode: 'replace', field, values: ['Smith'], conditional: true, condition: '=Johnson', addIfNone: true });
  assert.deepEqual({ ...replace, title: '' }, {
    action: 'field-replace', title: '', field: 132, values: ['Smith'], match: '=Johnson', addIfNone: true
  });
  assert.deepEqual(fieldValuePatch(replace), { details: { 132: ['Smith'] }, detailsMatch: { 132: '=Johnson' }, addIfNone: ['132'] });
  const all = fieldValueParams({ mode: 'replace', field, values: ['Smith'], conditional: false, condition: '=x', addIfNone: true });
  assert.equal(all.match, '');
  assert.equal(all.addIfNone, false, 'addIfNone only with a condition');
  const remove = fieldValueParams({ mode: 'delete', field, values: ['x'] });
  assert.deepEqual(fieldValuePatch(remove), { details: { 132: [] } });
  const add = fieldValueParams({ mode: 'add', field, values: ['New'], conditional: true, condition: '=x' });
  assert.deepEqual(fieldValuePatch(add), { detailsAdd: { 132: ['New'] } });
  assert.deepEqual(valueList(['a', '', null, 3]), ['a', '3']);
  assert.deepEqual(fieldValueProblems({ mode: 'add', field: null }), ['Choose a field']);
  assert.deepEqual(fieldValueProblems({ mode: 'add', field, values: [] }), ['Enter the value to be added']);
  assert.deepEqual(fieldValueProblems({ mode: 'delete', field, conditional: true, conditionProblem: 'X' }), ['X']);
});

test('one-record report: changed, skipped by code, error', () => {
  const params = { action: 'field-add', field: 132 };
  const changed = singleRecordReport(params, 5, { changed: { 132: 1 }, values: { 132: { found: 2, added: 1, removed: 0 } } });
  assert.deepEqual(changed.records, { scope: 1, changed: 1, unchanged: 0, skipped: 0, errors: 0 });
  assert.deepEqual(changed.values, { found: 2, added: 1, removed: 0 });
  const skipped = singleRecordReport(params, 5, { error: { status: 422, issues: [{ code: 'single_value', message: 'one' }] } });
  assert.deepEqual(skipped.skipped, { single_value: 1 });
  const rights = singleRecordReport(params, 5, { error: { status: 403, issues: [] } });
  assert.deepEqual(rights.skipped, { rights: 1 });
  const error = singleRecordReport(params, 5, { error: { status: 422, message: 'bad value', issues: [] } });
  assert.equal(error.records.errors, 1);
  assert.equal(error.errors[0].message, 'bad value');
});

test('report of a stopped job: where it stopped, counts and Show buttons', () => {
  const shown = [];
  const root = renderActionReport({
    status: 'cancelled', title: 'Add · Alias', error: 'The job was stopped',
    result: {
      action: 'field-add', complete: false, stage: 'records', done: 4, total: 10, lastRecordId: 77,
      records: { scope: 10, changed: 3, unchanged: 0, skipped: 1, errors: 0 }, skipped: { max: 1 },
      values: { found: 3, added: 3, removed: 0 }, ids: { changed: [1, 2, 3], skipped: [4], errors: [] }, errors: []
    }
  }, { showRecords: (ids, title) => shown.push({ ids, title }) });
  const text = root.textContent;
  assert.match(text, /stopped at record 5 of 10/);
  assert.match(text, /#77/);
  assert.match(text, /More values than the field allows/);
  const buttons = root.querySelectorAll('.h-actions-report-show');
  assert.equal(buttons.length, 2, 'changed and skipped records can be shown');
  buttons[0].dispatchEvent(new Event('click'));
  assert.deepEqual(shown[0].ids, [1, 2, 3]);
});

// ---------------------------------------------------------------- the tool

function source(q) {
  return { reference: { type: 'query', key: q }, title: '', request: { q }, meta: {} };
}

async function mountTool({ selection = [], jobs = [], finishes = true, total = 98 } = {}) {
  const started = [];
  const patched = [];
  const removed = [];
  let refreshed = 0;
  const apiClient = {
    post: async (path, { body }) => (String(body.q).includes('ids')
      ? { total: selection.length, rectypes: [{ rec_RecTypeID: 10, count: selection.length }] }
      : { total, rectypes: [{ rec_RecTypeID: 10, count: 3 }, { rec_RecTypeID: 12, count: total - 3 }] }),
    get: async () => ({ records: [] })
  };
  const jobClient = {
    list: async ({ type } = {}) => jobs.filter((job) => !type || job.type === type),
    get: async (id) => jobs.find((job) => job.id === id) || { id, status: 'done', result: null },
    start: async (type, params) => { started.push({ type, params }); return { id: 'b'.repeat(32), type, status: 'queued', progress: {} }; },
    wait: (job) => (finishes ? Promise.resolve({ ...job, status: 'done', result: { records: { scope: 98, changed: 98 } } }) : new Promise(() => {})),
    cancel: async () => ({}),
    resultUrl: (id) => `/jobs/${id}/result`
  };
  const recordClient = {
    patch: async (id, body, options) => {
      patched.push({ id, body, options });
      return { record: {}, issues: [], changed: { 132: 1 }, values: { 132: { found: 0, added: 1, removed: 0 } }, headerChanged: true };
    },
    remove: async (id, options) => {
      removed.push({ id, options });
      return { deleted: [String(id)] };
    }
  };
  const tool = new ActionsTool({
    apiClient, jobClient, recordClient,
    getDbDefs: async () => dbdefs,
    getDataSource: () => source('t:10,12'),
    getSelection: () => selection,
    onRecordsChanged: () => { refreshed += 1; }
  });
  const container = document.createElement('div');
  tool.attach(container);
  await tool.render();
  await flush();
  return { tool, container, started, patched, removed, refreshed: () => refreshed };
}

/** The confirmation dialog answers Run at once. */
function confirmRun() {
  const original = HMsg.showMsgDlg;
  const close = HMsg.closeMsgDlg;
  HMsg.closeMsgDlg = () => {};
  HMsg.showMsgDlg = (content, { buttons }) => {
    queueMicrotask(() => buttons[0].onClick());
    return null;
  };
  return () => {
    HMsg.showMsgDlg = original;
    HMsg.closeMsgDlg = close;
  };
}

/** An action entry of the list (the fake DOM finds by class only). */
function entry(container, id) {
  return [...container.querySelectorAll('.h-actions-entry')].find((row) => row.dataset.action === id) || null;
}

async function openAction(container, id) {
  entry(container, id).dispatchEvent(new Event('click'));
  await flush();
  await flush();
}

async function pickField(container, id) {
  [...container.querySelectorAll('.h-actions-field')].find((row) => Number(row.dataset.field) === id)
    .dispatchEvent(new Event('click'));
  await flush();
  await flush();
}

test('the list: groups, disabled actions not implemented', async () => {
  const { container } = await mountTool();
  const entries = container.querySelectorAll('.h-actions-entry');
  assert.equal(entries.length, ACTIONS.length);
  assert.equal(entry(container, 'field-add').disabled, false);
  assert.equal(entry(container, 'link').disabled, true);
  assert.equal(container.querySelectorAll('.h-actions-group').length, 4);
  assert.equal(container.querySelector('.h-actions-group').textContent, 'Field values', 'Field values first');
  assert.equal(container.querySelector('.h-actions-back').hidden, true, 'no "All actions" on the list');
  assert.equal(ACTIONS.some((action) => /descriptions/i.test(action.name)), false);
  assert.ok(ACTIONS.every((action) => /_desc$/.test(action.descKey)), 'descriptions under keys');
});

test('field type filter: options of the listed types, the list filtered', async () => {
  const { container } = await mountTool();
  await openAction(container, 'field-add');
  const select = container.querySelector('.h-actions-fields-type');
  assert.deepEqual([...select.querySelectorAll('option')].map((option) => option.value), ['all', 'text', 'date', 'numeric']);
  select.value = 'numeric';
  select.dispatchEvent(new Event('change'));
  assert.deepEqual([...container.querySelectorAll('.h-actions-field')].map((row) => Number(row.dataset.field)), [133]);
});

test('Add: united field list, value input, the job "record-action" with the scope', async () => {
  const { tool, container, started } = await mountTool();
  await openAction(container, 'field-add');
  assert.match(container.querySelector('.h-actions-help').textContent, /adds a new value/);
  const fields = [...container.querySelectorAll('.h-actions-field')].map((row) => Number(row.dataset.field));
  assert.deepEqual(fields, [132, 10, 1, 133]);
  assert.equal(container.querySelector('.h-actions-run').disabled, true, 'no field yet');
  await pickField(container, 132);
  await tool.form.form.setValue('value', 'New alias');
  tool._refresh();
  assert.equal(container.querySelector('.h-actions-run').disabled, false);
  const restore = confirmRun();
  try {
    await tool._run();
    await flush();
  } finally {
    restore();
  }
  assert.equal(started.length, 1);
  assert.equal(started[0].type, 'record-action');
  assert.equal(started[0].params.action, 'field-add');
  assert.deepEqual(started[0].params.values, ['New alias']);
  assert.deepEqual(started[0].params.scope, { query: 't:10,12' });
  await flush();
  assert.equal(container.querySelector('.h-actions-report-box').hidden, false, 'the report after the job');
});

test('Replace with a condition: the condition of the Filter Builder row', async () => {
  const { tool, container, started } = await mountTool();
  await openAction(container, 'field-replace');
  await pickField(container, 132);
  await tool.form.form.setValue('matchMode', 'conditional');
  await tool.form.form.setValue('value', 'Smith');
  tool.form.condition.setRowModel({ ...tool.form.condition.getRowModel(), op: 'op.exact', values: ['Johnson'] });
  tool._refresh();
  const restore = confirmRun();
  try {
    await tool._run();
  } finally {
    restore();
  }
  assert.equal(started[0].params.match, '=Johnson');
  assert.deepEqual(started[0].params.values, ['Smith']);
});

test('one selected record: PATCH at once, no job', async () => {
  const { tool, container, started, patched } = await mountTool({ selection: [42] });
  await openAction(container, 'field-add');
  const select = container.querySelector('.h-actions-scope');
  select.value = 'selection';
  select.dispatchEvent(new Event('change'));
  await flush();
  await flush();
  await pickField(container, 132);
  await tool.form.form.setValue('value', 'One');
  tool._refresh();
  const restore = confirmRun();
  try {
    await tool._run();
  } finally {
    restore();
  }
  assert.equal(started.length, 0);
  assert.equal(patched[0].id, 42);
  assert.deepEqual(patched[0].body, { detailsAdd: { 132: ['One'] } });
  assert.equal(patched[0].options.force, true);
  assert.match(container.querySelector('.h-actions-report-box').textContent, /Records changed/);
});

test('Delete: warning icon in the list and the pane', async () => {
  const { container } = await mountTool();
  assert.ok(entry(container, 'delete').querySelector('.h-actions-danger-icon'), 'icon in the list');
  assert.equal(entry(container, 'titles').querySelector('.h-actions-danger-icon'), null);
  await openAction(container, 'delete');
  assert.ok(container.querySelector('.h-actions-title').querySelector('.h-actions-danger-icon'), 'icon in the pane title');
  assert.ok(container.querySelector('.h-actions-help').classList.contains('is-danger'), 'help box marked');
});

test('Delete of more than 10 records: the server password is required and sent', async () => {
  const { tool, container, started } = await mountTool();
  await openAction(container, 'delete');
  assert.match(container.querySelector('.h-actions-problems').textContent, /server password/);
  assert.equal(container.querySelector('.h-actions-run').disabled, true);
  const password = container.querySelector('.h-actions-delete-password').querySelector('input');
  password.value = 'secret';
  password.dispatchEvent(new Event('input'));
  assert.equal(container.querySelector('.h-actions-run').disabled, false);
  const restore = confirmRun();
  try {
    await tool._run();
  } finally {
    restore();
  }
  assert.equal(started[0].params.action, 'delete');
  assert.equal(started[0].params.password, 'secret');
});

test('Delete of up to 10 records: no password; one selected record by DELETE, then the result again', async () => {
  const { tool, container, started, removed, refreshed } = await mountTool({ selection: [42] });
  await openAction(container, 'delete');
  const select = container.querySelector('.h-actions-scope');
  select.value = 'selection';
  select.dispatchEvent(new Event('change'));
  await flush();
  assert.equal(container.querySelector('.h-actions-delete-password').parentElement.hidden, true, 'no password for one record');
  const restore = confirmRun();
  try {
    await tool._run();
  } finally {
    restore();
  }
  assert.equal(started.length, 0);
  assert.deepEqual(removed, [{ id: 42, options: { force: true } }]);
  assert.match(container.querySelector('.h-actions-report-box').textContent, /Records deleted/);
  assert.equal(refreshed(), 1, 'Explorer runs the current result again');
});

test('Rebuild record titles: no form, the job with the scope only', async () => {
  const { tool, container, started } = await mountTool({ selection: [42] });
  await openAction(container, 'titles');
  assert.ok(container.querySelector('.h-actions-noform'));
  const select = container.querySelector('.h-actions-scope');
  select.value = 'selection';
  select.dispatchEvent(new Event('change'));
  await flush();
  const restore = confirmRun();
  try {
    await tool._run();
  } finally {
    restore();
  }
  assert.equal(started.length, 1, 'titles of one record: still the job');
  assert.equal(started[0].params.action, 'titles');
  assert.deepEqual(started[0].params.scope, { query: 't:10,12', ids: [42] });
});

test('Ownership: the access form gives owner and visibility; one record by PATCH of the header', async () => {
  const { tool, container, patched } = await mountTool({ selection: [42] });
  await openAction(container, 'ownership');
  await flush();
  assert.ok(container.querySelector('.h-record-access'), 'the form of Summary > Admin');
  const params = tool.form.params();
  assert.equal(params.action, 'ownership');
  assert.equal(params.visibility, 'viewable');
  const select = container.querySelector('.h-actions-scope');
  select.value = 'selection';
  select.dispatchEvent(new Event('change'));
  await flush();
  const restore = confirmRun();
  try {
    await tool._run();
  } finally {
    restore();
  }
  assert.deepEqual(Object.keys(patched[0].body).sort(), ['rec_NonOwnerVisibility', 'rec_NonOwnerVisibilityGroups', 'rec_OwnerUGrpID']);
  assert.match(container.querySelector('.h-actions-report-box').textContent, /Records changed/);
});

test('a running job is shown again after a reload; the form is hidden', async () => {
  const running = { id: 'c'.repeat(32), type: 'record-action', status: 'running', progress: { done: 1, total: 5 } };
  const { tool, container } = await mountTool({ jobs: [running], finishes: false });
  assert.equal(tool.isRunning(), true);
  assert.equal(container.querySelector('.h-actions-body').hidden, true);
  assert.equal(container.querySelector('.h-actions-monitor').hidden, false);
  await tool.destroy();
});
