/**
 * @file recordEditor.test.js
 * @brief HRecordEditor and HEditField with the fake DOM (plan 14 Phase 2).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom, flush } from './helpers/fakeDom.js';

const document = installFakeDom();
// HCardinalLayout (Record summary pane, plan 18) uses Node
globalThis.Node ??= globalThis.HTMLElement;
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
async function openEditor({ record = RECORD, update = null, insert = null, recordId = 7, rectypeId = null, specialEditors = undefined } = {}) {
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
    dbdefs, client, structureProvider, recordId, rectypeId, specialEditors
  });
  await editor.open();
  return { editor, element, calls };
}

test('the editor shows the record in tab groups and gives it back unchanged', async () => {
  const { editor, element } = await openEditor();
  assert.equal(element.querySelectorAll('button.h-edit-form-tab').length, 2, 'two tabs');
  assert.equal(element.querySelector('.h-record-editor-record').textContent, 'Main');
  const body = editor.getRecord();
  assert.equal(body.rec_ID, '7');
  assert.equal(body.rec_Modified, '2026-10-12 10:00:00');
  assert.deepEqual(body.rec_EditGroups, ['4']);
  assert.deepEqual(body.details[1], ['Main', 'fre:Principal'], 'translation kept');
  assert.deepEqual(body.details[1105], ['9', '10'], 'repeatable values');
  assert.deepEqual(body.details[32], []);
  assert.equal(editor.isDirty(), false);
  const chips = element.querySelectorAll('.h-edit-field-translation');
  assert.equal(chips.length, 1, 'translation chip');
  await editor.destroy();
});

test('a repeatable field adds and removes values; the add button stops at max', async () => {
  const { editor, element } = await openEditor();
  const field = editor.editForm.getFieldWidget(1105);
  assert.equal(field.isRepeatable, true);
  field.addButton.click();
  assert.equal(field._rows.length, 3);
  field._rows[2].input.setValue('11');
  assert.deepEqual(editor.getRecord().details[1105], ['9', '10', '11']);
  assert.equal(editor.isDirty(), true);
  field._rows[0].removeButton.click();
  assert.deepEqual(editor.getRecord().details[1105], ['10', '11']);
  const single = editor.editForm.getFieldWidget(32);
  assert.equal(single.isRepeatable, false);
  assert.equal(single.addButton ?? null, null, 'no add button for max 1');
  assert.ok(element.querySelector('.h-edit-field-translate'), 'multilingual field has Translate');
  await editor.destroy();
});

test('a value can be hidden from the public', async () => {
  const { editor } = await openEditor();
  const field = editor.editForm.getFieldWidget(12);
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
  editor.editForm.getFieldWidget(12)._rows[0].input.setValue('t:12');
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
  const field = editor.editForm.getFieldWidget(12);
  assert.equal(field.container.classList.contains('has-error'), true);
  assert.match(field.issuesHost.textContent, /required/);
  await editor.destroy();
});

test('missing required values are found before sending', async () => {
  const { editor, calls } = await openEditor();
  editor.editForm.getFieldWidget(12)._rows[0].input.setValue('');
  assert.equal(await editor.save(), false);
  assert.equal(calls.length, 0, 'nothing sent');
  assert.equal(editor.editForm.getFieldWidget(12).container.classList.contains('has-error'), true);
  await editor.destroy();
});

test('a new record is inserted with the current user as owner', async () => {
  const { editor, calls } = await openEditor({ recordId: 0, rectypeId: 29 });
  assert.equal(editor.isNew, true);
  editor.editForm.getFieldWidget(1)._rows[0].input.setValue('New');
  editor.editForm.getFieldWidget(12)._rows[0].input.setValue('t:1');
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
  // without an API client: the file name only (no picker, no upload)
  const file = createHInput('file', host(), { value: 3, file: { ulf_OrigFileName: 'map.png' }, suppressLabel: true });
  assert.equal(file.getValue(), 3);
  assert.equal(file.summary.textContent, 'map.png');
  assert.equal(file.uploadButton, undefined);
});

/** Fake picker source and uploader of HInputFile. */
function fileFakes({ duplicates = [] } = {}) {
  const calls = [];
  const labels = new Map([['7', 'old.png']]);
  const source = {
    load: async () => ({ items: [], total: 0, complete: true }),
    labelFor: (value) => labels.get(String(value)) || '',
    rememberLabel: (id, label) => labels.set(String(id), label),
    fetchLabels: async (ids) => { calls.push(['labels', ids]); ids.forEach((id) => labels.set(String(id), `file ${id}`)); },
    fileFor: () => null
  };
  const uploader = {
    async upload(file, { onProgress }) { calls.push(['upload', file.name]); onProgress(5, 10); return { token: 'tk', duplicates }; },
    async cancel(token) { calls.push(['cancel', token]); },
    async register(token) { calls.push(['register', token]); return { rec_ID: '12', rec_Title: 'new.png', rec_Hash: 'abc123abc1' }; },
    async registerUrl(url) { calls.push(['url', url]); return { rec_ID: '13', rec_Title: url, rec_URL: url }; }
  };
  return { calls, source, uploader };
}

test('file input: upload with progress, then registration; the new file is the value', async () => {
  const { calls, source, uploader } = fileFakes();
  const changes = [];
  const apiClient = { buildUrl: (path) => `http://h/api/db${path}` };
  const input = createHInput('file', host(), { value: 7, source, uploader, apiClient, suppressLabel: true,
    onChange: (value) => changes.push(value) });
  assert.ok(input.uploadButton && input.urlButton, 'Upload and URL buttons');
  assert.equal(input.cancelButton.hidden, true, 'Cancel only while uploading');
  const id = await input.uploadFile({ name: 'new.png', size: 10 });
  assert.equal(id, 12);
  assert.equal(input.getValue(), 12);
  assert.deepEqual(calls.map((call) => call[0]), ['upload', 'register']);
  assert.equal(input.summary.href, 'http://h/api/db/files/abc123abc1/content', 'link to the new content endpoint');
  assert.equal(input.progress.hidden, true, 'progress hidden after the upload');
});

test('file input: the same content registered already - use it (upload cancelled) or upload anyway', async () => {
  let fakes = fileFakes({ duplicates: [9] });
  let input = createHInput('file', host(), { value: null, source: fakes.source, uploader: fakes.uploader, suppressLabel: true,
    confirmDuplicate: async (ids) => (ids[0] === 9 ? 'existing' : null) });
  assert.equal(await input.uploadFile({ name: 'a.png', size: 10 }), 9);
  assert.equal(input.getValue(), 9);
  assert.deepEqual(fakes.calls.slice(0, 2), [['upload', 'a.png'], ['cancel', 'tk']]);
  fakes = fileFakes({ duplicates: [9] });
  input = createHInput('file', host(), { value: null, source: fakes.source, uploader: fakes.uploader, suppressLabel: true,
    confirmDuplicate: async () => 'upload' });
  assert.equal(await input.uploadFile({ name: 'a.png', size: 10 }), 12);
  assert.ok(fakes.calls.some((call) => call[0] === 'register'));
});

test('file input: register a URL; read-only hides the buttons', async () => {
  const { calls, source, uploader } = fileFakes();
  const input = createHInput('file', host(), { value: null, source, uploader, suppressLabel: true,
    askUrl: async () => 'https://x.org/a.jpg', editFile: async () => ({ saved: false }) });
  await input._askUrl();
  assert.deepEqual(calls.at(-1), ['url', 'https://x.org/a.jpg']);
  assert.equal(input.getValue(), 13);
  assert.equal(input.editButton.hidden, false, 'Edit with a value');
  input.setReadOnly(true);
  assert.equal(input.uploadButton.hidden, true);
  assert.equal(input.editButton.hidden, true);
  assert.equal(await input.uploadFile({ name: 'x.png', size: 1 }), null, 'no upload when read-only');
});

test('file input: Upload and URL only without a file (plan 21)', () => {
  const { source, uploader } = fileFakes();
  const input = createHInput('file', host(), { value: 7, source, uploader, suppressLabel: true });
  assert.equal(input.uploadButton.hidden, true, 'a file is chosen');
  assert.equal(input.urlButton.hidden, true);
  input.setValue(null);
  assert.equal(input.uploadButton.hidden, false, 'no file');
  assert.equal(input.urlButton.hidden, false);
});

test('file input: with the host record manager the file is chosen there, not in a picker (plan 21)', async () => {
  const { calls, source, uploader } = fileFakes();
  const asked = [];
  const changes = [];
  const input = createHInput('file', host(), { value: null, source, uploader, suppressLabel: true, fileRecordType: 126,
    browseRecords: async (options) => { asked.push(options); return [21]; }, onChange: (value) => changes.push(value) });
  assert.equal(input.combo, undefined, 'no value picker');
  assert.ok(input.browseButton);
  assert.equal(input.browseText.textContent, 'Select file…');
  input.browseButton.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(asked, [{ recordTypes: [126], selectMode: 'select', allowAddition: false }]);
  assert.equal(input.getValue(), 21);
  assert.ok(calls.some((call) => call[0] === 'labels'), 'the file name is fetched');
  assert.equal(input.browseText.textContent, 'file 21');
  assert.equal(input.uploadButton.hidden, true);
  // without the file record type (or the host function): the value picker
  const picker = createHInput('file', host(), { value: null, source, uploader, suppressLabel: true, browseRecords: async () => [] });
  assert.ok(picker.combo);
});

test('pointer input: Edit / View after the control box, before the value tools (plan 21)', () => {
  const source = { load: async () => ({ items: [], total: 0, complete: true }), labelFor: () => 'Record 5', fetchLabels: async () => {}, rememberLabel: () => {} };
  const input = createHInput('resource', host(), { value: 5, source, suppressLabel: true, valueTools: true,
    editRecord: async () => ({}), viewRecord: () => {} });
  const wrap = input.container.querySelector('.h-form-input-control-wrap');
  const actions = input.container.querySelector('.h-input-resource-actions');
  assert.equal(wrap.querySelector('.h-input-resource-actions'), null, 'not inside the control box');
  const row = wrap.parentElement.children;
  assert.equal(row.indexOf(actions), row.indexOf(wrap) + 1, 'right after it');
  assert.ok(row.indexOf(input.clearButton) > row.indexOf(actions), 'value tools after Edit / View');
});

test('a special field shows a readable value, the raw text on request and its editor', async () => {
  const { HEditField } = await import('../src/widgets/edit-form/HEditField.js');
  const values = { 1174: '{"groups":[]}' };
  const field = new HEditField().attach(host(), {
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
  const input = field.container.querySelector('.h-edit-field-input');
  assert.equal(input.hidden, true, 'raw text hidden at first');
  // Edit, Show raw, clear, visibility (2026-10-18)
  const [edit, raw, clear, eye] = field.container.querySelector('.h-edit-field-special-buttons').children;
  assert.ok(edit.classList.contains('h-edit-field-special-edit'));
  assert.ok(clear.classList.contains('h-form-input-clear'));
  assert.ok(eye.classList.contains('h-form-input-visibility'));
  assert.equal(clear.hidden, false, 'clear shown for a value');
  assert.equal(eye.hidden, false, 'visibility shown for a value');
  raw.click();
  assert.equal(input.hidden, false, 'Show raw shows the text');
  edit.click();
  await flush();
  assert.equal(field.getValue(), '[{"name":"Places"}]');
  assert.equal(row.summary.textContent, 'Places');
  assert.equal(values[1174], '{}', 'the editor may change another field');
  eye.click();
  assert.equal(field.getState().values[0].hidden, true, 'the eye hides the value from the public');
  row.input.setValue('not json');
  assert.deepEqual(field.validate(), ['The raw value is not valid JSON']);
  clear.click();
  assert.equal(field.getValue(), null, 'clear empties the value');
  assert.equal(clear.hidden, true, 'no clear without a value');
  assert.equal(eye.hidden, true, 'no visibility without a value');
  await field.destroy();
});

test('a hidden special field (filter form of a query) is not shown but saved', async () => {
  const { editor } = await openEditor({ specialEditors: { 12: { json: false, hidden: true } } });
  assert.equal(editor.editForm.getFieldWidget(12).container.hidden, true);
  assert.deepEqual(editor.getRecord().details[12], ['t:10'], 'the value is in the record body');
  await editor.destroy();
});
