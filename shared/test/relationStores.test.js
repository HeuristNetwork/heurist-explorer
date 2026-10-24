/**
 * @file relationStores.test.js
 * @brief The relation stores of the relations mode of HRecordManager (plan 24): relationship
 *        records of a relmarker field and the members of a group (sysUsrGrpLinks).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

const { RecordRelationStore, MembershipRelationStore } = await import('../src/data/relationStores.js');

/** Definitions: RT 1 relationship (5 target, 6 type, 7 source), Person 10; roles vocabulary 300. */
const TERMS = {
  100: { term: 'Relations', children: [101, 102] }, 101: { term: 'parent of', inverse: 102 }, 102: { term: 'child of', inverse: 101 },
  300: { term: 'Roles', children: [301, 302] }, 301: { term: 'Administrator', code: 'admin' }, 302: { term: 'Member', code: 'member' }
};
const tree = (id) => ({ internalid: id, term: TERMS[id].term, children: (TERMS[id].children || []).map(tree) });
const dbdefs = {
  localId: (kind, code) => ({ 'rty:2-1': 1, 'dty:2-5': 5, 'dty:2-6': 6, 'dty:2-7': 7 })[`${kind}:${code}`] || 0,
  dbconst: (name) => ({ RT_RELATION: 1, RT_SYS_USER: 133, RT_SYS_GROUP: 134 })[name] ?? 0,
  termTree: (root) => tree(root),
  termDescendants: (roots) => roots.flatMap((root) => [root, ...(TERMS[root]?.children || [])]),
  termLabel: (id) => TERMS[id]?.term || '',
  termInverse: (id) => TERMS[id]?.inverse || 0,
  term: (id) => (TERMS[id] ? { internalid: id, term: TERMS[id].term, code: TERMS[id].code || '' } : null),
  userGroupName: (id) => ({ 2: 'Artem (osmakov)', 7: 'Ian (ijohnson)' })[id] || ''
};

/** A relationship row of `/records` (resolved). */
function relRow(id, [source, sourceTitle], term, [target, targetTitle]) {
  return {
    rec_ID: String(id),
    rec_RecTypeID: '1',
    details: {
      7: [{ rec_ID: String(source), rec_RecTypeID: '10', rec_Title: sourceTitle }],
      6: [{ trm_ID: String(term), trm_Label: TERMS[term].term }],
      5: [{ rec_ID: String(target), rec_RecTypeID: '10', rec_Title: targetTitle }]
    }
  };
}

const PERSONS = { dty: 235, type: 'relmarker', label: 'Related persons', vocabulary: 100, targetTypes: [10] };

/** Relationship searches of record 151, and a RecordEditClient that records the writes. */
function recordStore(field = PERSONS) {
  const writes = [];
  const apiClient = {
    async get(_path, { query }) {
      if (query.q[1]['f:7']) return { records: [relRow(900, [151, 'Peter'], 101, [152, 'Anna'])] };
      return { records: [] };
    }
  };
  const client = {
    insert: async (body) => { writes.push(['insert', body]); return { record: { rec_ID: '999' } }; },
    patch: async (id, body) => { writes.push(['patch', id, body]); return { record: {} }; },
    remove: async (id) => { writes.push(['remove', id]); return {}; }
  };
  const store = new RecordRelationStore({
    apiClient, dbdefs, client, field, record: { id: 151, rty: 10, title: 'Peter' }, header: () => ({ owner: 5, visibility: 'viewable', viewGroups: [] })
  });
  return { store, writes };
}

test('relationship records: the relations of the field, the list query, the relation types', async () => {
  const { store } = recordStore();
  assert.equal(store.kind, 'records');
  assert.equal(store.canEditRelationship, true);
  assert.deepEqual(store.otherTypes, [10]);
  const relations = await store.list();
  assert.deepEqual(relations.map((relation) => [relation.relId, relation.term, relation.other.id]), [[900, 101, 152]]);
  assert.deepEqual(store.targetQuery(relations), [{ 'rf:235': [{ ids: '151' }] }]);
  assert.deepEqual(store.terms(), [{ id: 101, label: 'parent of', depth: 0 }, { id: 102, label: 'child of', depth: 0 }]);
  // a reverse field: the stored sources (rt), the inverse labels of the stored terms
  const reverse = recordStore({ ...PERSONS, reverse: true, sourceTypes: [10] }).store;
  assert.deepEqual(reverse.targetQuery([]), [{ 'rt:235': [{ ids: '151' }] }]);
  assert.deepEqual(reverse.terms().map((term) => [term.id, term.label]), [[101, 'child of'], [102, 'parent of']]);
});

test('relationship records: add skips a record that has the type already; setType and remove', async () => {
  const { store, writes } = recordStore();
  const relations = await store.list();
  assert.equal(await store.add([152, 153], 101, relations), 1);
  assert.equal(writes.length, 1);
  const [, body] = writes[0];
  assert.deepEqual(body.details, { 7: ['151'], 6: ['101'], 5: ['153'] });
  assert.equal(body.rec_OwnerUGrpID, '5', 'the owner of the edited record');
  await store.setType(relations[0], 102);
  assert.deepEqual(writes[1], ['patch', 900, { details: { 6: ['102'] } }]);
  await store.remove(relations[0]);
  assert.deepEqual(writes[2], ['remove', 900]);
  // reverse: the other record is the source
  const reverse = recordStore({ ...PERSONS, reverse: true, sourceTypes: [10] });
  await reverse.store.add([160], 101, []);
  assert.deepEqual(reverse.writes[0][1].details, { 7: ['160'], 6: ['101'], 5: ['151'] });
});

/** /sys answers of group 5 (members 2 admin, 7 member) and the members requests. */
function membershipApi() {
  const calls = [];
  return {
    calls,
    async get(path, { query }) {
      calls.push(['GET', path, query]);
      if (path === '/sys/group/5') return { records: [{ rec_ID: '5', details: { members: [{ id: 2, role: 'admin' }, { id: 7, role: 'member' }] } }] };
      return { records: [{ rec_ID: '5', rec_Title: 'Editors', details: { members: [{ id: 2, role: 'admin' }, { id: 7, role: 'member' }] } }] };
    },
    async request(path, { method, body }) {
      calls.push([method, path, body]);
      return {};
    }
  };
}

const MEMBERSHIP = { dty: 1196, name: 'members', type: 'relmarker', vocabulary: 300, targetTypes: [133] };

test('memberships of a group: the members with the role as relation type; ids as the list query', async () => {
  const api = membershipApi();
  const store = new MembershipRelationStore({ apiClient: api, dbdefs, field: MEMBERSHIP, record: { id: 5, title: 'Editors' } });
  assert.equal(store.canEditRelationship, false);
  const relations = await store.list();
  assert.deepEqual(relations.map((relation) => [relation.relId, relation.term, relation.other.title, relation.other.rty]), [
    [2, 301, 'Artem (osmakov)', 133], [7, 302, 'Ian (ijohnson)', 133]
  ]);
  assert.deepEqual(store.targetQuery(relations), [{ ids: '2,7' }]);
  assert.deepEqual(store.targetQuery([]), [{ ids: '0' }], 'no members: none listed');
  assert.equal(await store.add([7, 9], 302, relations), 1, '7 is a member already');
  await store.setType(relations[1], 301);
  await store.remove(relations[1]);
  assert.deepEqual(api.calls.filter((call) => call[0] === 'POST'), [
    ['POST', '/sys/group/5/members', { add: [9], role: 'member' }],
    ['POST', '/sys/group/5/members', { add: [7], role: 'admin' }],
    ['POST', '/sys/group/5/members', { remove: [7] }]
  ]);
});

test('memberships of a user (reverse): their groups with the role; the requests go to each group', async () => {
  const api = membershipApi();
  const field = { ...MEMBERSHIP, name: 'groups', reverse: true, sourceTypes: [134] };
  const store = new MembershipRelationStore({ apiClient: api, dbdefs, field, record: { id: 7, title: 'Ian' } });
  const relations = await store.list();
  assert.deepEqual(api.calls[0], ['GET', '/sys/group', { q: [{ user: '7' }], fields: 'rec_Title,members', limit: 1000 }]);
  assert.deepEqual(relations.map((relation) => [relation.relId, relation.term, relation.other.title, relation.groupId, relation.userId]), [
    [5, 302, 'Editors', 5, 7]
  ]);
  assert.deepEqual(store.targetQuery(relations), [{ user: '7' }]);
  await store.add([6, 8], 301, relations);
  assert.deepEqual(api.calls.filter((call) => call[0] === 'POST'), [
    ['POST', '/sys/group/6/members', { add: [7], role: 'admin' }],
    ['POST', '/sys/group/8/members', { add: [7], role: 'admin' }]
  ]);
});

test('relationship records: add reports the progress and stops on Cancel (the progress dialog of Find or Add)', async () => {
  const { store, writes } = recordStore();
  const controller = new AbortController();
  const progress = [];
  const count = await store.add([160, 161, 162], 101, [], {
    signal: controller.signal,
    onProgress: (done, total) => { progress.push([done, total]); if (done === 2) controller.abort(); }
  });
  assert.equal(count, 2);
  assert.equal(writes.length, 2);
  assert.deepEqual(progress, [[1, 3], [2, 3]]);
});
