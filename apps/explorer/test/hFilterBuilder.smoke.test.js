import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HFilterBuilder } from '../src/widgets/filter-builder/HFilterBuilder.js';

const VOCAB = JSON.parse(
  readFileSync(new URL('../src/utils/queryVocabulary.json', import.meta.url), 'utf8')
);

// Minimal HDbDefs stand-in - the builder only needs these for construction and
// the DOM-free code paths exercised here.
const dbdefsStub = {
  rectypes: () => [],
  rectypeGroups: () => [],
  languages: () => [],
  fields: () => [],
  fieldName: () => '',
  fieldGlobal: () => null,
  fieldType: () => 'freetext',
  vocabRoot: () => 0,
  termTree: () => [],
  linkedRectypes: () => [],
  pointerFieldsBetween: () => [],
  rectypeName: () => ''
};

test('constructor validates required dependencies', () => {
  assert.throws(() => new HFilterBuilder({}), TypeError);
  assert.throws(() => new HFilterBuilder({ dbdefs: dbdefsStub }), TypeError);
  assert.doesNotThrow(() => new HFilterBuilder({ dbdefs: dbdefsStub, vocabulary: VOCAB }));
});

test('getQuery() on a fresh (unrendered) builder is an empty array', () => {
  const b = new HFilterBuilder({ dbdefs: dbdefsStub, vocabulary: VOCAB });
  assert.deepEqual(b.getQuery(), []);
});

test('setQuery() feeds the model so getQuery() round-trips a simple query', () => {
  const b = new HFilterBuilder({ dbdefs: dbdefsStub, vocabulary: VOCAB });
  b.setQuery([{ t: '10' }, { 'f:12': '=Smith' }]);
  assert.deepEqual(b.getQuery(), [{ t: '10' }, { 'f:12': '=Smith' }]);
});

test('setQuery() keeps unmodellable predicates intact', () => {
  const b = new HFilterBuilder({ dbdefs: dbdefsStub, vocabulary: VOCAB });
  b.setQuery([{ t: '5' }, { 'weird:thing': { deep: 1 } }]);
  assert.deepEqual(b.getQuery(), [{ t: '5' }, { 'weird:thing': { deep: 1 } }]);
});

test('setQuery() accepts keyword syntax from the Query Source editor', () => {
  const builder = new HFilterBuilder({ dbdefs: dbdefsStub, vocabulary: VOCAB });
  builder.setQuery('t:10 f:12:Smith');
  assert.deepEqual(builder.getQuery(), [{ t: '10' }, { 'f:12': 'Smith' }]);
});

test('blank selected values become runtime parameters, but NULL operators do not', () => {
  const builder = new HFilterBuilder({ dbdefs: dbdefsStub, vocabulary: VOCAB });
  builder.model.rows = [
    { type: 'field', dty: 12, kind: 'text', op: 'op.contains', values: [''] },
    { type: 'field', dty: 13, kind: 'text', op: 'op.is_empty', values: [''] }
  ];

  const definition = builder.getDefinition();
  assert.deepEqual(Object.keys(definition.parameters), ['value_0']);
  assert.deepEqual(definition.q, [{ 'f:13': 'NULL' }]);
});

test('an incomplete range keeps its defined endpoint as a form default', () => {
  const builder = new HFilterBuilder({ dbdefs: dbdefsStub, vocabulary: VOCAB });
  builder.model.rows = [
    { type: 'field', dty: 12, kind: 'number', op: 'op.between', values: ['10', ''] }
  ];

  const definition = builder.getDefinition();
  assert.deepEqual(definition.parameters.value_0.default, { from: '10', to: null });
  assert.deepEqual(definition.q, []);
});
