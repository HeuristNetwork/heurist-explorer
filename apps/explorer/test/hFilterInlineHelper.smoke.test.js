import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HFilterInlineHelper } from '../src/widgets/filter-builder/HFilterInlineHelper.js';

const VOCAB = JSON.parse(
  readFileSync(new URL('../src/utils/queryVocabulary.json', import.meta.url), 'utf8')
);

const DBDEFS = {
  rectypes: () => [
    { id: 10, name: 'Person', type: undefined },
    { id: 12, name: 'Place' }
  ],
  rectypeIdByName: (t) => ({ person: 10, place: 12 }[String(t).toLowerCase()] || null),
  fields: (rty) => (rty === 10
    ? [{ id: 12, name: 'Family name', type: 'freetext' }, { id: 9, name: 'Status', type: 'enum' }]
    : []),
  fieldIdByName: (_rty, name) => ({ 'family name': 12, status: 9 }[String(name).toLowerCase()] || null),
  fieldType: (_rty, dty) => ({ 12: 'freetext', 9: 'enum' }[dty] || 'freetext'),
  vocabRoot: (dty) => (dty === 9 ? 500 : 0),
  termTree: () => [{ id: 501, label: 'Active' }, { id: 502, label: 'Retired' }]
};

const helper = () => new HFilterInlineHelper({ vocabulary: VOCAB, dbdefs: DBDEFS });
const labels = (plan) => plan.items.map((i) => i.label);

test('constructor requires a vocabulary', () => {
  assert.throws(() => new HFilterInlineHelper({}), TypeError);
});

test('first token -> record types + record properties', () => {
  const plan = helper()._computeHints('', 0);
  assert.ok(labels(plan).includes('Person'));
  assert.ok(labels(plan).includes('title'));
  assert.equal(plan.items.find((i) => i.label === 'Person').insert, 't:10 ');
});

test('first token is prefix-filtered', () => {
  const plan = helper()._computeHints('Pla', 3);
  assert.deepEqual(labels(plan).slice(0, 1), ['Place']);
});

test('after t:<id> -> that record type\'s fields', () => {
  const plan = helper()._computeHints('t:10 fam', 8);
  assert.ok(labels(plan).includes('Family name'));
  assert.equal(plan.items.find((i) => i.label === 'Family name').insert, 'f:9:'.replace('9', '12'));
});

test('t: value stage suggests record types', () => {
  const plan = helper()._computeHints('t:pe', 4);
  assert.deepEqual(labels(plan), ['Person']);
  assert.equal(plan.items[0].insert, 't:10 ');
});

test('after a field key -> operators', () => {
  const plan = helper()._computeHints('t:10 f:12:', 10);
  const ops = plan.items.map((i) => i.insert);
  assert.ok(ops.some((s) => s.startsWith('f:12:')));
  assert.ok(plan.items.some((i) => /contains|is/.test(i.label)));
});

test('enum field -> term values', () => {
  const plan = helper()._computeHints('t:10 f:9:', 9);
  assert.ok(labels(plan).includes('Active'));
  assert.equal(plan.items.find((i) => i.label === 'Active').insert, 'f:9:Active ');
});

test('no hints without dbdefs', () => {
  const h = new HFilterInlineHelper({ vocabulary: VOCAB });
  assert.equal(h._computeHints('t:10 ', 5)?.items?.length ?? 0, 0);
});
