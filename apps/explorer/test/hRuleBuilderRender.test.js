import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from '../../../shared/test/helpers/fakeDom.js';

const document = installFakeDom();
const { HRuleBuilder } = await import('../src/widgets/query-source/helpers/HRuleBuilder.js');

const dbdefs = {
  rectypes: () => [{ id: 5, name: 'Person' }, { id: 10, name: 'Place' }, { id: 12, name: 'Area' }],
  rectypeGroups: () => [],
  rectypeName: (id) => ({ 5: 'Person', 10: 'Place', 12: 'Area' }[id] || ''),
  fields: (rty) => (Number(rty) === 5 ? [{ id: 15, type: 'resource', name: 'Birth place' }] : []),
  fieldGlobal: (id) => (Number(id) === 15 ? { name: 'Birth place', targetTypes: [10, 12] } : null),
  termTree: () => ({ children: [] })
};

function render(rules) {
  const builder = new HRuleBuilder({ dbdefs });
  builder.attach(document.createElement('div')).render();
  builder.setRules(rules);
  return builder;
}

test('a rule with steps after several and any target types renders and round-trips', () => {
  const rules = [{
    query: { t: [10, 12], 'lf:15': [{ t: 5 }] },
    levels: [{ query: { connected: [{ t: 10 }] }, levels: [{ query: { links: [] }, levels: [] }] }]
  }];
  const builder = render(rules);
  const [rule] = builder.getRules();
  assert.deepEqual(rule.query, rules[0].query);
  assert.deepEqual(rule.levels[0].query, rules[0].levels[0].query);
  assert.deepEqual(rule.levels[0].levels[0].query, { links: [] });
  assert.equal(rule.name, 'Person → Place, Area ↔ Records ↔ Records');
});

test('a new rule starts from the data source type; the dialog allows three steps', () => {
  const builder = new HRuleBuilder({ dbdefs }).setRecordTypes([5]);
  builder.attach(document.createElement('div')).render();
  builder._addRoot();
  let row = builder._rows[0];
  assert.deepEqual(builder.getRules()[0].query, { links: [{ t: 5 }] }, 'Person has pointers only');
  for (let level = 2; level <= 4; level += 1) {
    assert.equal(row.addStep.hidden, false);
    row._addChild();
    row = row.children[0];
  }
  assert.equal(row.level, 4);
  assert.equal(row.addStep.hidden, true, 'no step after level 4');
  row._addChild();
  assert.equal(row.children.length, 0);
});

test('related:<field> rules reopen on the relationship field, own or referencing', () => {
  const defs = {
    ...dbdefs,
    fields: (rty) => (Number(rty) === 5 ? [{ id: 22, type: 'relmarker', name: 'Lived in' }] : []),
    fieldGlobal: (id) => (Number(id) === 22 ? { name: 'Lived in', targetTypes: [10], vocabulary: 0 } : null)
  };
  const own = { query: { t: 10, 'related:22': [{ t: 5 }] }, levels: [] };
  const referencing = { query: { t: 5, 'related:22': [{ t: 10 }] }, levels: [] };
  for (const rule of [own, referencing]) {
    const builder = new HRuleBuilder({ dbdefs: defs });
    builder.attach(document.createElement('div')).render();
    builder.setRules([rule]);
    const row = builder._rows[0];
    assert.equal(row._fields.get(row.field.value)?.id, 22, JSON.stringify(rule.query));
    assert.deepEqual(builder.getRules()[0].query, rule.query);
  }
});
