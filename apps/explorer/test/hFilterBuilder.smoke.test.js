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

test('values marked "Ask the user" become runtime parameters, but NULL operators do not; a blank fixed value is left out', () => {
  const builder = new HFilterBuilder({ dbdefs: dbdefsStub, vocabulary: VOCAB });
  builder.model.rows = [
    { type: 'field', dty: 12, kind: 'text', op: 'op.contains', values: [''], ask: [true] },
    { type: 'field', dty: 13, kind: 'text', op: 'op.is_empty', values: [''], ask: [true] },
    { type: 'field', dty: 14, kind: 'text', op: 'op.contains', values: [''] },
    // the fixed value is kept for the toggle, the parameter replaces it
    { type: 'field', dty: 15, kind: 'text', op: 'op.contains', values: ['Smith'], ask: [true] }
  ];

  const definition = builder.getDefinition();
  assert.deepEqual(definition, {
    query: [{ 'f:12': '$X1$' }, { 'f:13': 'NULL' }, { 'f:15': '$X2$' }],
    filterForm: null
  });
});

test('a range endpoint is asked separately; the other keeps its fixed value', () => {
  const builder = new HFilterBuilder({ dbdefs: dbdefsStub, vocabulary: VOCAB });
  builder.model.rows = [
    { type: 'field', dty: 12, kind: 'number', op: 'op.between', values: ['10', ''], ask: [false, true] },
    // a blank fixed endpoint: incomplete, left out
    { type: 'field', dty: 13, kind: 'number', op: 'op.between', values: ['10', ''] }
  ];

  const definition = builder.getDefinition();
  assert.deepEqual(definition, { query: [{ 'f:12': '10<>$X1$' }], filterForm: null });
});

test('a parameter read from a query is marked "Ask the user"', () => {
  const builder = new HFilterBuilder({ dbdefs: dbdefsStub, vocabulary: VOCAB });
  builder.setQuery([{ t: '10' }, { 'f:12': '$X3$' }]);
  assert.deepEqual(builder.model.rows[0].ask, [true, false]);
  assert.deepEqual(builder.getQuery(), [{ t: '10' }, { 'f:12': '$X3$' }]);
});

test('setQuery() accepts keyword text inside a {query, filterForm} definition', () => {
  const builder = new HFilterBuilder({ dbdefs: dbdefsStub, vocabulary: VOCAB });
  builder.setQuery({ query: 't:10', filterForm: null });
  assert.deepEqual(builder.getQuery(), [{ t: '10' }]);
});

test('setQuery() loads nested linked text queries and resolves enum labels to term ids', () => {
  const dbdefs = {
    ...dbdefsStub,
    vocabRoot: (dty) => (Number(dty) === 237 ? 5370 : 0),
    termIdByLabel: (root, label) => (root === 5370 && label === 'Lived at' ? 5381 : null)
  };
  const builder = new HFilterBuilder({ dbdefs, vocabulary: VOCAB });
  builder.setQuery({ query: 't:10 lt240(t:48 f:237:"Lived at" lt134(t:12 title:@+athens))', filterForm: null });
  assert.deepEqual(builder.getQuery(), [
    { t: '10' },
    { 'lt:240': [{ t: '48' }, { 'f:237': '5381' }, { 'lt:134': [{ t: '12' }, { title: '@+athens' }] }] }
  ]);
});

test('enum fields offer "is exactly" and round-trip its = token', async () => {
  const { operatorsFor } = await import('../src/utils/vocabHelpers.js');
  assert.ok(operatorsFor(VOCAB, 'enum').some((o) => o.i18nKey === 'op.is_exactly' && o.token === '='));
  const builder = new HFilterBuilder({ dbdefs: dbdefsStub, vocabulary: VOCAB });
  builder.setQuery([{ t: '48' }, { 'f:237': '=5381' }]);
  assert.deepEqual(builder.getQuery(), [{ t: '48' }, { 'f:237': '=5381' }]);
});

test('setQuery() accepts multi-key predicate objects and single-object sub-queries', () => {
  const builder = new HFilterBuilder({ dbdefs: dbdefsStub, vocabulary: VOCAB });
  builder.setQuery({ query: '{"t":10,"lt:134":{"t":12,"title":"Baghdad"}}', filterForm: null });
  assert.deepEqual(builder.getQuery(), [{ t: '10' }, { 'lt:134': [{ t: '12' }, { title: 'Baghdad' }] }]);
  builder.setQuery({ t: 10, 'f:20': 414 });
  assert.deepEqual(builder.getQuery(), [{ t: '10' }, { 'f:20': '414' }]);
});

test('setQuery() resolves record-type and field names to ids', () => {
  const dbdefs = {
    ...dbdefsStub,
    rectypeIdByName: (t) => (/^life event$/i.test(t) ? 48 : null),
    fieldIdByName: (rty, name) => (Number(rty) === 48 && /^date of event$/i.test(name) ? 9 : null)
  };
  const builder = new HFilterBuilder({ dbdefs, vocabulary: VOCAB });
  builder.setQuery('[{"t":"Life event"},{"f:Date of event":"=2026-09-23"}]');
  assert.deepEqual(builder.getQuery(), [{ t: '48' }, { 'f:9': '=2026-09-23' }]);
});

test('several values with a blank one: the defined values are the condition, not a parameter', () => {
  const builder = new HFilterBuilder({ dbdefs: dbdefsStub, vocabulary: VOCAB });
  builder.model.rows = [
    { type: 'field', dty: 20, kind: 'enum', op: 'op.is', values: ['', '415'], valueConj: 'any' },
    { type: 'field', dty: 21, kind: 'enum', op: 'op.is', values: ['', '', '7', '9'], valueConj: 'any' },
    { type: 'field', dty: 22, kind: 'enum', op: 'op.is', values: ['', ''], valueConj: 'any', ask: [true] }
  ];
  assert.deepEqual(builder.getDefinition().query, [{ 'f:20': '415' }, { 'f:21': '7,9' }, { 'f:22': '$X1$' }]);
});

test('"<record type> records is / is not" marked "Ask the user" becomes a parameter; exists / missing do not', () => {
  const builder = new HFilterBuilder({ dbdefs: dbdefsStub, vocabulary: VOCAB });
  const branch = (op) => ({ type: 'link', link: 'lt', dty: 240, targetRty: 12, conjunction: 'all',
    rows: [{ type: 'field', dty: 'exists', kind: 'exists', selected: true, op, values: [''], valueConj: 'any', ask: [true] }] });
  builder.model.rows = [branch('op.is'), branch('op.is_not'), branch('op.exists')];
  assert.deepEqual(builder.getDefinition().query, [
    { 'lt:240': [{ t: '12' }, { ids: '$X1$' }] },
    { 'lt:240': [{ t: '12' }, { ids: '-$X2$' }] },
    // records exist: the branch itself (no exists entry)
    { 'lt:240': [{ t: '12' }] }
  ]);
});

test('a linked-record parameter reads back into the records row and keeps its name', () => {
  const builder = new HFilterBuilder({ dbdefs: dbdefsStub, vocabulary: VOCAB });
  const query = [{ t: '10' }, { 'lt:240': [{ t: '12' }, { ids: '-$X2$' }] }];
  builder.setQuery({ query, filterForm: null });
  const row = builder.model.rows[0].rows[0];
  assert.equal(row.dty, 'exists');
  assert.equal(row.op, 'op.is_not');
  assert.deepEqual(builder.getDefinition().query, query);
});

test('a tag condition marked "Ask the user" becomes a parameter', () => {
  const builder = new HFilterBuilder({ dbdefs: dbdefsStub, vocabulary: VOCAB });
  builder.model.rows = [
    { type: 'field', dty: 'tag', kind: 'tag', selected: true, op: 'op.is', values: [''], ask: [true] },
    { type: 'field', dty: 'tag', kind: 'tag', selected: true, op: 'op.is_not', values: [''], ask: [true] },
    { type: 'field', dty: 'tag', kind: 'tag', selected: true, op: 'op.is_set', values: [''], ask: [true] }
  ];
  assert.deepEqual(builder.getDefinition().query, [{ tag: '$X1$' }, { tag: '-$X2$' }, { tag: '-NULL' }]);
});

test('a "-" prefix opens as the "is not" operator, and another operator drops it', () => {
  const dbdefs = { ...dbdefsStub, fieldType: (rty, dty) => (Number(dty ?? rty) === 20 ? 'enum' : Number(dty ?? rty) === 9 ? 'date' : 'freetext') };
  const builder = new HFilterBuilder({ dbdefs, vocabulary: VOCAB });
  const query = [{ t: '10' }, { 'f:20': '-415' }, { tag: '-1,6' }, { owner: '-2' }, { 'f:9': '-2020' }];
  builder.setQuery(query);
  const [enumRow, tagRow, ownerRow, dateRow] = builder.model.rows;
  for (const row of [enumRow, tagRow]) {
    assert.equal(row.op, 'op.is_not');
    assert.equal(row.negate, false);
  }
  assert.equal(ownerRow.negate, false);
  assert.equal(dateRow.negate, true, 'a negative year keeps its sign');
  assert.deepEqual(builder.getQuery(), query);
  enumRow.op = 'op.is';
  tagRow.op = 'op.is';
  assert.deepEqual(builder.getQuery().slice(1, 3), [{ 'f:20': '415' }, { tag: '1,6' }]);
});

test('a relation type marked "Ask the user" becomes a parameter', () => {
  const builder = new HFilterBuilder({ dbdefs: dbdefsStub, vocabulary: VOCAB });
  builder.model.rows = [{ type: 'link', link: 'related', dty: 109, targetRty: 10, conjunction: 'all',
    rows: [{ type: 'field', dty: 'reltype', kind: 'term', rel: true, selected: true, op: 'op.is', values: [''], ask: [true] }] }];
  assert.deepEqual(builder.getDefinition().query, [{ 'related:109': [{ t: '10' }, { r: '$X1$' }] }]);
});

test('an enum sub-part (f:20:code) round-trips as a text value, not a term id (2026-10-17)', async () => {
  const { rowForPath } = await import('../src/widgets/filter-builder/HFilterBuilder.js');
  const dbdefs = { ...dbdefsStub, fieldType: (rty, dty) => (Number(dty ?? rty) === 20 ? 'enum' : 'freetext') };
  const builder = new HFilterBuilder({ dbdefs, vocabulary: VOCAB });
  builder.setQuery([{ t: '10' }, { 'f:20:code': '=F' }]);
  assert.deepEqual(builder.getQuery(), [{ t: '10' }, { 'f:20:code': '=F' }]);
  // an "enum fields" leaf of the field tree
  const row = rowForPath([{ dty: 20, fieldType: 'enum', term: 'code' }], VOCAB);
  assert.equal(row.enumField, 'code');
  assert.equal(row.kind, 'text');
  assert.equal(rowForPath([{ dty: 20, fieldType: 'enum', term: 'internalid' }], VOCAB).enumField, null);
});

test('enum fields in the tree: "term" is the field itself; code / concept id / description are sub-parts (2026-10-17)', async () => {
  const { rowForPath } = await import('../src/widgets/filter-builder/HFilterBuilder.js');
  // the leaf of an enum field while "enum fields" is off, and the Term output
  const term = rowForPath([{ dty: 20, fieldType: 'enum', term: 'term' }], VOCAB);
  assert.equal(term.enumField, null);
  assert.equal(term.kind, 'enum');
  for (const part of ['code', 'conceptid', 'desc']) {
    const row = rowForPath([{ dty: 20, fieldType: 'enum', term: part }], VOCAB);
    assert.equal(row.enumField, part);
    assert.equal(row.kind, 'text');
  }
});

test('code and concept id compose as is (=) / is not (-) (2026-10-17)', async () => {
  const { composeQuery, emptyFieldRow } = await import('../src/utils/queryModel.js');
  const model = (enumField, op) => ({ rtyId: 10, conjunction: 'all', sort: [],
    rows: [emptyFieldRow({ dty: 20, kind: 'text', enumField, op, selected: true, values: ['F'] })] });
  assert.deepEqual(composeQuery(model('code', 'op.is'), VOCAB)[1], { 'f:20:code': '=F' });
  assert.deepEqual(composeQuery(model('code', 'op.is_not'), VOCAB)[1], { 'f:20:code': '-F' });
  assert.deepEqual(composeQuery(model('conceptid', 'op.is'), VOCAB)[1], { 'f:20:conceptid': '=F' });
});
