/**
 * @file recordEditor.test.js
 * @brief HRecordEditor and HRecordField with the fake DOM (plan 14 Phase 2).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom, flush } from './helpers/fakeDom.js';

const document = installFakeDom();
const { HRecordEditor } = await import('../src/widgets/record-editor/HRecordEditor.js');
const { RecordEditError } = await import('../src/data/RecordEditClient.js');
const { createHInput } = await import('../src/widgets/form/inputs/createHInput.js');

const host = () => { const element = document.createElement('div'); document.body.append(element); return element; };

const STRUCTURE = {
  rty: 29,
  groups: [
    { id: 57, type: 'tabs', label: 'Description', help: '', children: [
      { dty: 1, type: 'freetext', label: 'Title', help: '', req: 'required', max: 1, default: '', multilang: true },
      { dty: 12, type: 'blocktext', label: 'Query', help: '', req: 'required', max: 1, default: '', height: 3 }
    ] },
    { id: 58, type: 'tabs', label: 'Map', help: '', children: [
      { dty: 1105, type: 'freetext', label: 'Date fields', help: '', req: 'optional', max: 0, default: '' },
      { dty: 32, type: 'integer', label: 'Min zoom', help: '', req: 'recommended', max: 1, default: '' }
    ] }
  ]
};

const RECORD = {
  rec_ID: '7', rec_RecTypeID: '29', rec_Title: 'Main', rec_OwnerUGrpID: '2', rec_NonOwnerVisibility: 'viewable',
  rec_NonOwnerVisibilityGroups: [], rec_EditGroups: ['4'], rec_Modified: '2026-10-12 10:00:00',
  details: { 1: ['Main', 'fre:Principal'], 12: ['t:10'], 1105: ['9', '10'] }
};

const dbdefs = {
  dbconst: (name) => ({ RT_QUERY_SOURCE: 29, DT_NAME: 1 })[name] ?? null,
  rectypeName: () => 'Query Data Source',
  groups: () => [{ id: 4, name: 'Editors', role: 'member' }],
  users: () => [{ id: 2, name: 'Owner' }],
  userGroupName: (id) => ({ 2: 'Owner', 4: 'Editors' })[id] || '',
  currentUserId: () => 2,
  languages: () => ['ENG', 'FRE']
};

/** Editor over a fake client and structure provider. */
async function openEditor({ record = RECORD, update = null, insert = null, recordId = 7, rectypeId = null } = {}) {
  const calls = [];
  const client = {
    async load() { return { record: structuredClone(record), meta: {} }; },
    async update(body, options) { calls.push(['update', body, options]); return update ? update(body, options) : { record: { ...body, rec_Title: 'Main' }, issues: [] }; },
    async insert(body) { calls.push(['insert', body]); return insert ? insert(body) : { record: { ...body, rec_ID: '8', rec_Title: 'New' }, issues: [] }; }
  };
  const structureProvider = { async editStructure() { return STRUCTURE; } };
  const element = host();
  const editor = new HRecordEditor().attach(element, {
    apiClient: { get: async () => ({ records: [] }), request: async () => ({}) },
    dbdefs, client, structureProvider, recordId, rectypeId
  });
  await editor.open();
  return { editor, element, calls };
}

test('the editor shows the record in tab groups and gives it back unchanged', async () => {
  const { editor, element } = await openEditor();
  assert.equal(element.querySelectorAll('button.h-record-editor-tab').length, 2, 'two tabs');
  assert.equal(element.querySelector('.h-record-editor-record').textContent, 'Main');
  const body = editor.getRecord();
  assert.equal(body.rec_ID, '7');
  assert.equal(body.rec_Modified, '2026-10-12 10:00:00');
  assert.deepEqual(body.rec_EditGroups, ['4']);
  assert.deepEqual(body.details[1], ['Main', 'fre:Principal'], 'translation kept');
  assert.deepEqual(body.details[1105], ['9', '10'], 'repeatable values');
  assert.deepEqual(body.details[32], []);
  assert.equal(editor.isDirty(), false);
  const chips = element.querySelectorAll('.h-record-field-translation');
  assert.equal(chips.length, 1, 'translation chip');
  await editor.destroy();
});

test('a repeatable field adds and removes values; the add button stops at max', async () => {
  const { editor, element } = await openEditor();
  const field = editor._fieldWidgets.get(1105);
  assert.equal(field.isRepeatable, true);
  field.addButton.click();
  assert.equal(field._rows.length, 3);
  field._rows[2].input.setValue('11');
  assert.deepEqual(editor.getRecord().details[1105], ['9', '10', '11']);
  assert.equal(editor.isDirty(), true);
  field._rows[0].removeButton.click();
  assert.deepEqual(editor.getRecord().details[1105], ['10', '11']);
  const single = editor._fieldWidgets.get(32);
  assert.equal(single.isRepeatable, false);
  assert.equal(single.addButton, undefined, 'no add button for max 1');
  assert.ok(element.querySelector('.h-record-field-translate'), 'multilingual field has Translate');
  await editor.destroy();
});

test('a value can be hidden from the public', async () => {
  const { editor } = await openEditor();
  const field = editor._fieldWidgets.get(12);
  field._rows[0].hiddenButton.click();
  assert.deepEqual(editor.getRecord().details[12], [{ value: 't:10', hidden: true }]);
  await editor.destroy();
});

test('save sends PUT, keeps the new rec_Modified and reports saved', async () => {
  const saved = [];
  const { editor, element, calls } = await openEditor({
    update: (body) => ({ record: { ...body, rec_Modified: '2026-10-12 11:00:00', rec_Title: 'Main' }, issues: [] })
  });
  element.addEventListener('h-record-editor-saved', (event) => saved.push(event.detail));
  editor._fieldWidgets.get(12)._rows[0].input.setValue('t:12');
  assert.equal(await editor.save(), true);
  assert.equal(calls[0][0], 'update');
  assert.deepEqual(calls[0][1].details[12], ['t:12']);
  assert.equal(saved.length, 1);
  assert.equal(editor.getRecord().rec_Modified, '2026-10-12 11:00:00');
  assert.equal(editor.isDirty(), false);
  await editor.destroy();
});

test('server issues are shown next to their fields', async () => {
  const issues = [{ field: '12', index: 0, code: 'required', severity: 'error', message: 'Field "Query" is required' }];
  const { editor } = await openEditor({
    update: () => { throw new RecordEditError('invalid', { status: 422, code: 'validation', issues }); }
  });
  assert.equal(await editor.save(), false);
  const field = editor._fieldWidgets.get(12);
  assert.equal(field.container.classList.contains('has-error'), true);
  assert.match(field.issuesHost.textContent, /required/);
  await editor.destroy();
});

test('missing required values are found before sending', async () => {
  const { editor, calls } = await openEditor();
  editor._fieldWidgets.get(12)._rows[0].input.setValue('');
  assert.equal(await editor.save(), false);
  assert.equal(calls.length, 0, 'nothing sent');
  assert.equal(editor._fieldWidgets.get(12).container.classList.contains('has-error'), true);
  await editor.destroy();
});

test('a new record is inserted with the current user as owner', async () => {
  const { editor, calls } = await openEditor({ recordId: 0, rectypeId: 29 });
  assert.equal(editor.isNew, true);
  editor._fieldWidgets.get(1)._rows[0].input.setValue('New');
  editor._fieldWidgets.get(12)._rows[0].input.setValue('t:1');
  assert.equal(await editor.save(), true);
  assert.equal(calls[0][0], 'insert');
  assert.equal(calls[0][1].rec_ID, '0');
  assert.equal(calls[0][1].rec_RecTypeID, '29');
  assert.equal(calls[0][1].rec_OwnerUGrpID, '2');
  assert.equal(editor.isNew, false, 'saved record has its id');
  await flush();
  await editor.destroy();
});

test('boolean, resource and file inputs', () => {
  const bool = createHInput('boolean', host(), { value: 'yes', suppressLabel: true });
  assert.equal(bool.getValue(), 'true');
  bool.setValue(false);
  assert.equal(bool.getValue(), 'false');
  const source = { load: async () => ({ items: [], total: 0, complete: true }), labelFor: (value) => (Number(value) === 5 ? 'Five' : ''), rememberLabel() {} };
  const resource = createHInput('resource', host(), { value: '5', source, suppressLabel: true });
  assert.equal(resource.getValue(), 5);
  assert.equal(resource.combo.buttonText.textContent, 'Five');
  const file = createHInput('file', host(), { value: 3, file: { ulf_OrigFileName: 'map.png' }, suppressLabel: true });
  assert.equal(file.getValue(), 3);
  assert.equal(file.summary.textContent, 'map.png');
  file.control.value = 'abc';
  assert.equal(file.validate().length, 1);
});

test('a special field shows a readable value, the raw text on request and its editor', async () => {
  const { HRecordField } = await import('../src/widgets/record-editor/HRecordField.js');
  const values = { 1174: '{"groups":[]}' };
  const field = new HRecordField().attach(host(), {
    field: { dty: 1172, type: 'freetext', label: 'Rules', help: '', req: 'optional', max: 1, default: '' },
    state: { values: [{ value: '[{"name":"People"}]', hidden: false }], translations: [] },
    special: {
      json: true,
      describe: (value) => JSON.parse(value).map((rule) => rule.name).join('; '),
      edit: async (value, context) => { context.setValue(1174, '{}'); return '[{"name":"Places"}]'; }
    },
    context: { getValue: (dty) => values[dty], setValue: (dty, value) => { values[dty] = value; } }
  }).render();
  const row = field._rows[0];
  assert.equal(row.summary.textContent, 'People');
  const input = field.container.querySelector('.h-record-field-input');
  assert.equal(input.hidden, true, 'raw text hidden at first');
  const [raw, edit] = field.container.querySelector('.h-record-field-special-buttons').children;
  raw.click();
  assert.equal(input.hidden, false, 'Show raw shows the text');
  edit.click();
  await flush();
  assert.equal(field.getValue(), '[{"name":"Places"}]');
  assert.equal(row.summary.textContent, 'Places');
  assert.equal(values[1174], '{}', 'the editor may change another field');
  row.input.setValue('not json');
  assert.deepEqual(field.validate(), ['The raw value is not valid JSON']);
  await field.destroy();
});
