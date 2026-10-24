/**
 * @file relmarker.test.js
 * @brief Relationship marker fields (plan 22): relationships given to the fields,
 *        reverse fields, the body of a new relationship, HInputRelmarker (Add button,
 *        the relationship row, delete after a warning), the popup form and the own
 *        buttons of openEditFormDialog.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom, flush } from './helpers/fakeDom.js';

const document = installFakeDom();
globalThis.Node ??= globalThis.HTMLElement;
const { loadRelmarkerStates, relationFits, relationshipBody } = await import('../src/data/relmarkerRelations.js');
const { relationRecordStructure, reverseRelmarkerGroup } = await import('../src/data/recordEditStructure.js');
const { createHInput } = await import('../src/widgets/form/inputs/createHInput.js');
const { relationshipForm, relationshipDialogTitle } = await import('../src/widgets/relationship/relationshipDialog.js');
const { openEditFormDialog } = await import('../src/widgets/edit-form/editFormDialog.js');
const { HEditField } = await import('../src/widgets/edit-form/HEditField.js');
const { HMsg } = await import('../src/ui/HMsg.js');

/** Definitions: RT 1 relationship (5 target, 6 type, 7 source), Person 10, Organisation 4. */
const dbdefs = {
  localId: (kind, code) => ({ 'rty:2-1': 1, 'dty:2-5': 5, 'dty:2-6': 6, 'dty:2-7': 7 })[`${kind}:${code}`] || 0,
  dbconst: (name) => ({ RT_RELATION: 1 })[name] ?? null,
  termDescendants: (roots) => roots.flatMap((root) => ({ 100: [100, 101, 102], 200: [200, 201] })[root] || [root]),
  termLabel: (id) => ({ 101: 'parent of', 102: 'child of', 201: 'member of' })[id] || '',
  termInverse: (id) => ({ 101: 102, 102: 101 })[id] || 0,
  rectypeName: (id) => ({ 1: 'Relationship', 4: 'Organisation', 10: 'Person' })[id] || '',
  fieldName: (rty, dty) => ({ '1:5': 'Target record', '1:6': 'Relationship type', '1:7': 'Source record', '4:300': 'Members' })[`${rty}:${dty}`] || '',
  linkedRectypes: (rty, options) => (rty === 10 && options.direction === 'from' && options.relation ? [4] : []),
  pointerFieldsBetween: (from, to) => (from === 4 && to === 10 ? [300, 301] : []),
  fieldType: (_rty, dty) => ({ 300: 'relmarker', 301: 'resource' })[dty] || '',
  fieldGlobal: (dty) => ({ 300: { name: 'Members', vocabulary: 200, concept: '2-300' } })[dty] || null,
  vocabRoot: (dty) => ({ 300: 200 })[dty] || 0
};

/** A relationship row of `/records` (resolved). */
function relRow(id, [source, sourceRty, sourceTitle], term, [target, targetRty, targetTitle]) {
  return {
    rec_ID: String(id),
    rec_RecTypeID: '1',
    details: {
      7: [{ rec_ID: String(source), rec_RecTypeID: String(sourceRty), rec_Title: sourceTitle }],
      6: [{ trm_ID: String(term), trm_Label: dbdefs.termLabel(term) }],
      5: [{ rec_ID: String(target), rec_RecTypeID: String(targetRty), rec_Title: targetTitle }]
    }
  };
}

const OUTGOING = [
  relRow(900, [151, 10, 'Peter'], 101, [152, 10, '<b>Anna</b>']),
  relRow(901, [151, 10, 'Peter'], 101, [50, 4, 'Org']) // target type not allowed
];
const INCOMING = [
  relRow(902, [60, 4, 'ACME'], 201, [151, 10, 'Peter']),
  relRow(903, [152, 10, 'Anna'], 101, [151, 10, 'Peter'])
];

/** API client: relationships by source (f:7) or target (f:5), or one by id. */
function apiClient(calls = []) {
  return {
    async get(path, { query }) {
      calls.push(query);
      const predicate = query.q[1];
      if (predicate['f:7']) return { records: OUTGOING };
      if (predicate['f:5']) return { records: INCOMING };
      return { records: [...OUTGOING, ...INCOMING].filter((row) => row.rec_ID === predicate.ids) };
    }
  };
}

const PERSONS = { name: '235', dty: 235, type: 'relmarker', label: 'Related persons', vocabulary: 100, targetTypes: [10] };
const PERSONS_REVERSE = { name: 'rev:235', type: 'relmarker', reverse: true, vocabulary: 100, sourceTypes: [10], targetTypes: [10] };
const MEMBERS_REVERSE = { name: 'rev:300', type: 'relmarker', reverse: true, vocabulary: 200, sourceTypes: [4], targetTypes: [10] };

test('relationships go to the first field that fits; reverse ones show the inverse type', async () => {
  const calls = [];
  const states = await loadRelmarkerStates({
    apiClient: apiClient(calls), dbdefs, recordId: 151, fields: [PERSONS, MEMBERS_REVERSE, PERSONS_REVERSE]
  });
  assert.equal(calls.length, 2, 'two searches');
  assert.deepEqual(calls[0].q[0], { t: '1' });
  const relations = (name) => states.get(name).values.map((entry) => entry.relation);
  assert.deepEqual(relations('235'), [{ relId: 900, term: 101, termLabel: 'parent of', reverse: false, other: { id: 152, title: 'Anna', rty: 10 } }]);
  assert.deepEqual(relations('rev:300').map((relation) => [relation.relId, relation.termLabel, relation.other.title]), [[902, 'member of', 'ACME']]);
  assert.deepEqual(relations('rev:235').map((relation) => [relation.relId, relation.termLabel, relation.reverse]), [[903, 'child of', true]]);
  assert.equal(states.get('235').values[0].value, 900);
  assert.equal(relationFits(PERSONS, { reverse: false, term: 101, other: { rty: 4 } }, dbdefs), false, 'target type');
  assert.equal(relationFits(PERSONS, { reverse: false, term: 201, other: { rty: 10 } }, dbdefs), false, 'vocabulary');
  assert.equal(relationFits(PERSONS, { reverse: true, term: 101, other: { rty: 10 } }, dbdefs), false, 'direction');
});

test('more relationships than loaded: onPartial reports loaded and total (plan 23)', async () => {
  const reports = [];
  const client = {
    async get(path, { query }) {
      const predicate = query.q[1];
      if (predicate['f:7']) return { records: OUTGOING, pagination: { total: 700 } };
      return { records: INCOMING, pagination: { total: INCOMING.length } };
    }
  };
  await loadRelmarkerStates({
    apiClient: client, dbdefs, recordId: 151, fields: [PERSONS], onPartial: (loaded, total) => reports.push([loaded, total])
  });
  assert.deepEqual(reports, [[OUTGOING.length + INCOMING.length, 700 + INCOMING.length]]);

  const none = [];
  await loadRelmarkerStates({ apiClient: apiClient(), dbdefs, recordId: 151, fields: [PERSONS], onPartial: () => none.push(1) });
  assert.deepEqual(none, [], 'everything loaded: no report');
});

test('reverse fields: relmarker fields of other record types that target this one', () => {
  const group = reverseRelmarkerGroup(10, dbdefs, 'From others');
  assert.equal(group.label, 'From others');
  assert.deepEqual(group.children.map((field) => [field.name, field.label, field.reverse, field.dty, field.vocabulary]),
    [['rev:300', 'Members ← Organisation', true, null, 200]]);
  assert.deepEqual(group.children[0].sourceTypes, [4]);
  assert.equal(reverseRelmarkerGroup(4, dbdefs), null);
});

test('relationship record: constraints of the relmarker field, else type / source / target read only', () => {
  const fields = [
    { dty: 6, type: 'relationtype', vocabulary: 999 },
    { dty: 7, type: 'resource', targetTypes: [] },
    { dty: 5, type: 'resource', targetTypes: [] },
    { dty: 8, type: 'freetext' }
  ];
  const structure = { rty: 1, groups: [{ id: null, type: 'group', children: fields }] };
  const shown = (result) => result.groups[0].children.map((field) => [field.dty, field.readOnly === true, field.vocabulary ?? null, field.targetTypes ?? null]);
  assert.deepEqual(shown(relationRecordStructure(structure, dbdefs, null)), [
    [6, true, 999, null], [7, true, null, []], [5, true, null, []], [8, false, null, null]
  ]);
  assert.deepEqual(shown(relationRecordStructure(structure, dbdefs, { vocabulary: 100, targetTypes: [10], reverse: false })), [
    [6, false, 100, null], [7, true, null, []], [5, false, null, [10]], [8, false, null, null]
  ]);
  assert.deepEqual(shown(relationRecordStructure(structure, dbdefs, { vocabulary: 200, targetTypes: [4], reverse: true })), [
    [6, false, 200, null], [7, false, null, [4]], [5, true, null, []], [8, false, null, null]
  ]);
  assert.equal(fields[0].readOnly, undefined, 'the cached structure is not changed');
  const person = { rty: 10, groups: [] };
  assert.equal(relationRecordStructure(person, dbdefs, null), person, 'other record types');
});

test('a new relationship record has the owner and visibility of the edited record', () => {
  const body = relationshipBody(dbdefs, { source: 151, target: 152, term: 101, header: { owner: 2, visibility: 'viewable', viewGroups: [5] } });
  assert.deepEqual(body, {
    rec_ID: '0',
    rec_RecTypeID: '1',
    rec_OwnerUGrpID: '2',
    rec_NonOwnerVisibility: 'viewable',
    rec_NonOwnerVisibilityGroups: ['5'],
    details: { 7: ['151'], 6: ['101'], 5: ['152'] }
  });
  assert.equal('rec_OwnerUGrpID' in relationshipBody(dbdefs, { source: 1, target: 2, term: 3 }), false, 'server default');
});

/** HInputRelmarker with value tools, as HEditField makes it. */
function relmarkerInput(options = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  return createHInput('relmarker', host, {
    suppressLabel: true,
    valueTools: true,
    visibilityToggle: false,
    field: PERSONS,
    dbdefs,
    iconBase: { baseUrl: 'http://host/heurist/', database: 'db' },
    editRecord: async () => ({ saved: false }),
    viewRecord: () => {},
    ...options
  });
}

test('relmarker input: Add button without a relationship', () => {
  const input = relmarkerInput();
  assert.equal(input.addButton.hidden, false);
  assert.equal(input.box.hidden, true);
  assert.equal(input.addButton.children[1].textContent, 'Add Relationship to Person');
  const reverse = relmarkerInput({ field: MEMBERS_REVERSE });
  assert.equal(reverse.addButton.children[1].textContent, 'Add Relationship from Organisation');
  const readOnly = relmarkerInput({ readOnly: true });
  assert.equal(readOnly.addButton.hidden, true);
});

test('relmarker input: type, triangle, record type icon, title, actions, relationship icon; no visibility switch', () => {
  const relation = { relId: 900, term: 101, termLabel: 'parent of', reverse: false, other: { id: 152, title: 'Anna', rty: 10 } };
  const input = relmarkerInput({ value: 900, relation });
  assert.equal(input.addButton.hidden, true);
  assert.equal(input.box.hidden, false);
  assert.deepEqual(input.box.children.map((child) => child.className.split(' ')[0]), [
    'h-input-relmarker-term', 'fa-solid', 'h-input-relmarker-othericon', 'h-input-relmarker-title',
    'h-input-relmarker-actions', 'h-input-relmarker-relicon', 'h-input-relmarker-actions'
  ]);
  assert.ok(input.container.classList.contains('h-form-input-compact'));
  assert.ok(input.box.querySelector('.fa-caret-right'));
  assert.match(input.otherIcon.getAttribute('src'), /icon=10&/);
  assert.equal(input.otherIcon.hidden, false);
  const reverse = relmarkerInput({ value: 900, relation: { ...relation, reverse: true }, field: MEMBERS_REVERSE });
  assert.ok(reverse.box.querySelector('.fa-caret-left'));
  assert.equal(input.termElement.textContent, 'parent of');
  assert.equal(input.titleElement.textContent, 'Anna');
  assert.match(input.relIcon.getAttribute('src'), /icon=1&/);
  assert.equal(input.container.querySelector('.h-form-input-visibility'), null);
  assert.ok(input.container.querySelector('.h-form-input-clear'));
  assert.equal(input.box.querySelectorAll('.h-input-relmarker-action').length, 4);
});

test('relmarker input: clear deletes the relationship after the warning; Cancel keeps it', async () => {
  const relation = { relId: 900, term: 101, termLabel: 'parent of', reverse: false, other: { id: 152, title: 'Anna', rty: 10 } };
  const removed = [];
  let changed = 0;
  const relationships = { remove: async (id) => { removed.push(id); }, changed: () => { changed++; } };
  const show = HMsg.showMsgDlg;
  const close = HMsg.closeMsgDlg;
  let answer = 1;
  let message = '';
  HMsg.showMsgDlg = (text, options) => { message = text; queueMicrotask(() => options.buttons[answer].onClick()); return null; };
  HMsg.closeMsgDlg = () => {};
  try {
    const input = relmarkerInput({ value: 900, relation, relationships });
    input.clearButton.click();
    await flush();
    assert.match(message, /delete link between records/);
    assert.deepEqual(removed, [], 'Cancel');
    assert.equal(input.getValue(), 900);
    answer = 0;
    input.clearButton.click();
    await flush();
    assert.deepEqual(removed, [900]);
    assert.equal(changed, 1);
    assert.equal(input.getValue(), null);
    assert.equal(input.addButton.hidden, false);
  } finally {
    HMsg.showMsgDlg = show;
    HMsg.closeMsgDlg = close;
  }
});

test('relmarker input: Edit of the relationship record passes the field constraints; read only class', async () => {
  const relation = { relId: 903, term: 102, termLabel: 'child of', reverse: true, other: { id: 152, title: 'Anna', rty: 10 } };
  const edits = [];
  const input = relmarkerInput({
    value: 903, relation, field: MEMBERS_REVERSE,
    editRecord: async (id, options) => { edits.push([id, options]); return { saved: false }; }
  });
  await input._editRelationship();
  assert.deepEqual(edits, [[903, { relation: { vocabulary: 200, targetTypes: [4], reverse: true } }]]);
  assert.equal(input.container.classList.contains('is-readonly'), false);
  input.setReadOnly(true);
  assert.equal(input.container.classList.contains('is-readonly'), true);
});

test('relmarker input: no popup when the record cannot be saved first', async () => {
  let asked = 0;
  const input = relmarkerInput({ relationships: { ensureRecord: async () => { asked++; return null; } } });
  assert.equal(await input.openAddDialog(), false);
  assert.equal(asked, 1);
});

test('relmarker field: the relationships in the state; never required', () => {
  const host = document.createElement('div');
  const relation = { relId: 900, term: 101, termLabel: 'parent of', reverse: false, other: { id: 152, title: 'Anna', rty: 10 } };
  const field = new HEditField().attach(host, {
    field: { ...PERSONS, max: 0, req: 'required' },
    state: { values: [{ value: 900, hidden: false, relation }], translations: [] },
    dbdefs
  }).render();
  assert.deepEqual(field.getState().values, [{ value: 900, hidden: false, relation }]);
  assert.ok(field._rows[0].input.box);
  const empty = new HEditField().attach(document.createElement('div'), { field: { ...PERSONS, req: 'required' }, dbdefs }).render();
  assert.deepEqual(empty.validate(), []);
});

test('the popup: the record read only on its side, vocabulary and types of the field, title', () => {
  const record = { id: 151, rty: 10, title: 'Peter' };
  const { form, states } = relationshipForm({ dbdefs, field: PERSONS, record });
  const [source, type, target] = form.groups[0].children;
  assert.deepEqual([source.name, source.label, source.readOnly, source.targetTypes], ['source', 'Source record', true, [10]]);
  assert.deepEqual([type.type, type.vocabulary, type.req], ['relationtype', 100, 'required']);
  assert.deepEqual([target.label, target.readOnly, target.targetTypes, target.pointerMode], ['Target record', undefined, [10], 'dropdown_add']);
  assert.deepEqual(states.get('source').values[0], { value: 151, hidden: false, label: 'Peter', rectype: 10 });
  assert.equal(relationshipDialogTitle({ dbdefs, field: PERSONS, record }),
    'Create relationship between Person and Person (Field: Related persons)');
  const reverse = relationshipForm({ dbdefs, field: { ...MEMBERS_REVERSE, fieldName: 'Members' }, record });
  assert.deepEqual(reverse.form.groups[0].children.map((child) => [child.name, child.readOnly === true, child.targetTypes || null]),
    [['source', false, [4]], ['type', false, null], ['target', true, [10]]]);
  assert.ok(reverse.states.has('target'));
  assert.equal(relationshipDialogTitle({ dbdefs, field: { ...MEMBERS_REVERSE, fieldName: 'Members' }, record }),
    'Create relationship between Organisation and Person (Field: Members)');
});

test('edit form dialog: own buttons run onAction; false keeps it open', async () => {
  const show = HMsg.showMsgDlg;
  const close = HMsg.closeMsgDlg;
  let buttons = null;
  HMsg.showMsgDlg = (_body, options) => { buttons = options.buttons; return null; };
  HMsg.closeMsgDlg = () => {};
  try {
    const actions = [];
    let allow = false;
    const result = openEditFormDialog({
      form: { localized: true, groups: [{ children: [{ name: 'note', type: 'freetext' }] }] },
      buttons: [{ id: 'save', label: 'Save', primary: true }, { id: 'more', label: 'More' }, { id: 'cancel', label: 'Cancel' }],
      onAction: async (id) => { actions.push(id); return allow; }
    });
    assert.deepEqual(buttons.map((button) => [button.label, button.class]),
      [['Save', 'h-btn h-btn-primary'], ['More', 'h-btn'], ['Cancel', 'h-btn']]);
    buttons[0].onClick();
    await flush();
    assert.deepEqual(actions, ['save'], 'kept open');
    allow = true;
    buttons[1].onClick();
    assert.deepEqual(await result, { action: 'more', values: { note: null } });
    const cancelled = openEditFormDialog({ form: { groups: [] }, buttons: [{ id: 'cancel', label: 'Cancel' }] });
    buttons[0].onClick();
    assert.equal(await cancelled, null);
  } finally {
    HMsg.showMsgDlg = show;
    HMsg.closeMsgDlg = close;
  }
});

test('record editor: relationships in the form; a new record is saved before its first relationship', async () => {
  const { HRecordEditor } = await import('../src/widgets/record-editor/HRecordEditor.js');
  const structure = { rty: 10, groups: [{ id: null, type: 'group', label: null, help: '', children: [
    { dty: 1, type: 'freetext', label: 'Name', help: '', req: 'optional', max: 1, default: '' },
    { ...PERSONS, help: '', req: 'optional', max: 0, default: '' }
  ] }] };
  const calls = [];
  const client = {
    async load() { return { record: { rec_ID: '151', rec_RecTypeID: '10', rec_Title: 'Peter', rec_OwnerUGrpID: '2', rec_NonOwnerVisibility: 'public', details: { 1: ['Peter'] } } }; },
    async insert(body) { calls.push(body); return { record: { ...body, rec_ID: body.rec_RecTypeID === '1' ? '990' : '151', rec_Title: 'Peter' }, issues: [] }; },
    async remove(id) { calls.push(['remove', id]); }
  };
  const editorDefs = { ...dbdefs, currentUserId: () => 2, groups: () => [], users: () => [], userGroupName: () => '' };
  const open = async (options) => {
    const element = document.createElement('div');
    document.body.append(element);
    const editor = new HRecordEditor().attach(element, {
      apiClient: apiClient(), dbdefs: editorDefs, client, structureProvider: { async editStructure() { return structure; } },
      summary: false, ...options
    });
    await editor.open();
    return editor;
  };

  const saved = await open({ recordId: 151 });
  const input = saved.editForm.getFieldWidget('235')._rows[0].input;
  assert.equal(input.getValue(), 900);
  assert.equal(input.titleElement.textContent, 'Anna');
  assert.equal(saved.isDirty(), false);
  assert.equal(saved.getRecord().details[235], undefined, 'not in the record body');

  const fresh = await open({ rectypeId: 10 });
  const service = fresh._relationshipService();
  assert.deepEqual(await service.ensureRecord(), { id: 151, rty: 10, title: 'Peter' });
  assert.equal(calls.length, 1, 'the record was inserted');
  assert.equal(await service.create({ source: 151, target: 152, term: 101 }), 990);
  assert.equal(calls[1].rec_RecTypeID, '1');
  assert.equal(calls[1].rec_OwnerUGrpID, '2', 'owner of the edited record');
  assert.deepEqual(await service.ensureRecord(), { id: 151, rty: 10, title: 'Peter' });
  assert.equal(calls.length, 2, 'saved once');
});

test('repeatable relmarker with a manage service (plan 24): Manage button on its own line, no Add; remove per value; the relations after Close', async () => {
  const relation = { relId: 900, term: 101, termLabel: 'parent of', reverse: false, other: { id: 152, title: 'Anna', rty: 10 } };
  const managed = [];
  let changed = 0;
  const relationships = {
    manage: async (field) => { managed.push(field.dty); return [relation, { ...relation, relId: 901, other: { id: 153, title: 'Bob', rty: 10 } }]; },
    changed: () => { changed++; }
  };
  const field = new HEditField().attach(document.createElement('div'), {
    field: { ...PERSONS, max: 0 }, relationships, dbdefs
  }).render();
  assert.equal(field.isManagedRelmarker, true);
  assert.equal(field.addButton, null, 'no Add a value');
  const line = field.valuesHost.children[0];
  assert.ok(line.classList.contains('h-edit-field-manage-line'), 'above the values');
  const button = line.children[0];
  assert.ok(button.classList.contains('h-edit-field-manage'));
  assert.deepEqual(field.actionButtons, [], 'not beside the first value');
  assert.equal(button.textContent, 'Manage relationships to Person');
  const empty = field._rows[0].input;
  assert.equal(empty.addButton.hidden, true);
  assert.equal(empty.noneElement.hidden, false, 'No relationships');
  button.click();
  await flush();
  await flush();
  assert.deepEqual(managed, [235]);
  assert.deepEqual(field.getState().values.map((entry) => entry.value), [900, 901]);
  assert.equal(changed, 1);
  const input = field._rows[0].input;
  assert.equal(input.box.hidden, false);
  assert.equal(input.clearButton.hidden, false, 'remove one relationship');
  // single-value field or no service: the plan 22 input
  const single = new HEditField().attach(document.createElement('div'), { field: { ...PERSONS, max: 1 }, relationships, dbdefs }).render();
  assert.equal(single.isManagedRelmarker, false);
});
