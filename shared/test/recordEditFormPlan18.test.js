/**
 * @file recordEditFormPlan18.test.js
 * @brief Record edit form cosmetics, layout options and Record summary (plan 18).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from './helpers/fakeDom.js';

const document = installFakeDom();
globalThis.Node ??= globalThis.HTMLElement;
const { HRecordEditor } = await import('../src/widgets/record-editor/HRecordEditor.js');
const { isSmallFlatVocabulary } = await import('../src/widgets/edit-form/HEditField.js');
const { nonStandardGroup } = await import('../src/data/recordEditStructure.js');
const { applyFormLayout } = await import('../src/widgets/form/formLayout.js');

const STRUCTURE = {
  rty: 29,
  groups: [{ id: 57, type: 'group', label: 'Main', help: '', children: [
    { dty: 1, type: 'freetext', label: 'Title', help: '', req: 'required', max: 1, default: '' },
    { dty: 1105, type: 'freetext', label: 'Notes', help: '', req: 'recommended', max: 0, default: '' },
    { dty: 32, type: 'integer', label: 'Zoom', help: '', req: 'optional', max: 1, default: '' }
  ] }]
};

const RECORD = {
  rec_ID: '7', rec_RecTypeID: '29', rec_Title: 'Main', rec_OwnerUGrpID: '2', rec_NonOwnerVisibility: 'viewable',
  rec_NonOwnerVisibilityGroups: [], rec_EditGroups: [], rec_Modified: '2026-10-12 10:00:00',
  rec_Added: '2026-10-01 09:00:00', rec_AddedByUGrpID: '2', rec_ScratchPad: 'note',
  details: { 1: ['Main'], 1105: ['a', 'b'], 32: ['5'], 77: ['kept'] }
};

const dbdefs = {
  dbconst: () => null,
  rectypeName: () => 'Query Data Source',
  groups: () => [],
  users: () => [{ id: 2, name: 'Owner' }],
  userGroupName: (id) => ({ 2: 'Owner' })[id] || '',
  currentUserId: () => 2,
  languages: () => [],
  fieldGlobal: (id) => (Number(id) === 77 ? { id: 77, name: 'Old field', type: 'freetext' } : null)
};

async function openEditor(options = {}) {
  const client = {
    async load() { return { record: structuredClone(RECORD), meta: {} }; },
    async update(body) { return { record: body, issues: [] }; }
  };
  const element = document.createElement('div');
  document.body.append(element);
  const editor = new HRecordEditor().attach(element, {
    apiClient: { get: async () => ({ records: [] }) },
    dbdefs, client, structureProvider: { async editStructure() { return STRUCTURE; } }, recordId: 7, ...options
  });
  await editor.open();
  return { editor, element };
}

test('one remove icon: deletes a value of a repeatable field, clears the last one', async () => {
  const { editor } = await openEditor();
  const notes = editor.editForm.getFieldWidget(1105);
  assert.equal(notes._rows[0].removeButton.title, 'Remove this value');
  notes._rows[0].removeButton.click();
  assert.equal(notes._rows.length, 1);
  assert.equal(notes._rows[0].removeButton.title, 'Clear the value');
  const zoom = editor.editForm.getFieldWidget(32);
  assert.ok(zoom._rows[0].removeButton, 'a single-value field has the icon too');
  zoom._rows[0].removeButton.click();
  assert.deepEqual(editor.getRecord().details[32] ?? [], [], 'cleared');
  await editor.destroy();
});

test('labels by requirement; eye icon; Add right after the label', async () => {
  const { editor } = await openEditor();
  assert.ok(editor.editForm.getFieldWidget(1).container.classList.contains('is-required'));
  assert.ok(editor.editForm.getFieldWidget(1105).container.classList.contains('is-recommended'));
  const row = editor.editForm.getFieldWidget(1105)._rows[0];
  assert.equal(row.hiddenButton.children[0].className, 'fa-solid fa-eye');
  row.hiddenButton.click();
  assert.equal(row.hiddenButton.children[0].className, 'fa-solid fa-eye-slash');
  await editor.destroy();
});

test('values outside the structure: last group "Non-standard fields", kept on save', async () => {
  const { editor } = await openEditor();
  const groups = editor.structure.groups;
  assert.equal(groups.at(-1).label, 'Non-standard fields');
  assert.equal(groups.at(-1).children[0].label, 'Old field');
  assert.ok(editor.editForm.getFieldWidget(77), 'editable');
  assert.deepEqual(editor.getRecord().details[77], ['kept']);
  assert.equal(STRUCTURE.groups.length, 1, 'the cached structure is not changed');
  assert.equal(nonStandardGroup({ details: { 1: ['x'] } }, STRUCTURE, dbdefs), null);
  await editor.destroy();
});

test('editor settings (plan 25): "Non-standard fields" off: no group, the values still saved', async () => {
  const { editor } = await openEditor({ settings: { nonStandardFields: false, showHelp: false } });
  assert.equal(editor.structure.groups.some((group) => group.nonStandard), false);
  assert.equal(editor.editForm.getFieldWidget(77), null);
  assert.deepEqual(editor.getRecord().details[77], ['kept'], 'kept on save');
  assert.equal(editor._fieldHelpShown(), false, 'Show help from the settings');
  await editor.destroy();
});

test('Record summary: Admin, Private, Tags, Linked records, Scratchpad; scratchpad saved', async () => {
  const { editor, element } = await openEditor();
  const titles = editor.summary.querySelectorAll('summary').map((item) => item.textContent);
  assert.deepEqual(titles, ['Admin', 'Private', 'Tags', 'Linked records', 'Scratchpad']);
  assert.ok(editor.summary.querySelector('.h-record-editor-ownership'), 'owner and access in Admin');
  assert.match(editor.summary.querySelector('.h-record-editor-admin-info').textContent, /Owner/);
  editor.scratchpad.value = 'changed';
  assert.equal(editor.getRecord().rec_ScratchPad, 'changed');
  assert.equal(editor.isDirty(), true);
  editor.summaryToggle.click();
  assert.equal(editor.cardinal.state.east.collapsed, true);
  await editor.destroy();
});

test('radios for a few terms without hierarchy; form layout classes', () => {
  assert.equal(isSmallFlatVocabulary([{ depth: 0 }, { depth: 0 }]), true);
  assert.equal(isSmallFlatVocabulary(Array.from({ length: 6 }, () => ({ depth: 0 }))), false);
  assert.equal(isSmallFlatVocabulary([{ depth: 0 }, { depth: 1 }]), false);
  const root = document.createElement('div');
  assert.deepEqual(applyFormLayout(root, { labelPos: 'inline', inputPos: 'flow' }), { labelPos: 'inline', inputPos: 'flow' });
  assert.ok(root.classList.contains('h-form-labels-inline') && root.classList.contains('h-form-inputs-flow'));
  applyFormLayout(root, { labelPos: 'sideways' });
  assert.ok(root.classList.contains('h-form-labels-auto') && !root.classList.contains('h-form-labels-inline'));
});

test('value tools are HInput options: remove event, visibility switch, actions slot', async () => {
  const { createHInput } = await import('../src/widgets/form/inputs/createHInput.js');
  const host = document.createElement('div');
  document.body.append(host);
  const input = createHInput('freetext', host, {
    value: 'a', suppressLabel: true, valueTools: true, visibilityToggle: true, valueHidden: false
  });
  assert.equal(input.clearButton.title, 'Clear the value');
  input.clearButton.click();
  assert.equal(input.getValue() ?? '', '', 'not removable: clears');
  const events = [];
  host.addEventListener('h-input-remove', () => events.push('remove'));
  host.addEventListener('h-input-visibility-change', (event) => events.push(`hidden:${event.detail.hidden}`));
  input.setRemovable(true);
  assert.equal(input.clearButton.title, 'Remove this value');
  input.clearButton.click();
  input.visibilityButton.click();
  assert.deepEqual(events, ['remove', 'hidden:true']);
  assert.equal(input.isValueHidden(), true);
  const add = document.createElement('button');
  input.setActions([add]);
  assert.equal(add.parentElement, input.actionsHost);
});

test('the visibility switch is shown only for a value, as the clear action (2026-10-18)', async () => {
  const { createHInput } = await import('../src/widgets/form/inputs/createHInput.js');
  const host = document.createElement('div');
  document.body.append(host);
  const input = createHInput('freetext', host, {
    value: 'a', suppressLabel: true, valueTools: true, visibilityToggle: true
  });
  assert.equal(input.visibilityButton.hidden, false);
  input.clearButton.click();
  assert.equal(input.clearButton.hidden, true);
  assert.equal(input.visibilityButton.hidden, true, 'no value: no visibility switch');
  input.control.value = 'b';
  input.notifyChange();
  assert.equal(input.visibilityButton.hidden, false);
});

test('Add / Translate in front of the first value only; no duplicate clear button', async () => {
  const { editor } = await openEditor();
  const notes = editor.editForm.getFieldWidget(1105);
  const first = () => notes._rows[0].input.actionsHost;
  assert.equal(notes.addButton.parentElement, first());
  notes.addButton.click();
  assert.equal(notes.addButton.parentElement, first(), 'stays at the first value (2026-10-17)');
  assert.equal(notes._rows.at(-1).input.actionsHost.children.length, 0, 'the other values keep an empty place');
  assert.ok(notes.container.classList.contains('has-actions'));
  for (const row of notes._rows) {
    const clears = [...row.element.querySelectorAll('.h-form-input-clear')];
    assert.equal(clears.length, 1, 'one clear / remove icon per value');
  }
  await editor.destroy();
});

test('Drop changes shows the saved values again; languages from the database setting', async () => {
  const { editor } = await openEditor();
  editor.editForm.getFieldWidget(32)._rows[0].input.setValue('99');
  assert.equal(editor.isDirty(), true);
  const { HMsg } = await import('../src/ui/HMsg.js');
  const show = HMsg.showMsgDlg;
  const close = HMsg.closeMsgDlg;
  // the confirmation is answered Yes
  HMsg.showMsgDlg = (_message, options) => { queueMicrotask(() => options.buttons[0].onClick()); return null; };
  HMsg.closeMsgDlg = () => {};
  try {
    assert.equal(await editor.dropChanges(), true);
  } finally {
    HMsg.showMsgDlg = show;
    HMsg.closeMsgDlg = close;
  }
  assert.deepEqual(editor.getRecord().details[32], ['5']);
  assert.equal(editor.isDirty(), false);
  const { HDbDefs } = await import('../src/data/HDbDefs.js');
  const defs = Object.create(HDbDefs.prototype);
  defs.meta = { languages: ['IND'], translationLanguages: ['ENG', 'FRE'] };
  assert.deepEqual(defs.translationLanguages(), ['ENG', 'FRE']);
  defs.meta = { languages: ['IND'] };
  assert.deepEqual(defs.translationLanguages(), ['IND']);
  await editor.destroy();
});
