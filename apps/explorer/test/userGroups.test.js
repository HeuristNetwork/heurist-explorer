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

/** API stub answering the /sys requests of groups, users and tags. */
function sysApi({ groups, users, tags, error } = {}) {
  const requests = [];
  return {
    requests,
    async get(path, { query }) {
      requests.push({ path, query });
      if (error) throw error;
      return { group: groups, user: users, tag: tags }[query.q.t];
    }
  };
}

const ADMIN_API = () => sysApi({
  groups: {
    records: [{ rec_ID: 6, rec_Title: 'Test group', details: { role: [{ value: 'admin' }] } }],
    meta: { currentUser: { id: 2, name: 'osmakov', isAdmin: true } }
  },
  users: { records: [{ rec_ID: 2, rec_Title: 'osmakov' }, { rec_ID: 5, rec_Title: 'timma' }] },
  tags: { records: [{ rec_ID: 11, rec_Title: 'my tag', rec_OwnerUGrpID: 2 }] }
});

test('UserGroupManager loads only groups (with roles) at start and publishes them', async () => {
  const defs = new HDbDefs(SNAPSHOT);
  const api = ADMIN_API();
  const manager = new UserGroupManager({ apiClient: api, dbDefsProvider: async () => defs });
  await manager.load();
  assert.deepEqual(api.requests.map((request) => [request.path, request.query.q.t, request.query.fields]),
    [['/sys', 'group', 'role']]);
  assert.deepEqual(defs.groups(), [{ id: 6, name: 'Test group', role: 'admin' }]);
  assert.equal(defs.isDbAdmin(), true);
  assert.equal(defs.currentUserId(), 2);
  assert.equal(defs.userGroupName(2), 'osmakov', 'own name from meta.currentUser, no user list');
  assert.equal(defs.isUserGroupPartPending('users'), true);
  assert.equal(defs.isUserGroupPartPending('tags'), true);
  await manager.clear();
  assert.equal(defs.hasUserGroups(), false);
});

test('users and tags are loaded once, on first use', async () => {
  const defs = new HDbDefs(SNAPSHOT);
  const api = ADMIN_API();
  const manager = new UserGroupManager({ apiClient: api, dbDefsProvider: async () => defs });
  await manager.load();
  await Promise.all([defs.ensureUserGroups(['users']), defs.ensureUserGroups(['users'])]);
  assert.deepEqual(api.requests.map((request) => request.query.q.t), ['group', 'user']);
  assert.deepEqual(defs.users().map((user) => user.name), ['osmakov', 'timma']);
  assert.equal(defs.userGroupName(5), 'timma');
  assert.equal(defs.isUserGroupPartPending('users'), false);
  const data = await manager.ensure(['tags']);
  assert.deepEqual(api.requests.map((request) => request.query.q.t), ['group', 'user', 'tag']);
  assert.equal(api.requests[2].query.q.user, 'current', "only the current user's tags");
  assert.equal(defs.tagName(11), 'my tag');
  assert.deepEqual(data.tags, [{ id: 11, name: 'my tag', owner: 2 }]);
  assert.deepEqual(data.pending, []);
  await defs.ensureUserGroups();
  assert.equal(api.requests.length, 3, 'nothing is loaded twice');
});

test('a synchronous getter starts the load in the background', async () => {
  const defs = new HDbDefs(SNAPSHOT);
  const api = ADMIN_API();
  await new UserGroupManager({ apiClient: api, dbDefsProvider: async () => defs }).load();
  assert.equal(defs.tagName(11), '', 'not loaded yet');
  await defs.ensureUserGroups(['tags']);
  assert.equal(defs.tagName(11), 'my tag');
  assert.deepEqual(api.requests.map((request) => request.query.q.t), ['group', 'tag']);
});

test('a failed load can be tried again', async () => {
  const defs = new HDbDefs(SNAPSHOT).setUserGroups({ currentUserId: 2, groups: [], pending: ['users'] });
  let calls = 0;
  defs.setUserGroupLoader(async () => {
    calls += 1;
    if (calls === 1) throw new Error('offline');
    return [{ id: 5, name: 'timma' }];
  });
  await assert.rejects(defs.ensureUserGroups(['users']), /offline/);
  await defs.ensureUserGroups(['users']);
  assert.equal(defs.userGroupName(5), 'timma');
  assert.equal(calls, 2);
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
