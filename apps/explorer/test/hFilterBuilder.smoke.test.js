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
