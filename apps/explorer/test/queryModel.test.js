import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  composeQuery,
  parseQuery,
  emptyModel,
  emptyFieldRow
} from '../src/utils/queryModel.js';
import { rowForPath } from '../src/widgets/filter-builder/HFilterBuilder.js';

const VOCAB = JSON.parse(
  readFileSync(new URL('../src/utils/queryVocabulary.json', import.meta.url), 'utf8')
);

const compose = (model) => composeQuery(model, VOCAB);
const model = (over = {}) => ({ ...emptyModel(), ...over });
const fieldRow = (over = {}) => emptyFieldRow(over);

test('one-predicate JSON objects are accepted as a query', () => {
  assert.deepEqual(compose(parseQuery('{"t":"112"}', VOCAB)), [{ t: '112' }]);
  assert.deepEqual(compose(parseQuery({ t: '112' }, VOCAB)), [{ t: '112' }]);
});

test('owner and visibility is/not is operators compile to header predicates', () => {
  assert.deepEqual(compose(model({ rows: [fieldRow({ dty: 'owner', op: 'op.is', values: ['2'] })] })),
    [{ owner: '2' }]);
  assert.deepEqual(compose(model({ rows: [fieldRow({ dty: 'access', op: 'op.is_not', values: ['hidden'] })] })),
    [{ access: '-hidden' }]);
});

test('creator is/not is and geographic fields use their dedicated predicates', () => {
  assert.deepEqual(compose(model({ rows: [fieldRow({ dty: 'addedby', op: 'op.is_not', values: ['3'] })] })),
    [{ addedby: '-3' }]);
  const wkt = 'POLYGON((10 -5,20 -5,20 8,10 8,10 -5))';
  // a new geo row defaults to intersects; the mode is always written into the key
  const query = [{ t: '10' }, { 'geo:28:intersects': wkt }];
  assert.deepEqual(compose(model({ rtyId: 10, rows: [fieldRow({ dty: 28, kind: 'geo', values: [wkt] })] })), query);
  assert.deepEqual(compose(parseQuery(query, VOCAB)), query);
});

test('nested field-tree paths retain every intermediate link', () => {
  const path = [
    { via: { link: 'lt', dty: 240, targetRty: 48 } },
    { via: { link: 'lt', dty: 134, targetRty: 12 } },
    { dty: 1, fieldType: 'freetext' }
  ];
  assert.deepEqual(rowForPath(path, VOCAB), {
    type: 'link', link: 'lt', dty: 240, targetRty: 48, conjunction: 'all', rows: [{
      type: 'link', link: 'lt', dty: 134, targetRty: 12, conjunction: 'all', rows: [
        fieldRow({ dty: 1, selected: true, kind: 'text', op: null })
      ]
    }]
  });
});

test('nested linked predicates retain every intermediate record type', () => {
  const query = [{ t: '10' }, { 'lt:240': [
    { t: '48' }, { 'lt:134': [{ t: '12' }, { 'f:1': 'Athens' }] }
  ] }];
  assert.deepEqual(compose(parseQuery(query, VOCAB)), query);
});

test('field count and any-field predicates round-trip through the Builder model', () => {
  const query = [{ t: '10' }, { 'fc:20': '>2' }, { f: 'Smith' }];
  assert.deepEqual(compose(parseQuery(query, VOCAB)), query);
});

test('linked record existence and missing predicates round-trip', () => {
  for (const value of ['', 'NULL']) {
    const query = [{ t: '10' }, { 'lt:134': [{ t: '12' }, { exists: value }] }];
    assert.deepEqual(compose(parseQuery(query, VOCAB)), query);
  }
});

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
  assert.deepEqual(compose(row('op.overlaps')), [{ 'f:10': '<>1900/1950' }]);
  assert.deepEqual(compose(row('op.within_range')), [{ 'f:10': '><1900/1950' }]);
});

test('date range predicates (prefixed <>/><) round-trip without duplicating a value', () => {
  // parseQuery cannot infer field kind from the raw key alone; the Builder
  // reconciles it from dbdefs (see HFilterBuilderItem.setRowModel), so this
  // mirrors that step to exercise the actual reopen/re-save round-trip.
  for (const query of [
    [{ t: '10' }, { 'f:10': '<>$X1$/$X3$' }],
    [{ t: '10' }, { 'f:10': '><$X1$/$X3$' }]
  ]) {
    const parsed = parseQuery(query, VOCAB);
    parsed.rows[0].kind = 'date';
    assert.deepEqual(parsed.rows[0].values, ['$X1$', '$X3$']);
    assert.deepEqual(compose(parsed), query);
  }
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

test('three linked levels round-trip with nested field predicates', () => {
  const query = [{ 'lt:240': [{ t: '48' }, {
    'lt:241': [{ t: '10' }, {
      'lf:242': [{ t: '19' }, { 'f:20': '5399' }]
    }]
  }] }];
  assert.deepEqual(compose(parseQuery(query)), query);
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

test('an incomplete range is omitted until its runtime value is supplied', () => {
  assert.deepEqual(compose(model({ rows: [fieldRow({
    dty: 12, kind: 'number', op: 'op.between', values: ['10', '']
  })] })), []);
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

test('resolveQueryNames: record-type and field names -> ids, per level', async () => {
  const { resolveQueryNames } = await import('../src/utils/queryModel.js');
  const dbdefs = {
    rectypeIdByName: (t) => ({ 'life event': 48, person: 10, place: 12 }[String(t).toLowerCase()] || null),
    fieldIdByName: (rty, name) => ({
      '48:date of event': 9, '10:life events': 240, '48:place(s)': 134, '12:place name': 1
    }[`${rty}:${String(name).toLowerCase()}`] || null)
  };
  assert.deepEqual(
    resolveQueryNames([{ t: 'Life event' }, { 'f:Date of event': '=2026-09-23' }], dbdefs),
    [{ t: '48' }, { 'f:9': '=2026-09-23' }]
  );
  assert.deepEqual(
    resolveQueryNames({ t: 'Person', 'lt:Life events': { t: 'Life event', 'lt:Place(s)': { t: 'Place', 'f:Place name': 'Athens' } } }, dbdefs),
    [{ t: '10' }, { 'lt:240': [{ t: '48' }, { 'lt:134': [{ t: '12' }, { 'f:1': 'Athens' }] }] }]
  );
  // unresolved names stay as written; ids pass through
  assert.deepEqual(resolveQueryNames([{ t: 'Nope,10' }, { 'f:Whatever': 'x' }], dbdefs), [{ t: 'Nope,10' }, { 'f:Whatever': 'x' }]);
});

test('geo extent rows compose as the extent object and parse back', async () => {
  const { parseQuery: parse, composeQuery: compose } = await import('../src/utils/queryModel.js');
  const vocab = JSON.parse(readFileSync(new URL('../src/utils/queryVocabulary.json', import.meta.url), 'utf8'));
  const query = [{ t: '12' }, { 'geo:28:intersects': { west: -16, south: 32, east: 40, north: 72 } }];
  const model = parse(query);
  assert.deepEqual(model.rows[0].geoExtent, { west: -16, south: 32, east: 40, north: 72 });
  assert.deepEqual(compose(model, vocab), query);
});

test('count of values on a geo field composes as fc:<id>', async () => {
  const { composeQuery: compose, emptyFieldRow: row } = await import('../src/utils/queryModel.js');
  const vocab = JSON.parse(readFileSync(new URL('../src/utils/queryVocabulary.json', import.meta.url), 'utf8'));
  const model = { rtyId: '12', rows: [row({ dty: 28, kind: 'geo', op: 'op.count', values: ['>2'], selected: true,
    geoExtent: { west: 0, south: 0, east: 1, north: 1 } })] };
  assert.deepEqual(compose(model, vocab), [{ t: '12' }, { 'fc:28': '>2' }]);
});

test('geo match mode: parsed from the key (or the value form) and always composed explicitly', async () => {
  const { parseQuery: parse, composeQuery: compose, resolveQueryNames } = await import('../src/utils/queryModel.js');
  const vocab = JSON.parse(readFileSync(new URL('../src/utils/queryVocabulary.json', import.meta.url), 'utf8'));
  const wkt = 'POLYGON((0 0,1 0,1 1,0 0))';
  const extent = { west: -16, south: 32, east: 40, north: 72 };
  const roundTrip = (q) => compose(parse(q), vocab);
  // bare keys keep the server's meaning: WKT = within, extent = intersects
  assert.deepEqual(roundTrip([{ t: '12' }, { 'geo:28': wkt }]), [{ t: '12' }, { 'geo:28:within': wkt }]);
  assert.deepEqual(roundTrip([{ t: '12' }, { 'geo:28': extent }]), [{ t: '12' }, { 'geo:28:intersects': extent }]);
  // explicit modes are kept, with or without a field id
  assert.deepEqual(roundTrip([{ t: '12' }, { 'geo:28:within': extent }]), [{ t: '12' }, { 'geo:28:within': extent }]);
  assert.deepEqual(roundTrip([{ t: '12' }, { 'geo:intersects': wkt }]), [{ t: '12' }, { 'geo:intersects': wkt }]);
  // a mode is not a field name
  const dbdefs = { rectypeIdByName: () => 12, fieldIdByName: () => { throw new Error('looked up'); } };
  assert.deepEqual(resolveQueryNames([{ t: '12' }, { 'geo:within': wkt }], dbdefs), [{ t: '12' }, { 'geo:within': wkt }]);
});

test('relationships: related with r / relf round-trips; legacy related:<types> becomes r', () => {
  const q = [{ t: '10' }, { related: [{ t: '10' }, { r: '3115,3116' }, { 'relf:1': 'Grand' }] }];
  assert.deepEqual(compose(parseQuery(q, VOCAB)), q);
  assert.deepEqual(compose(parseQuery([{ t: '10' }, { 'related:3115': [{ t: '10' }] }], VOCAB)),
    [{ t: '10' }, { related: [{ t: '10' }, { r: '3115' }] }]);
  // r:<id> is the short spelling of relf:<id>; rt:<relmarker> keeps its field id
  assert.deepEqual(compose(parseQuery([{ t: '10' }, { related: { t: 10, 'r:1': 'x' } }], VOCAB)),
    [{ t: '10' }, { related: [{ t: '10' }, { 'relf:1': 'x' }] }]);
  assert.deepEqual(compose(parseQuery([{ t: '48' }, { 'rt:245': [{ t: '10' }, { r: '5419' }] }], VOCAB)),
    [{ t: '48' }, { 'rt:245': [{ t: '10' }, { r: '5419' }] }]);
});

test('relationships: a related row never writes its relmarker id into the key', () => {
  const row = { type: 'link', link: 'related', dty: 235, targetRty: 10, conjunction: 'all',
    rows: [fieldRow({ dty: 'reltype', kind: 'term', rel: true, op: 'op.is', values: ['3115', '3116'], selected: true })] };
  assert.deepEqual(compose(model({ rtyId: 10, rows: [row] })),
    [{ t: '10' }, { related: [{ t: '10' }, { r: '3115,3116' }] }]);
});

test('relationships: tree picks of Relation type / a Relationship field become related rows', () => {
  const via = { via: { link: 'related', dty: 235, targetRty: 10 } };
  const typeRow = rowForPath([via, { dty: 'reltype', fieldType: 'relationtype', rel: true }], VOCAB);
  assert.equal(typeRow.link, 'related');
  assert.deepEqual({ ...typeRow.rows[0], values: undefined },
    { ...typeRow.rows[0], dty: 'reltype', kind: 'term', rel: true, op: 'op.is', values: undefined });
  const fieldPick = rowForPath([via, { dty: 10, fieldType: 'date', rel: true }], VOCAB);
  Object.assign(fieldPick.rows[0], { op: 'op.on', values: ['1900'] });
  assert.deepEqual(compose(model({ rtyId: 10, rows: [fieldPick] })),
    [{ t: '10' }, { related: [{ t: '10' }, { 'relf:10': '=1900' }] }]);
});

test('relationships: relf:<name> resolves within the Relationship record type', async () => {
  const { resolveQueryNames } = await import('../src/utils/queryModel.js');
  const dbdefs = {
    rectypeIdByName: () => 10,
    dbconst: (name) => (name === 'RT_RELATION' ? 1 : null),
    fieldIdByName: (rty, name) => (Number(rty) === 1 && /^start date\/time$/i.test(name) ? 10 : null)
  };
  assert.deepEqual(resolveQueryNames([{ t: '10' }, { related: [{ t: '10' }, { 'relf:Start date/time': '1900' }] }], dbdefs),
    [{ t: '10' }, { related: [{ t: '10' }, { 'relf:10': '1900' }] }]);
});
