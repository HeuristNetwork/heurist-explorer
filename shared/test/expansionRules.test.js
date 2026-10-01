import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_RULE_DEPTH, ruleDepth, rulesDepth, typeIds, ruleTargetTypes, appendQuickStep, expansionLevelQuery, quickStepReachQuery } from '../src/data/expansionRules.js';
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

test('level query: a step gets its parent level as a condition of its traversal', () => {
  const rules = [{ query: { t: 10, lf: [{ t: 5 }] }, levels: [{ query: { 'lt:4': [] } }] }];
  assert.deepEqual(expansionLevelQuery('t:5', rules, 1), { t: 10, lf: [{ t: 5 }, { all: 't:5' }] });
  assert.deepEqual(expansionLevelQuery({ t: 5 }, rules, 2),
    { 'lt:4': [{ all: { t: 10, lf: [{ t: 5 }, { all: { t: 5 } }] } }] });
  assert.equal(expansionLevelQuery('t:5', rules, 3), null, 'no rule reaches level 3');
  assert.equal(expansionLevelQuery('t:5', rules, 0), null);
  assert.deepEqual(rules[0].query.lf, [{ t: 5 }], 'rules are not modified');
});

test('level query: branches are joined with any; cumulative adds the lower levels', () => {
  const rules = [{ query: { connected: [] }, levels: [{ query: { rt: [] } }] }, { query: [{ t: 3 }, { 'lf:7': '12,13' }] }];
  assert.deepEqual(expansionLevelQuery('Q', rules, 1), { any: [
    { all: { connected: [{ all: 'Q' }] } },
    { all: [{ t: 3 }, { 'lf:7': [{ ids: '12,13' }, { all: 'Q' }] }] }
  ] });
  const level1 = { connected: [{ all: 'Q' }] };
  assert.deepEqual(expansionLevelQuery('Q', rules, 2), { rt: [{ all: level1 }] });
  assert.equal(expansionLevelQuery('Q', rules, 2, { cumulative: true }).any.length, 3);
});

test('level query: the selection replaces the base query; ignored rules are skipped', () => {
  const rules = [{ query: { connected: [] } }, { query: { lt: [] }, ignore: true }];
  assert.deepEqual(expansionLevelQuery('Q', rules, 1, { parentIds: [4, '5', 'x'] }), { connected: [{ all: { ids: [4, 5] } }] });
  assert.deepEqual(expansionLevelQuery('Q', rules, 1, { parentIds: [] }), { connected: [{ all: 'Q' }] });
  assert.equal(rulesDepth(rules), 1);
  assert.equal(rulesDepth([]), 0);
  assert.equal(expansionLevelQuery('Q', [{ query: { t: 5 } }], 1), null, 'a step without traversal reaches nothing');
});

test('smart expansion: the new step reaches only the chosen record types', () => {
  const rules = [{ query: { t: 48, lt: [{ t: 10 }] }, levels: [] }];
  assert.deepEqual(appendQuickStep(rules, MAX_RULE_DEPTH, { types: [12, '48'] })[0].levels,
    [{ query: { t: [12, 48], connected: [{ t: 48 }] }, levels: [] }]);
  assert.deepEqual(appendQuickStep([], MAX_RULE_DEPTH, { types: [12] }), [{ query: { t: 12, connected: [] }, levels: [] }]);
});

test('smart expansion counts what the next quick step reaches from every branch end', () => {
  const rules = [{ query: { t: 48, lt: [{ t: 10 }] }, levels: [] }, { query: { rt: [] }, levels: [], ignore: true }];
  assert.deepEqual(quickStepReachQuery('t:10', rules),
    { connected: [{ t: 48 }, { all: { t: 48, lt: [{ t: 10 }, { all: 't:10' }] } }] });
  assert.deepEqual(quickStepReachQuery('t:10', []), { connected: [{ all: 't:10' }] });
  const full = [{ query: { lt: [] }, levels: [{ query: { lt: [] }, levels: [{ query: { lt: [] }, levels: [{ query: { lt: [] } }] }] }] }];
  assert.equal(quickStepReachQuery('t:10', full), null, 'no branch can grow');
  assert.equal(quickStepReachQuery('', rules), null);
});
