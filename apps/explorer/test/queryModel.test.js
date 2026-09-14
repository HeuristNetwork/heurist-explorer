import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  composeQuery,
  parseQuery,
  emptyModel,
  emptyFieldRow
} from '../src/utils/queryModel.js';

const VOCAB = JSON.parse(
  readFileSync(new URL('../src/utils/queryVocabulary.json', import.meta.url), 'utf8')
);

const compose = (model) => composeQuery(model, VOCAB);
const model = (over = {}) => ({ ...emptyModel(), ...over });
const fieldRow = (over = {}) => emptyFieldRow(over);

// ------------------------------------------------------------------- compose ---

test('empty model composes to an empty array', () => {
  assert.deepEqual(compose(emptyModel()), []);
});

test('rectype only', () => {
  assert.deepEqual(compose(model({ rtyId: 10 })), [{ t: '10' }]);
  assert.deepEqual(compose(model({ rtyId: '' })), []); // "any" adds no t:
});

test('text operators render the right token / pattern', () => {
  const row = (op) => model({ rows: [fieldRow({ dty: 12, kind: 'text', op, values: ['Smith'] })] });
  assert.deepEqual(compose(row('op.contains')), [{ 'f:12': 'Smith' }]);
  assert.deepEqual(compose(row('op.exact')), [{ 'f:12': '=Smith' }]);
  assert.deepEqual(compose(row('op.exact_cs')), [{ 'f:12': '==Smith' }]);
  assert.deepEqual(compose(row('op.starts_with')), [{ 'f:12': 'Smith%' }]);
  assert.deepEqual(compose(row('op.ends_with')), [{ 'f:12': '%Smith' }]);
  assert.deepEqual(compose(row('op.all_words')), [{ 'f:12': '@+Smith' }]);
  assert.deepEqual(compose(row('op.no_words')), [{ 'f:12': '@-Smith' }]);
  assert.deepEqual(compose(row('op.not_contains')), [{ 'f:12': '-Smith' }]);
});

test('number operators', () => {
  const row = (op, values) => model({ rows: [fieldRow({ dty: 5, kind: 'number', op, values })] });
  assert.deepEqual(compose(row('op.equals', ['1900'])), [{ 'f:5': '1900' }]);
  assert.deepEqual(compose(row('op.gte', ['1900'])), [{ 'f:5': '>=1900' }]);
  assert.deepEqual(compose(row('op.lt', ['1900'])), [{ 'f:5': '<1900' }]);
  assert.deepEqual(compose(row('op.between', ['1900', '1950'])), [{ 'f:5': '1900<>1950' }]);
});

test('date range operators consume two values into one predicate', () => {
  const row = (op) => model({ rows: [fieldRow({ dty: 10, kind: 'date', op, values: ['1900', '1950'] })] });
  assert.deepEqual(compose(row('op.overlaps')), [{ 'f:10': '1900<>1950' }]);
  assert.deepEqual(compose(row('op.within_range')), [{ 'f:10': '><1900/1950' }]);
});

test('enum: single, OR-collapsed multi, AND multi', () => {
  const base = { dty: 19, kind: 'enum', op: 'op.is' };
  assert.deepEqual(
    compose(model({ rows: [fieldRow({ ...base, values: ['5'] })] })),
    [{ 'f:19': '5' }]
  );
  assert.deepEqual(
    compose(model({ rows: [fieldRow({ ...base, values: ['5', '6'], valueConj: 'any' })] })),
    [{ 'f:19': '5,6' }]
  );
  assert.deepEqual(
    compose(model({ rows: [fieldRow({ ...base, values: ['5', '6'], valueConj: 'all' })] })),
    [{ all: [{ 'f:19': '5' }, { 'f:19': '6' }] }]
  );
});

test('enum sub-part goes into the key', () => {
  assert.deepEqual(
    compose(model({ rows: [fieldRow({ dty: 19, kind: 'enum', enumField: 'term', op: 'op.is', values: ['Paris'] })] })),
    [{ 'f:19:term': 'Paris' }]
  );
});

test('NULL / -NULL whole-token operators ignore user input', () => {
  assert.deepEqual(
    compose(model({ rows: [fieldRow({ dty: 12, kind: 'text', op: 'op.is_empty', values: ['ignored'] })] })),
    [{ 'f:12': 'NULL' }]
  );
  assert.deepEqual(
    compose(model({ rows: [fieldRow({ dty: 12, kind: 'text', op: 'op.is_set' })] })),
    [{ 'f:12': '-NULL' }]
  );
});

test('top-level conjunction any wraps the rows', () => {
  const rows = [
    fieldRow({ dty: 12, kind: 'text', op: 'op.contains', values: ['a'] }),
    fieldRow({ dty: 13, kind: 'text', op: 'op.contains', values: ['b'] })
  ];
  assert.deepEqual(compose(model({ conjunction: 'any', rows })), [
    { any: [{ 'f:12': 'a' }, { 'f:13': 'b' }] }
  ]);
  assert.deepEqual(compose(model({ conjunction: 'all', rows })), [{ 'f:12': 'a' }, { 'f:13': 'b' }]);
});

test('header keyword rows', () => {
  assert.deepEqual(
    compose(model({ rows: [fieldRow({ dty: 'added', kind: 'date', op: 'op.on_or_after', values: ['2020-01-01'] })] })),
    [{ added: '>=2020-01-01' }]
  );
  assert.deepEqual(
    compose(model({ rows: [fieldRow({ dty: 'anyfield', kind: 'text', op: 'op.contains', values: ['x'] })] })),
    [{ f: 'x' }]
  );
});

test('single-level linked subquery', () => {
  const linkRow = {
    type: 'link',
    link: 'lf',
    dty: 134,
    targetRty: 12,
    conjunction: 'all',
    rows: [fieldRow({ dty: 26, kind: 'text', op: 'op.contains', values: ['Paris'] })]
  };
  assert.deepEqual(compose(model({ rtyId: 10, rows: [linkRow] })), [
    { t: '10' },
    { 'lf:134': [{ t: '12' }, { 'f:26': 'Paris' }] }
  ]);
});

test('linked subquery with any-conjunction sub-rows', () => {
  const linkRow = {
    type: 'link', link: 'lt', dty: 200, targetRty: '', conjunction: 'any',
    rows: [
      fieldRow({ dty: 1, kind: 'text', op: 'op.contains', values: ['a'] }),
      fieldRow({ dty: 2, kind: 'text', op: 'op.contains', values: ['b'] })
    ]
  };
  assert.deepEqual(compose(model({ rows: [linkRow] })), [
    { 'lt:200': [{ any: [{ 'f:1': 'a' }, { 'f:2': 'b' }] }] }
  ]);
});

test('sort entries append as sortby', () => {
  const m = model({
    rtyId: 10,
    rows: [fieldRow({ dty: 12, kind: 'text', op: 'op.contains', values: ['x'] })],
    sort: [{ field: 'modified', dir: 'desc' }, { field: 12, dir: 'asc' }]
  });
  assert.deepEqual(compose(m), [
    { t: '10' }, { 'f:12': 'x' }, { sortby: '-modified' }, { sortby: '12' }
  ]);
});

test('rows with no value are dropped', () => {
  assert.deepEqual(
    compose(model({ rtyId: 10, rows: [fieldRow({ dty: 12, kind: 'text', op: 'op.contains', values: [''] })] })),
    [{ t: '10' }]
  );
});

// --------------------------------------------------------------------- parse ---

test('parse: rectype + simple field', () => {
  const m = parseQuery([{ t: '10' }, { 'f:12': '=Smith' }]);
  assert.equal(m.rtyId, '10');
  assert.equal(m.rows.length, 1);
  assert.equal(m.rows[0].dty, 12);
  assert.equal(m.rows[0].opToken, '=');
  assert.deepEqual(m.rows[0].values, ['Smith']);
  assert.equal(m.rows[0].negate, false);
});

test('parse: negation prefix', () => {
  const m = parseQuery([{ 'f:12': '-Smith' }]);
  assert.equal(m.rows[0].negate, true);
  assert.equal(m.rows[0].opToken, '');
  assert.deepEqual(m.rows[0].values, ['Smith']);
});

test('parse: NULL operators', () => {
  assert.equal(parseQuery([{ 'f:12': 'NULL' }]).rows[0].op, 'op.is_empty');
  assert.equal(parseQuery([{ 'f:12': '-NULL' }]).rows[0].op, 'op.is_set');
});

test('parse: enum sub-part suffix', () => {
  const m = parseQuery([{ 'f:19:term': 'Paris' }]);
  assert.equal(m.rows[0].dty, 19);
  assert.equal(m.rows[0].enumField, 'term');
});

test('parse: comma list becomes a multi-value OR row', () => {
  const m = parseQuery([{ 'f:19': '5,6,7' }]);
  assert.deepEqual(m.rows[0].values, ['5', '6', '7']);
  assert.equal(m.rows[0].valueConj, 'any');
});

test('parse: top-level any wrapper', () => {
  const m = parseQuery([{ any: [{ 'f:12': 'a' }, { 'f:13': 'b' }] }]);
  assert.equal(m.conjunction, 'any');
  assert.equal(m.rows.length, 2);
});

test('parse: single-level linked subquery', () => {
  const m = parseQuery([{ 'lf:134': [{ t: '12' }, { 'f:26': 'Paris' }] }]);
  assert.equal(m.rows.length, 1);
  assert.equal(m.rows[0].type, 'link');
  assert.equal(m.rows[0].link, 'lf');
  assert.equal(m.rows[0].dty, 134);
  assert.equal(m.rows[0].targetRty, '12');
  assert.equal(m.rows[0].rows[0].dty, 26);
});

test('parse: sortby', () => {
  const m = parseQuery([{ t: '10' }, { sortby: '-modified' }, { sortby: '12' }]);
  assert.deepEqual(m.sort, [{ field: 'modified', dir: 'desc' }, { field: 12, dir: 'asc' }]);
});

test('parse: JSON string and {q:[…]} envelope', () => {
  assert.equal(parseQuery('[{"t":"10"}]').rtyId, '10');
  assert.equal(parseQuery({ q: [{ t: '7' }] }).rtyId, '7');
  assert.deepEqual(parseQuery('not json').rows, []);
});

test('parse: unmodellable predicates are kept in unsupported', () => {
  const m = parseQuery([{ t: '10' }, { 'weird:thing': { deep: 1 } }]);
  assert.equal(m.rows.length, 0);
  assert.ok(Array.isArray(m.unsupported) && m.unsupported.length === 1);
  // and compose re-appends them so nothing is silently lost
  assert.deepEqual(compose(m), [{ t: '10' }, { 'weird:thing': { deep: 1 } }]);
});

// ---------------------------------------------------------------- round-trip ---

test('compose -> parse -> compose is stable for common shapes', () => {
  const cases = [
    [{ t: '10' }, { 'f:12': '=Smith' }],
    [{ 'f:12': '-Smith' }],
    [{ 'f:19': '5,6' }],
    [{ 'f:5': '>=1900' }],
    [{ 'f:12': 'NULL' }],
    [{ t: '10' }, { 'lf:134': [{ t: '12' }, { 'f:26': 'Paris' }] }, { sortby: '-modified' }]
  ];
  for (const q of cases) {
    const once = compose(parseQuery(q));
    const twice = compose(parseQuery(once));
    assert.deepEqual(twice, once, `unstable: ${JSON.stringify(q)}`);
  }
});
