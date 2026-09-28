import test from 'node:test';
import assert from 'node:assert/strict';
import { HRuleBuilder, decodeRule, encodeRuleQuery, describeExpansionRule, fieldOptionGroups, linkTargets, rectypeOptionGroups, ANY_TYPE } from '../src/widgets/query-source/helpers/HRuleBuilder.js';

const dbdefs = {
  rectypes: () => [{ id: 5, name: 'Person' }, { id: 10, name: 'Place' }],
  rectypeName: (id) => ({ 5: 'Person', 10: 'Place' }[id] || ''),
  fields: () => [], fieldGlobal: () => null, termTree: () => []
};

test('HRuleBuilder requires dbdefs', () => {
  assert.throws(() => new HRuleBuilder(), TypeError);
  assert.doesNotThrow(() => new HRuleBuilder({ dbdefs }));
});

test('legacy-style direct pointer rule round-trips through decoder/encoder', () => {
  const rule = { query: { t: 10, 'lf:15': [{ t: 5 }], 'f:1': 'Smith' }, levels: [] };
  const data = decodeRule(rule);
  assert.deepEqual({ source: data.source, target: data.target, fieldId: data.fieldId, kind: data.kind },
    { source: 5, target: 10, fieldId: 15, kind: 'lf' });
  assert.deepEqual(encodeRuleQuery({
    source: data.source, target: data.target, relation: data.relation, filter: data.filter,
    selected: { id: data.fieldId, reverse: false, isRelation: false }
  }), rule.query);
});

test('reverse relationship preserves relation term and extra filter', () => {
  const query = encodeRuleQuery({
    source: 5, target: 10, relation: 77, filter: '[{"plain":"abc"}]',
    selected: { id: 22, reverse: true, isRelation: true }
  });
  assert.deepEqual(query, { t: 10, 'rt:22': [{ t: 5 }, { r: 77 }], plain: 'abc' });
  const decoded = decodeRule({ query, levels: [] });
  assert.equal(decoded.fieldKey, '22r10');
  assert.equal(decoded.relation, 77);
  assert.equal(decoded.filter, 'abc');
});

test('generic links rule is supported without a selected field', () => {
  assert.deepEqual(encodeRuleQuery({ source: 5, target: 10, selected: null, filter: '' }),
    { t: 10, links: [{ t: 5 }] });
});

test('generic related rule can be preserved explicitly', () => {
  assert.deepEqual(encodeRuleQuery({ source: 5, target: 10, selected: null, kindOverride: 'related' }),
    { t: 10, related: [{ t: 5 }] });
});

test('local rule description matches legacy arrow semantics', () => {
  const labels = describeExpansionRule({ query: { t: 10, 'lf:15': [{ t: 5 }] }, levels: [] }, {
    rectypeName: (id) => ({ 5: 'Person', 10: 'Place' }[id] || ''),
    fieldGlobal: (id) => id === 15 ? { name: 'Birth place' } : null
  });
  assert.equal(labels.name, 'Person → Place');
  assert.equal(labels.description, 'Person → Birth place → Place');
});

test('any source record type encodes an empty parent query and decodes back', () => {
  const query = encodeRuleQuery({ source: 0, target: 10, selected: { generic: 'lf' } });
  assert.deepEqual(query, { t: 10, lf: [] });
  const decoded = decodeRule({ query, levels: [] });
  assert.equal(decoded.source, 0);
  assert.equal(decoded.fieldKey, 'any:lf');
});

test('connected is a generic traversal without a field', () => {
  assert.deepEqual(encodeRuleQuery({ source: 5, target: 0, selected: { generic: 'connected' } }), { connected: [{ t: 5 }] });
  assert.equal(decodeRule({ query: { connected: [{ t: 5 }] } }).fieldKey, 'any:connected');
  const labels = describeExpansionRule({ query: { t: 10, connected: [] }, levels: [] }, {
    rectypeName: (id) => ({ 10: 'Place' }[id] || ''), fieldGlobal: () => null
  });
  assert.equal(labels.name, 'Records ↔ Place');
  assert.equal(labels.description, 'Records ↔ Any pointer or relationship ↔ Place');
});

const fields = new Map([
  ['15', { key: '15', id: 15, reverse: false, isRelation: false, targets: [10] }],
  ['22', { key: '22', id: 22, reverse: false, isRelation: true, targets: [5] }],
  ['40r12', { key: '40r12', id: 40, reverse: true, isRelation: false, targets: [12] }]
]);
const values = (group) => group.options.map((option) => option.value);

test('field groups: generic first, then own pointers/relationships, then referenced by', () => {
  const groups = fieldOptionGroups(fields);
  assert.deepEqual(groups.map((group) => group.label),
    ['Any', 'Pointers > and Relationships >>', 'Referenced by']);
  assert.deepEqual(values(groups[0]), ['any:connected', 'any:links', 'any:lf', 'any:lt', 'any:related']);
  assert.deepEqual(values(groups[1]), ['15', '22']);
  assert.deepEqual(values(groups[2]), ['40r12']);
});

test('field groups drop the parts a record type does not have', () => {
  const pointersOnly = new Map([['15', fields.get('15')]]);
  const groups = fieldOptionGroups(pointersOnly);
  assert.deepEqual(groups.map((group) => group.label), ['Any', 'Pointers >']);
  assert.deepEqual(values(groups[0]), ['any:links', 'any:lf']);
  // a loaded rule keeps its traversal
  assert.ok(values(fieldOptionGroups(pointersOnly, { keep: 'any:rt' })[0]).includes('any:rt'));
});

test('any source offers only the generic traversals', () => {
  const groups = fieldOptionGroups(new Map(), { anySource: true });
  assert.equal(groups.length, 1);
  assert.deepEqual(values(groups[0]), ['any:connected', 'any:links', 'any:lf', 'any:lt', 'any:related']);
});

test('generic traversal targets come from the matching fields', () => {
  const all = () => [5, 10, 12, 20];
  assert.deepEqual(linkTargets({ generic: 'lf' }, fields, all), [10]);
  assert.deepEqual(linkTargets({ generic: 'links' }, fields, all).sort(), [10, 12]);
  assert.deepEqual(linkTargets({ generic: 'related' }, fields, all), [5]);
  assert.deepEqual(linkTargets({ generic: 'connected' }, new Map(), all), [5, 10, 12, 20]);
  assert.deepEqual(linkTargets(fields.get('15'), fields, all), [10]);
});

test('source list: any, current data source, then rectype groups sorted by name', () => {
  const defs = {
    rectypes: () => [
      { id: 5, name: 'Person', group: 1 }, { id: 3, name: 'Event', group: 1 },
      { id: 10, name: 'Place', group: 2 }, { id: 12, name: 'Area', group: 2 }
    ],
    rectypeGroups: () => [{ id: 1, name: 'People' }, { id: 2, name: 'Places' }],
    rectypeName: () => ''
  };
  const groups = rectypeOptionGroups(defs, { priority: [10], any: true, offered: (id) => id !== 3 });
  assert.deepEqual(groups.map((group) => [group.label, values(group)]), [
    ['', [ANY_TYPE]],
    ['Current data source', ['10']],
    ['People', ['5']],
    ['Places', ['12']]
  ]);
});
