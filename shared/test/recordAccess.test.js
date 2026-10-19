import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from './helpers/fakeDom.js';

const document = installFakeDom();
const { accessFormState, accessHeader, loadRecordAddDefaults, saveRecordAddDefaults } = await import('../src/data/recordAccess.js');
const { HRecordAccess, ownerChoices } = await import('../src/widgets/record-access/HRecordAccess.js');
const { recordTypeItems } = await import('../src/widgets/record-access/openRecordAddDialog.js');

/** HDbDefs stand-in: user 2 is a member of group 5, not of group 6; user 3 exists. */
function dbdefs({ admin = false } = {}) {
  const names = { 2: 'Ann', 3: 'Bob', 5: 'Editors', 6: 'Others' };
  return {
    currentUserId: () => 2,
    isDbAdmin: () => admin,
    groups: () => [{ id: 5, name: 'Editors', role: 'member' }, { id: 6, name: 'Others', role: 'none' }],
    users: () => [{ id: 2, name: 'Ann' }, { id: 3, name: 'Bob' }],
    userGroupName: (id) => names[id] || '',
    rectypes: () => [
      { id: 10, name: 'Person', group: 1 }, { id: 11, name: 'Place', group: 1 },
      { id: 12, name: 'Book', group: 2 }, { id: 70, name: 'Query source', group: 9 }
    ],
    rectypeGroups: () => [{ id: 1, name: 'People and places' }, { id: 2, name: 'Bibliography' }],
    dbconst: (code) => ({ RT_QUERY_SOURCE: 70 })[code] || 0
  };
}

test('form state of a header: hidden or view groups check "User or group specified above"; pending shows as Public', () => {
  assert.equal(accessFormState({ owner: 2, visibility: 'hidden' }).choice, 'hidden');
  assert.deepEqual(accessFormState({ owner: 2, visibility: 'viewable', viewGroups: [5] }), {
    owner: 2, choice: 'hidden', viewGroups: [5], editGroups: [], pending: false
  });
  assert.equal(accessFormState({ owner: 2, visibility: 'viewable' }).choice, 'viewable');
  const pending = accessFormState({ owner: 2, visibility: 'pending' });
  assert.equal(pending.choice, 'public');
  assert.equal(pending.pending, true);
  assert.equal(accessFormState({}).choice, 'viewable');
});

test('save rule of the legacy form', () => {
  // owner "any logged-in user": viewable unless public
  assert.deepEqual(accessHeader({ owner: 0, choice: 'hidden', viewGroups: [5] }), { owner: 0, visibility: 'viewable', viewGroups: [], editGroups: [] });
  assert.equal(accessHeader({ owner: 0, choice: 'public' }).visibility, 'public');
  // hidden with groups: viewable by those groups; without: hidden
  assert.deepEqual(accessHeader({ owner: 2, choice: 'hidden', viewGroups: [5, 5] }), { owner: 2, visibility: 'viewable', viewGroups: [5], editGroups: [] });
  assert.equal(accessHeader({ owner: 2, choice: 'hidden', viewGroups: [] }).visibility, 'hidden');
  // viewable and public have no groups; pending kept while Public is checked
  assert.deepEqual(accessHeader({ owner: 2, choice: 'viewable', viewGroups: [5] }).viewGroups, []);
  assert.equal(accessHeader({ owner: 2, choice: 'public', pending: true }).visibility, 'pending');
  assert.deepEqual(accessHeader({ owner: 2, choice: 'viewable', editGroups: [6] }).editGroups, [6]);
});

test('remembered access of new records: per database and user; first time current user + viewable', () => {
  const store = new Map();
  globalThis.localStorage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)) };
  const who = { database: 'db1', userId: 2 };
  assert.deepEqual(loadRecordAddDefaults(who), { owner: 2, visibility: 'viewable', viewGroups: [], rectypeId: 0 });
  saveRecordAddDefaults(who, { owner: 5, visibility: 'pending', viewGroups: [], rectypeId: 12 });
  assert.deepEqual(loadRecordAddDefaults(who), { owner: 5, visibility: 'public', viewGroups: [], rectypeId: 12 });
  // another database or user: its own
  assert.equal(loadRecordAddDefaults({ database: 'db2', userId: 2 }).owner, 2);
  // the record type stays when only the access is remembered
  saveRecordAddDefaults(who, { owner: 2, visibility: 'hidden', viewGroups: [5] });
  assert.equal(loadRecordAddDefaults(who).rectypeId, 12);
  // no storage: the defaults
  globalThis.localStorage = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
  assert.equal(loadRecordAddDefaults(who).owner, 2);
  saveRecordAddDefaults(who, { owner: 9 });
  delete globalThis.localStorage;
});

test('owner list: any logged-in user, current user, the user\'s groups; an administrator also all users', async () => {
  const member = (await ownerChoices(dbdefs()).load()).items.map((item) => item.value);
  assert.deepEqual(member, [0, 2, 5]);
  const admin = (await ownerChoices(dbdefs({ admin: true })).load()).items.map((item) => item.value);
  assert.deepEqual(admin, [0, 2, 5, 6, 3]);
  // the current owner stays in the list
  const kept = (await ownerChoices(dbdefs(), 6).load()).items.map((item) => item.value);
  assert.deepEqual(kept, [0, 2, 5, 6]);
  assert.match(ownerChoices(dbdefs()).labelFor(2), /Current user \(Ann\)/);
});

test('HRecordAccess: radios, groups only with "User or group specified above", none for owner any user', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const changes = [];
  const form = new HRecordAccess().attach(host, {
    dbdefs: dbdefs(), value: { owner: 2, visibility: 'viewable', viewGroups: [5] }, onChange: (value) => changes.push(value)
  }).render();
  assert.equal(form.radios.get('hidden').radio.checked, true);
  assert.equal(form.viewGroupsBox.hidden, false);
  assert.deepEqual(form.getValue(), { owner: 2, visibility: 'viewable', viewGroups: [5], editGroups: [] });
  // Public: no groups
  form.radios.get('public').radio.checked = true;
  form.radios.get('hidden').radio.checked = false;
  form._changed();
  assert.equal(form.viewGroupsBox.hidden, true);
  assert.equal(changes.at(-1).visibility, 'public');
  // owner any logged-in user: the first radio is not offered
  form.ownerCombo.setValue(0);
  form.radios.get('public').radio.checked = false;
  form.radios.get('hidden').radio.checked = true;
  form._changed();
  assert.equal(form.radios.get('hidden').line.hidden, true);
  assert.equal(form.radios.get('viewable').radio.checked, true);
  assert.equal(changes.at(-1).visibility, 'viewable');
  assert.equal(form.editGroupsCombo, undefined, 'edit groups only with the editGroups option');
});

test('HRecordAccess: a pending record shows Public with the note and is saved pending', () => {
  const form = new HRecordAccess().attach(document.createElement('div'), {
    dbdefs: dbdefs(), value: { owner: 2, visibility: 'pending', editGroups: [6] }, editGroups: true
  }).render();
  assert.equal(form.radios.get('public').radio.checked, true);
  assert.equal(form.pendingNote.hidden, false);
  assert.equal(form.getValue().visibility, 'pending');
  assert.deepEqual(form.getValue().editGroups, [6]);
  assert.ok(form.editGroupsCombo);
});

test('Add record dialog: the allowed types, grouped by record type group', () => {
  const items = recordTypeItems(dbdefs(), [10, 12, 11]);
  assert.deepEqual(items.map((item) => [item.value, item.groupLabel]), [[10, 'People and places'], [11, 'People and places'], [12, 'Bibliography']]);
});

test('HInputResource without a type constraint adds through the host dialog (addRecord(null))', async () => {
  const { HInputResource } = await import('../src/widgets/form/inputs/HInputResource.js');
  const asked = [];
  const source = {
    labels: new Map(),
    labelFor(id) { return this.labels.get(Number(id)); },
    async fetchLabels(ids) { for (const id of ids) this.labels.set(Number(id), `Record ${id}`); },
    rememberLabel(id, title) { this.labels.set(Number(id), title); },
    async load() { return { items: [], total: 0, complete: true }; }
  };
  const input = new HInputResource().attach(document.createElement('div'), {
    source, dbdefs: dbdefs(), pointerMode: 'addonly', targetTypes: [],
    addRecord: async (id) => { asked.push(id); return { saved: true, recordId: 31 }; }
  });
  input.render();
  assert.equal(input.mode, 'addonly');
  assert.equal(input.modeButtonText.textContent, 'Add record');
  await input._chooseTypeAndAdd(input.modeButton);
  assert.deepEqual(asked, [null]);
  assert.equal(input.getValue(), 31);
  // dropdown_add: the Add action too
  const dropdown = new HInputResource().attach(document.createElement('div'), {
    source, dbdefs: dbdefs(), pointerMode: 'dropdown_add', targetTypes: [], addRecord: async () => ({})
  });
  dropdown.render();
  assert.deepEqual(dropdown.combo.picker.actions.map((action) => action.id), ['add']);
});
