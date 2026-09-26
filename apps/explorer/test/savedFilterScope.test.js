import test from 'node:test';
import assert from 'node:assert/strict';
import { SavedFilterManager, hasExpansionRules } from '../src/core/SavedFilterManager.js';
import { ownerScope } from '../src/core/UserGroupManager.js';

test('owner scope: Everyone, Website filters, member/admin groups and the user; guests the public two', () => {
  assert.deepEqual(ownerScope(null), [0, 4]);
  assert.deepEqual(ownerScope({ currentUserId: 5, groups: [
    { id: 1, role: 'none' }, { id: 6, role: 'member' }, { id: 3, role: 'admin' }, { id: 4, role: 'member' }
  ] }), [0, 4, 5, 6, 3]);
});

test('saved filters load the owner scope with owners; owner 0 is kept; rules are detected', async () => {
  const calls = [];
  const manager = new SavedFilterManager({
    apiClient: {
      async get(path, options) {
        calls.push(options.query);
        return { records: [
          { rec_ID: 1, rec_Title: 'Public', rec_OwnerUGrpID: '0', details: { query: [{ value: '{"q":[{"t":"10"}]}' }] } },
          { rec_ID: 2, rec_Title: 'With rules', rec_OwnerUGrpID: '4',
            details: { query: [{ value: '?q=t:10&rules=%5B%7B%22query%22%3A%22t%3A12%22%7D%5D' }] } }
        ] };
      }
    },
    ownerIds: () => [0, 4, 5]
  });
  const list = await manager.load();
  assert.equal(calls[0].q.owner, '0,4,5');
  assert.equal(calls[0].fields, 'query,filterType,owner');
  assert.deepEqual(list.map((filter) => [filter.id, filter.ownerGroupId, filter.hasRules]), [[1, 0, false], [2, 4, true]]);
  assert.deepEqual(manager.groups(), [0, 4]);
  assert.deepEqual(manager.list({ group: 0 }).map((filter) => filter.id), [1]);
});

test('expansion rules: JSON definitions and legacy URL queries; empty rules are none', () => {
  assert.equal(hasExpansionRules('{"q":"t:10","rules":[{"query":"x"}]}', { rules: [{ query: 'x' }] }), true);
  assert.equal(hasExpansionRules('{"q":"t:10","rules":[]}', { rules: [] }), false);
  assert.equal(hasExpansionRules('?q=t:10&rules=[{"query":"t:12"}]', { q: '?q=t:10' }), true);
  assert.equal(hasExpansionRules('?q=t:10&rules=', {}), false);
  assert.equal(hasExpansionRules('?q=t:10&w=all', {}), false);
});
