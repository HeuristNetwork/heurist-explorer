import test from 'node:test';
import assert from 'node:assert/strict';
import { HRuleBuilder, decodeRule, encodeRuleQuery, describeExpansionRule } from '../src/widgets/query-source/helpers/HRuleBuilder.js';

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
