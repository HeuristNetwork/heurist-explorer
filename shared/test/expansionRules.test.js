import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_RULE_DEPTH, ruleDepth, typeIds, ruleTargetTypes, appendQuickStep } from '../src/data/expansionRules.js';
import { RectypeSource } from '../src/data/valueSources/localSources.js';

test('rule depth counts the rule query as level 1', () => {
  assert.equal(MAX_RULE_DEPTH, 4);
  assert.equal(ruleDepth({ query: {} }), 1);
  assert.equal(ruleDepth({ query: {}, levels: [{ query: {} }, { query: {}, levels: [{ query: {} }] }] }), 3);
});

test('type ids accept numbers, lists and ID strings', () => {
  assert.deepEqual(typeIds(10), [10]);
  assert.deepEqual(typeIds('10, 12,x'), [10, 12]);
  assert.deepEqual(typeIds([12, '12', 5]), [12, 5]);
  assert.deepEqual(typeIds(undefined), []);
  assert.deepEqual(ruleTargetTypes({ query: [{ t: '4,5' }, { lf: [] }] }), [4, 5]);
});

test('quick expansion starts one connected rule when there are none', () => {
  assert.deepEqual(appendQuickStep([]), [{ query: { connected: [] }, levels: [] }]);
});

test('quick expansion appends a connected step to every short branch from its targets', () => {
  const rules = [
    { query: { t: 10, lf: [{ t: 5 }] }, name: 'A', levels: [
      { query: { t: [12, 13], 'lt:4': [{ t: 10 }] } },
      { query: { lt: [{ t: 10 }] } }
    ] },
    { query: { connected: [] }, name: 'B' }
  ];
  const next = appendQuickStep(rules);
  assert.deepEqual(next[0].levels[0].levels, [{ query: { connected: [{ t: [12, 13] }] }, levels: [] }]);
  assert.deepEqual(next[0].levels[1].levels, [{ query: { connected: [] }, levels: [] }]);
  assert.deepEqual(next[1].levels, [{ query: { connected: [] }, levels: [] }]);
  assert.equal(next[0].name, undefined, 'changed rules are described again');
  assert.equal(rules[0].levels[0].levels, undefined, 'input is not modified');
});

test('quick expansion stops at the deepest allowed level', () => {
  let rule = { query: { connected: [] }, levels: [] };
  for (let level = 1; level < MAX_RULE_DEPTH; level += 1) rule = { query: { connected: [] }, levels: [rule] };
  assert.equal(ruleDepth(rule), MAX_RULE_DEPTH);
  assert.equal(appendQuickStep([rule]), null);
});

test('record types: current data source first, then groups sorted by name', () => {
  const dbdefs = {
    rectypes: () => [
      { id: 5, name: 'Person', group: 1 }, { id: 3, name: 'Event', group: 1 },
      { id: 10, name: 'Place', group: 2 }, { id: 12, name: 'Area', group: 2 }
    ],
    rectypeGroups: () => [{ id: 1, name: 'People' }, { id: 2, name: 'Places' }],
    rectypeName: (id) => ({ 5: 'Person' }[id] || '')
  };
  const items = new RectypeSource(dbdefs, { priority: [10], filter: (id) => id !== 3 }).items();
  assert.deepEqual(items.map((item) => [item.value, item.groupLabel]),
    [[10, 'Current data source'], [5, 'People'], [12, 'Places']]);
  assert.deepEqual(new RectypeSource(dbdefs, { ids: [12, 10] }).items().map((item) => item.value), [12, 10]);
  assert.equal(new RectypeSource(dbdefs).labelFor(5), 'Person');
});
