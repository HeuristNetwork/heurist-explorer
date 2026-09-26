import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HDbDefs } from '#shared/data/HDbDefs.js';
import { UserGroupManager } from '../src/core/UserGroupManager.js';
import { HFilterInlineHelper } from '../src/widgets/filter-builder/HFilterInlineHelper.js';
import { queryDescribe } from '../src/utils/queryDescribe.js';

const VOCAB = JSON.parse(readFileSync(new URL('../src/utils/queryVocabulary.json', import.meta.url), 'utf8'));
const SNAPSHOT = JSON.parse(readFileSync(new URL('../../../shared/test/fixtures/snapshot.json', import.meta.url), 'utf8'));

const OVERLAY = {
  currentUserId: 5,
  isDbAdmin: false,
  groups: [{ id: 6, name: 'Test group', role: 'member' }, { id: 7, name: 'Editors', role: 'bogus' }],
  users: [{ id: 5, name: 'timma' }]
};

test('HDbDefs keeps the users/groups overlay with roles', () => {
  const defs = new HDbDefs(SNAPSHOT);
  assert.equal(defs.hasUserGroups(), false);
  assert.deepEqual(defs.users(), []);
  defs.setUserGroups(OVERLAY);
  assert.equal(defs.hasUserGroups(), true);
  assert.deepEqual(defs.groups().map((group) => group.role), ['member', 'none']);
  assert.equal(defs.userGroupName(6), 'Test group');
  assert.equal(defs.userGroupName('5'), 'timma');
  assert.equal(defs.userGroupName(99), '');
  assert.equal(defs.groupRole(6), 'member');
  assert.equal(defs.groupRole(99), 'none');
  assert.equal(defs.currentUserId(), 5);
  assert.equal(defs.isDbAdmin(), false);
  defs.setUserGroups(null);
  assert.equal(defs.hasUserGroups(), false);
});

/** API stub answering the two /sys requests. */
function sysApi({ groups, users, error } = {}) {
  const requests = [];
  return {
    requests,
    async get(path, { query }) {
      requests.push({ path, query });
      if (error) throw error;
      return query.q.t === 'group' ? groups : users;
    }
  };
}

test('UserGroupManager loads groups (with roles) and users and publishes them', async () => {
  const defs = new HDbDefs(SNAPSHOT);
  const api = sysApi({
    groups: {
      records: [{ rec_ID: 6, rec_Title: 'Test group', details: { role: [{ value: 'admin' }] } }],
      meta: { currentUser: { id: 2, isAdmin: true } }
    },
    users: { records: [{ rec_ID: 2, rec_Title: 'osmakov' }], meta: { currentUser: { id: 2, isAdmin: true } } }
  });
  const manager = new UserGroupManager({ apiClient: api, dbDefsProvider: async () => defs });
  await manager.load();
  assert.deepEqual(api.requests.map((request) => [request.path, request.query.q.t, request.query.fields]),
    [['/sys', 'group', 'role'], ['/sys', 'user', undefined]]);
  assert.deepEqual(defs.groups(), [{ id: 6, name: 'Test group', role: 'admin' }]);
  assert.equal(defs.isDbAdmin(), true);
  assert.equal(defs.currentUserId(), 2);
  await manager.clear();
  assert.equal(defs.hasUserGroups(), false);
});

test('UserGroupManager clears the overlay for a guest', async () => {
  const defs = new HDbDefs(SNAPSHOT).setUserGroups(OVERLAY);
  const refused = Object.assign(new Error('Unauthorized'), { status: 401 });
  await new UserGroupManager({ apiClient: sysApi({ error: refused }), dbDefsProvider: async () => defs }).load();
  assert.equal(defs.hasUserGroups(), false);
  const anonymous = sysApi({ groups: { records: [], meta: { currentUser: { id: 0 } } }, users: { records: [] } });
  defs.setUserGroups(OVERLAY);
  await new UserGroupManager({ apiClient: anonymous, dbDefsProvider: async () => defs }).load();
  assert.equal(defs.hasUserGroups(), false);
});

test('UserGroupManager validates its options', () => {
  assert.throws(() => new UserGroupManager({}), TypeError);
  assert.throws(() => new UserGroupManager({ apiClient: {} }), TypeError);
});

const HELPER_DBDEFS = {
  rectypes: () => [],
  fields: () => [],
  hasUserGroups: () => true,
  groups: () => OVERLAY.groups,
  users: () => [{ id: 5, name: 'timma' }, { id: 2, name: 'osmakov' }],
  userGroupName: (id) => ({ 5: 'timma', 2: 'osmakov', 6: 'Test group', 7: 'Editors' })[id] || ''
};

test('inline helper offers visible groups and users for owner, users only for addedby', () => {
  const helper = new HFilterInlineHelper({ vocabulary: VOCAB, dbdefs: HELPER_DBDEFS });
  const owner = helper._computeHints('owner:', 6);
  assert.deepEqual(owner.items.map((item) => item.label), ['Editors', 'Test group', 'osmakov', 'timma']);
  assert.equal(owner.items[1].insert, 'owner:6 ');
  const creator = helper._computeHints('addedby:-tim', 12);
  assert.deepEqual(creator.items.map((item) => [item.label, item.insert]), [['timma', 'addedby:-5 ']]);
});

test('the describer names visible users and groups', () => {
  const dbdefs = { userGroupName: HELPER_DBDEFS.userGroupName, rectypeName: () => '' };
  const text = queryDescribe([{ owner: '6,5' }], { vocabulary: VOCAB, dbdefs });
  assert.match(text, /"Test group", "timma"/);
  const unknown = queryDescribe([{ addedby: '99' }], { vocabulary: VOCAB, dbdefs });
  assert.match(unknown, /99/);
});
