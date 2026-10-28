/**
 * @file fileEditor.test.js
 * @brief Editor of a registered file (plan 20, §10.11): the hard-coded structure by file
 *        type (systemEntities.js), HInputFile in replace mode and HRecordEditor with a
 *        hard-coded structure (rec_URL header, new content token, summary sections).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from './helpers/fakeDom.js';

const document = installFakeDom();
globalThis.Node ??= globalThis.HTMLElement;
const { fileEditStructure, registeredFileType, formatFileSize } = await import('../src/data/systemEntities.js');
const { HRecordEditor } = await import('../src/widgets/record-editor/HRecordEditor.js');
const { createHInput } = await import('../src/widgets/form/inputs/createHInput.js');
const { registerNewFile } = await import('../src/widgets/form/inputs/fileRegistration.js');

const host = () => { const element = document.createElement('div'); document.body.append(element); return element; };
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Local ids of a test database: fields, vocabularies, the file record type. */
const LOCAL = {
  'dty:2-1186': 501, 'dty:2-1185': 502, 'dty:2-67': 67, 'dty:2-29': 29, 'dty:2-1': 1, 'dty:2-4': 4,
  'dty:2-35': 35, 'dty:2-1188': 503, 'trm:2-10448': 900, 'trm:2-533': 3328, 'rty:2-1106': 120
};
const TYPE_TERMS = { 901: '2-10449', 902: '2-10450', 903: '2-10451', 904: '2-10452', 905: '2-10453' };
const dbdefs = {
  localId: (kind, code) => LOCAL[`${kind}:${code}`] || 0,
  conceptId: (kind, id) => (kind === 'trm' ? TYPE_TERMS[id] || `0-${id}` : `0-${id}`),
  dbconst: (name) => ({ RT_REGISTERED_FILE: 120, DT_NAME: 1 })[name] ?? null,
  rectypeName: () => 'Registered file',
  groups: () => [],
  users: () => [{ id: 2, name: 'Owner' }],
  userGroupName: (id) => ({ 2: 'Owner' })[id] || '',
  currentUserId: () => 2,
  languages: () => ['ENG'],
  termLabel: (id) => ({ 901: 'local', 902: 'external', 3335: 'image/png' })[id] || '',
  termChildren: (id) => ({ 900: [901, 902, 903, 904, 905], 3328: [3335] })[id] || [],
  term: (id) => ({ internalid: id, term: dbdefs.termLabel(id), code: '', conceptid: '', desc: '' })
};

const fileRecord = (type, extra = {}) => ({
  rec_ID: '15', rec_RecTypeID: '120', rec_Title: 'map.png', rec_OwnerUGrpID: '2', rec_NonOwnerVisibility: 'public',
  rec_Modified: '2026-10-23 10:00:00', rec_Hash: 'abc123', rec_URL: extra.url ?? null,
  details: { 501: [String(type)], 502: ['map.png'], 67: ['2048'], 29: ['3335'], 1: ['Map'] }
});
const fileUrls = { download: (key) => `http://h/?db=t&download=1&file=${key}` };
const names = (structure) => structure.groups.flatMap((group) => group.children).map((field) => field.name ?? String(field.dty));
const field = (structure, name) => structure.groups.flatMap((group) => group.children).find((item) => (item.name ?? item.key) === name);

test('file structure: the fields of a local file; the type, name, size and file type are read only', () => {
  const structure = fileEditStructure(fileRecord(901), dbdefs, { fileUrls });
  assert.equal(structure.fileType, 'local');
  assert.deepEqual(names(structure), ['501', 'upload', 'downloadUrl', '502', 'size', '29', '1', '4', '35', '503']);
  assert.equal(field(structure, 'type').readOnly, true);
  assert.equal(field(structure, 'fileType').readOnly, true);
  assert.equal(field(structure, 'fileType').req, 'optional', 'a read-only field does not stop a save');
  assert.equal(field(structure, 'downloadUrl').value, 'http://h/?db=t&download=1&file=abc123');
  assert.equal(field(structure, 'size').value, '2.0 KB');
  assert.equal(field(structure, 'upload').replace, true);
  assert.equal(field(structure, 'upload').file.ulf_ObfuscatedFileID, 'abc123');
});

test('file structure: tiled, external and iiif files', () => {
  const tiled = fileEditStructure(fileRecord(905), dbdefs);
  assert.deepEqual(names(tiled), ['501', 'upload', '29', '1', '4', '35', '503']);
  assert.equal(field(tiled, 'fileType').readOnly, undefined, 'file type of a tiled image is edited');
  assert.equal(field(tiled, 'fileType').req, 'required');
  const external = fileEditStructure(fileRecord(902, { url: 'https://x.org/a.pdf' }), dbdefs);
  assert.deepEqual(names(external), ['501', 'url', '29', '1', '4', '35', '503']);
  assert.equal(field(external, 'url').header, 'rec_URL');
  assert.equal(field(external, 'url').req, 'required');
  const iiif = fileEditStructure(fileRecord(904, { url: 'https://x.org/manifest.json' }), dbdefs);
  assert.deepEqual(names(iiif), ['501', 'url', 'mimeJson', '1', '4', '35', '503']);
  assert.equal(field(iiif, 'mimeJson').value, 'json');
  assert.equal(registeredFileType({ rec_URL: 'https://x.org', details: {} }, dbdefs), 'external', 'no type: a URL without a name');
  assert.equal(formatFileSize(3 * 1024 * 1024), '3.0 MB');
});

test('file input, replace mode: the upload is not registered; its token is the value; Keep the current file cancels it', async () => {
  const calls = [];
  const uploader = {
    async upload(file) { calls.push(['upload', file.name]); return { token: 'tk1', duplicates: [12] }; },
    async cancel(token) { calls.push(['cancel', token]); },
    async register() { calls.push(['register']); return {}; }
  };
  const changes = [];
  const element = host();
  element.addEventListener('h-input-change', (event) => changes.push(event.detail.value));
  const input = createHInput('file', element, {
    replace: true, uploader, suppressLabel: true,
    file: { ulf_ID: 15, ulf_OrigFileName: 'map.png', ulf_ObfuscatedFileID: 'abc123' }
  });
  assert.equal(input.getValue(), null);
  assert.equal(input.nameText.textContent, 'map.png', 'the current file');
  assert.equal(input.uploadButton.hidden, false);
  assert.equal(input.urlButton.hidden, true, 'no URL in replace mode');
  assert.equal(input.keepButton.hidden, true);
  assert.equal(await input.uploadFile({ name: 'new.png', size: 2048 }), 'tk1');
  assert.deepEqual(calls, [['upload', 'new.png']], 'no registration, no duplicates question');
  assert.equal(input.getValue(), 'tk1');
  assert.match(input.nameText.textContent, /new\.png \(2\.0 KB\)/);
  assert.equal(input.keepButton.hidden, false);
  input.keepButton.click();
  await flush();
  assert.deepEqual(calls.at(-1), ['cancel', 'tk1']);
  assert.equal(input.getValue(), null);
  assert.equal(input.nameText.textContent, 'map.png');
  assert.deepEqual(changes, ['tk1', null]);
});

/** HRecordEditor of a file over a fake client. */
async function openFileEditor(record, { linked = { records: [], total: 0 } } = {}) {
  const calls = [];
  const client = {
    async load() { return { record: structuredClone(record), meta: {} }; },
    async update(body) { calls.push(['update', body]); return { record: { ...structuredClone(record), rec_URL: body.rec_URL ?? record.rec_URL }, issues: [] }; }
  };
  const element = host();
  const editor = new HRecordEditor().attach(element, {
    apiClient: { get: async () => ({ records: [] }), request: async () => ({}) },
    dbdefs,
    client,
    recordId: 15,
    structure: (loaded) => fileEditStructure(loaded, dbdefs, { fileUrls }),
    structurePane: false,
    summarySections: ['admin', 'linked'],
    linkedRecords: async () => linked,
    preview: (loaded) => {
      const element = document.createElement('div');
      element.className = 'test-preview';
      element.textContent = loaded.rec_Hash;
      return element;
    },
    onOpenRecord: (id) => calls.push(['open', id])
  });
  await editor.open();
  await flush();
  return { editor, element, calls };
}

test('file editor: the summary has Admin and Linked records only, no Structure pane; the referring records are listed', async () => {
  const { editor, element, calls } = await openFileEditor(fileRecord(901), {
    linked: { records: [{ rec_ID: '81', rec_Title: 'A <b>map</b>', rec_RecTypeID: '5' }], total: 3 }
  });
  const sections = editor.summary.querySelectorAll('summary').map((item) => item.textContent);
  assert.deepEqual(sections, ['Admin', 'Linked records']);
  assert.equal(editor.structureHost, undefined, 'no Structure pane');
  await flush();
  const list = element.querySelector('.h-record-editor-linked-list');
  assert.ok(list, 'the list of referring records');
  const link = list.querySelector('a');
  assert.equal(link.textContent, 'A map');
  link.click();
  assert.deepEqual(calls.at(-1), ['open', 81]);
  assert.match(list.parentElement.textContent, /2 more/);
  await editor.destroy();
});

test('file editor: rec_URL is a header of the record; the new content goes as upload; shown values are not sent', async () => {
  const { editor } = await openFileEditor(fileRecord(902, { url: 'https://x.org/a.pdf' }));
  const body = editor.getRecord();
  assert.equal(body.rec_URL, 'https://x.org/a.pdf');
  assert.equal(body.upload, undefined);
  assert.equal('url' in body.details || 'null' in body.details, false, 'named fields are not details');
  await editor.destroy();

  const local = await openFileEditor(fileRecord(901));
  local.editor.editForm.getFieldWidget('upload')._rows[0].input.setValue('tk9');
  const sent = local.editor.getRecord();
  assert.equal(sent.upload, 'tk9');
  assert.equal(sent.downloadUrl, undefined);
  assert.equal(sent.size, undefined, 'the formatted size is not sent');
  await local.editor.destroy();
});

test('file editor: the preview of the file is below the form', async () => {
  const { editor, element } = await openFileEditor(fileRecord(902, { url: 'https://x.org/a.pdf' }));
  const box = element.querySelector('.h-record-editor-preview');
  assert.ok(box, 'a preview area');
  assert.equal(box.querySelector('.test-preview').textContent, 'abc123');
  await editor.destroy();
});

test('URL input: the icon after it opens an http(s) address only', () => {
  const input = createHInput('freetext', host(), { inputType: 'url', value: 'https://x.org/a.pdf', suppressLabel: true });
  assert.equal(input.link.hidden, false);
  assert.equal(input.link.href, 'https://x.org/a.pdf');
  assert.equal(input.link.target, '_blank');
  input.setValue('not a link');
  assert.equal(input.link.hidden, true);
  assert.equal(createHInput('freetext', host(), { suppressLabel: true }).link, undefined, 'plain text: no icon');
});

test('registerNewFile: URL, upload (the registered file of the same content), tile stack', async () => {
  const calls = [];
  const uploader = {
    async upload(file) { calls.push(['upload', file.name]); return { token: 't1', duplicates: file.name === 'same.png' ? [44] : [] }; },
    async cancel(token) { calls.push(['cancel', token]); },
    async register(token, { details }) { calls.push(['register', token, details]); return { rec_ID: '50' }; },
    async registerUrl(url) { calls.push(['url', url]); return { rec_ID: '51', meta: {} }; }
  };
  const progress = () => ({ signal: null, update: () => {}, close: () => {} });
  const services = { uploader, dbdefs, progress, askUrl: async () => 'https://x.org/manifest.json' };
  assert.deepEqual(await registerNewFile('url', services), { saved: true, recordId: 51 });
  assert.deepEqual(await registerNewFile('upload', { ...services, chooseFile: async () => ({ name: 'same.png', size: 5 }),
    confirmDuplicate: async () => 'existing' }), { saved: true, recordId: 44 });
  assert.deepEqual(calls.at(-1), ['cancel', 't1'], 'the upload of the same content goes');
  assert.deepEqual(await registerNewFile('tiled', { ...services, chooseFile: async (accept) => {
    calls.push(['accept', accept]);
    return { name: 'tiles.zip', size: 9 };
  } }), { saved: true, recordId: 50 });
  assert.deepEqual(calls.slice(-3), [['accept', '.zip,.mbtiles'], ['upload', 'tiles.zip'], ['register', 't1', { 501: ['tiled'] }]]);
  assert.deepEqual(await registerNewFile('upload', { ...services, chooseFile: async () => null }), { saved: false, recordId: 0 });
});
