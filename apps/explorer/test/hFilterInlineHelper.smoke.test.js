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

const LINKED_DBDEFS = {
  ...DBDEFS,
  fields: (rty) => (rty === 10
    ? [{ id: 12, name: 'Family name', type: 'freetext' }, { id: 134, name: 'Birth place', type: 'resource' }]
    : (rty === 12 ? [{ id: 1, name: 'Place name', type: 'freetext' }] : [])),
  field: (_rty, dty) => (dty === 134 ? { id: 134, type: 'resource', targetTypes: [12] } : null),
  termTree: () => ({
    id: 500,
    children: [
      { id: 501, label: 'Active', children: [{ id: 511, label: 'Part time' }] },
      { id: 502, label: 'Retired' }
    ]
  })
};
const linkedHelper = () => new HFilterInlineHelper({ vocabulary: VOCAB, dbdefs: LINKED_DBDEFS });

test('resource field inserts a linked sub-query with the caret inside it', () => {
  const item = linkedHelper()._computeHints('t:10 bir', 8).items.find((i) => i.label === 'Birth place');
  assert.equal(item.insert, 'lt134(t:12 )');
  assert.equal(item.caretBack, 1);
});

test('inside lt(...) -> fields of the linked record type', () => {
  const text = 't:10 lt134(t:12 )';
  const plan = linkedHelper()._computeHints(text, text.length - 1);
  assert.ok(labels(plan).includes('Place name'));
  assert.ok(!labels(plan).includes('Family name'));
});

test('after a closed lt(...) group -> outer record type again', () => {
  const text = 't:10 lt134(t:12 f:1:x) ';
  assert.ok(labels(linkedHelper()._computeHints(text, text.length)).includes('Family name'));
});

test('bare f: lists the scope record type fields', () => {
  assert.ok(labels(linkedHelper()._computeHints('t:10 f:', 7)).includes('Family name'));
});

test('enum terms include every level, indented', () => {
  const plan = linkedHelper()._computeHints('t:10 f:9:', 9);
  const sub = plan.items.find((i) => i.label === 'Part time');
  assert.ok(sub);
  assert.equal(sub.depth, 1);
  assert.equal(sub.insert, 'f:9:"Part time" ');
});

test('geo fields insert geo:<id>: and then offer the match mode', () => {
  const dbdefs = {
    ...DBDEFS,
    fields: () => [{ id: 28, name: 'Location', type: 'geo' }]
  };
  const h = new HFilterInlineHelper({ vocabulary: VOCAB, dbdefs });
  assert.equal(h._computeHints('t:12 loc', 8).items.find((i) => i.label === 'Location').insert, 'geo:28:');
  const modes = h._computeHints('t:12 geo:28:', 12).items.map((i) => i.insert);
  assert.deepEqual(modes, ['geo:28:intersects:', 'geo:28:within:']);
});

test('relmarker fields insert a bidirectional related( … ) sub-query', () => {
  const dbdefs = {
    ...DBDEFS,
    fields: () => [{ id: 235, name: 'Related Person(s)', type: 'relmarker' }],
    field: () => ({ id: 235, type: 'relmarker', targetTypes: [10] })
  };
  const item = new HFilterInlineHelper({ vocabulary: VOCAB, dbdefs })._computeHints('t:10 rel', 8)
    .items.find((i) => i.label === 'Related Person(s)');
  assert.equal(item.insert, 'related(t:10 )');
  assert.equal(item.caretBack, 1);
});

test('inside related( … ): Relation type is offered and r: lists relation types as ids', () => {
  const dbdefs = {
    ...DBDEFS,
    fields: (rty) => (rty === 10 ? [{ id: 235, name: 'Related Person(s)', type: 'relmarker' }, { id: 12, name: 'Family name', type: 'freetext' }] : []),
    fieldGlobal: (id) => (id === 235 ? { targetTypes: [10] } : {}),
    vocabRoot: (id) => (id === 235 ? 3110 : 0),
    termTree: () => ({ id: 3110, children: [{ id: 3115, label: 'IsGrandParentOf' }, { id: 3116, label: 'IsGrandChildOf' }] })
  };
  const h = new HFilterInlineHelper({ vocabulary: VOCAB, dbdefs });
  const inRel = h._computeHints('t:10 related(t:10 ', 19).items;
  assert.equal(inRel[0].label, 'Relation type');
  assert.equal(inRel[0].insert, 'r:');
  assert.ok(!h._computeHints('t:10 lt235(t:10 ', 16).items.some((i) => i.label === 'Relation type'));
  const types = h._computeHints('t:10 related(t:10 r:grandc', 26).items;
  assert.deepEqual(types.map((i) => i.insert), ['r:3116 ']);
  assert.deepEqual(h._computeHints('t:10 related(t:10 r:3115,', 25).items.map((i) => i.insert), ['r:3115,3115 ', 'r:3115,3116 ']);
});

test('applying a hint raises an input event so the sentence follows the inserted text', () => {
  const h = new HFilterInlineHelper({ vocabulary: VOCAB, dbdefs: DBDEFS });
  const events = [];
  h.input = {
    value: 't:10 related(t:10 r:iswi', selectionStart: 24,
    setSelectionRange() {}, focus() {},
    dispatchEvent: (event) => events.push(event.type)
  };
  h._tokenStart = 18;   // start of "r:iswi"
  h._applyHint({ insert: 'r:5368 ' });
  assert.equal(h.input.value, 't:10 related(t:10 r:5368 ');
  assert.deepEqual(events, ['input']);
});
