import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { queryDescribe } from '../src/utils/queryDescribe.js';

const VOCAB = JSON.parse(
  readFileSync(new URL('../src/utils/queryVocabulary.json', import.meta.url), 'utf8')
);

// Small HDbDefs stand-in exercising the id -> name lookups queryDescribe uses.
const DBDEFS = {
  rectypeName: (id, { plural = false } = {}) => ({
    10: plural ? 'Persons' : 'Person',
    12: plural ? 'Places' : 'Place',
    48: plural ? 'Events' : 'Event'
  }[id] || ''),
  rectypeIdByName: (t) => ({ person: 10, place: 12, event: 48 }[String(t).toLowerCase()] || null),
  fieldName: (_rty, dty) => ({
    12: 'Family name', 5: 'Year of birth', 26: 'Name', 237: 'Event type'
  }[dty] || ''),
  fieldGlobal: (dty) => ({ name: ({ 12: 'Family name', 5: 'Year of birth' }[dty] || ''), type: fieldType(dty) }),
  fieldType: (_rty, dty) => fieldType(dty),
  termLabel: (id) => ({ 10443: 'Death', 5: 'Baptism', 6: 'Marriage' }[id] || String(id))
};
function fieldType(dty) {
  return ({ 12: 'freetext', 5: 'integer', 26: 'freetext', 237: 'enum' }[dty] || 'freetext');
}

const say = (q, opts) => queryDescribe(q, { vocabulary: VOCAB, dbdefs: DBDEFS, ...opts });

test('empty / unparseable query -> empty string', () => {
  assert.equal(say([]), '');
  assert.equal(say('not json'), '');
  assert.equal(say({ q: [] }), '');
});

test('record type only', () => {
  assert.equal(say([{ t: '10' }]), 'Find Persons');
  assert.equal(say([{ f: 'x' }]), 'Find records where any field contains "x"');
});

test('flat field predicate with operator', () => {
  assert.equal(say([{ t: '10' }, { 'f:12': '=Smith' }]), 'Find Persons where Family name is "Smith"');
  assert.equal(say([{ 'f:12': '-Smith' }]), 'Find records where Family name does not contain "Smith"');
  assert.equal(say([{ t: '10' }, { 'f:5': '>=1900' }]), 'Find Persons where Year of birth is at least 1900');
});

test('wildcard % maps back to starts/ends with', () => {
  assert.equal(say([{ 'f:12': 'Smith%' }]), 'Find records where Family name starts with "Smith"');
  assert.equal(say([{ 'f:12': '%son' }]), 'Find records where Family name ends with "son"');
});

test('NULL operators', () => {
  assert.equal(say([{ 'f:12': 'NULL' }]), 'Find records where Family name has no value');
  assert.equal(say([{ 'f:12': '-NULL' }]), 'Find records where Family name has a value');
});

test('enum values resolve to term labels; comma list -> "or"', () => {
  assert.equal(say([{ 'f:237': '10443' }]), 'Find records where Event type is "Death"');
  assert.equal(say([{ 'f:237': '5,6' }]), 'Find records where Event type is "Baptism" or "Marriage"');
});

test('header keyword predicates', () => {
  assert.equal(
    say([{ t: '10' }, { added: '>=2020-01-01' }]),
    'Find Persons where date added is on or after 2020-01-01'
  );
});



test('date overlap range uses human operator text', () => {
  assert.equal(
    say([{ added: '<>1900-01-01/2000-01-01' }]),
    'Find records where date added falls in or overlaps 1900-01-01/2000-01-01'
  );
});

test('single linked sub-query - matches the plan example', () => {
  assert.equal(
    say([{ t: '12' }, { 'lf:134': [{ t: '48' }, { 'f:237': '10443' }] }]),
    'Find Places linked from Events where Event type is "Death"'
  );
});

test('top-level any wrapper', () => {
  assert.equal(
    say([{ any: [{ 'f:12': 'a' }, { 'f:26': 'b' }] }]),
    'Find records where any of (Family name contains "a", Name contains "b")'
  );
});

test('sortby clause', () => {
  assert.equal(
    say([{ t: '10' }, { 'f:12': 'Smith' }, { sortby: '-modified' }]),
    'Find Persons where Family name contains "Smith", sorted by date modified (descending)'
  );
});

test('unknown predicate is shown literally, never dropped or thrown', () => {
  const out = say([{ t: '10' }, { 'weird:thing': 'zzz' }]);
  assert.match(out, /weird:thing zzz/);
});

test('works without dbdefs (ids instead of names, comparison ops still resolve)', () => {
  const bare = queryDescribe([{ t: '10' }, { 'f:5': '>=1900' }], { vocabulary: VOCAB });
  assert.equal(bare, 'Find record type 10 where field 5 is at least 1900');
});

test('capitalize option only forces the leading character (phrase.find is already capitalised)', () => {
  assert.equal(
    say([{ 'f:12': 'smith' }], { capitalize: false }),
    say([{ 'f:12': 'smith' }])
  );
});

test('fc: field value count', () => {
  assert.equal(say([{ t: '10' }, { 'fc:12': '>2' }]), 'Find Persons where number of Family name values is greater than 2');
});

test('comparison tokens on a known text field are literal', () => {
  assert.equal(say([{ t: '10' }, { 'f:12': '>2' }]), 'Find Persons where Family name contains ">2"');
  assert.equal(say([{ t: '10' }, { 'f:5': '>2' }]), 'Find Persons where Year of birth is greater than 2');
});

test('nested linked sub-queries follow the conditions of their own record type', () => {
  assert.equal(
    say([{ t: '10' }, { 'f:12': 'son%' },
      { 'lt:240': [{ t: '48' }, { 'lt:134': [{ t: '12' }, { 'f:26': 'Athens' }] }, { 'f:237': '10443' }] }]),
    'Find Persons where Family name starts with "son" and linked to Events where Event type is "Death"'
      + ' and linked to Places where Name contains "Athens"'
  );
});

test('several record types', () => {
  assert.equal(say([{ t: '48,10' }]), 'Find Events or Persons');
});

test('$NAME$ parameters render as ?', () => {
  assert.equal(say([{ t: '10' }, { 'f:12': '$X1$' }]), 'Find Persons where Family name contains ?');
});

test('a nested sub-query followed by a sibling link is bracketed', () => {
  assert.equal(
    say([{ t: '10' },
      { 'lt:240': [{ t: '48' }, { 'lt:134': [{ t: '12' }] }] },
      { 'lt:241': [{ t: '12' }, { 'f:26': 'Athens' }] }]),
    'Find Persons linked to (Events linked to Places) and linked to Places where Name contains "Athens"'
  );
});

test('$NAME$ parameters inside ranges and geo values render as ?', () => {
  assert.equal(say([{ 'f:5': '$X3$<>$X4$' }]), 'Find records where Year of birth is between ? and ?');
  assert.equal(say([{ 'geo:28': '$X5$' }]), 'Find records where field 28 is within ?');
});

test('a<>b on a number field is "between"', () => {
  assert.equal(say([{ 'f:5': '1900<>2000' }]), 'Find records where Year of birth is between 1900 and 2000');
});

test('geo: with a field id names the field; bare geo is "Location"', () => {
  const geo = { ...DBDEFS, fieldName: (_rty, dty) => (dty === 28 ? 'Geo Location' : DBDEFS.fieldName(_rty, dty)) };
  assert.equal(
    queryDescribe([{ 'geo:28': 'POLYGON((0 0,1 1,0 0))' }], { vocabulary: VOCAB, dbdefs: geo }),
    'Find records where Geo Location is within POLYGON((0 0,1 1,0 0))'
  );
  assert.equal(say([{ geo: '$X$' }]), 'Find records where Location is within ?');
});

test('a linked sub-query may be a single predicate object', () => {
  assert.equal(say([{ t: '10' }, { 'lt:134': { ids: 51 } }]), say([{ t: '10' }, { 'lt:134': [{ ids: 51 }] }]));
  assert.equal(say([{ t: '10' }, { 'lt:134': { ids: 51 } }]), 'Find Persons linked to records where record ID is 51');
});

test('enum "=" token reads "is exactly"', () => {
  assert.equal(say([{ 'f:237': '=10443' }]), 'Find records where Event type is exactly "Death"');
});

test('multi-key predicate objects are an implicit AND, at any level', () => {
  assert.equal(say({ t: 10, 'f:237': 10443 }), 'Find Persons where Event type is "Death"');
  assert.equal(
    say({ t: 10, 'lt:134': { t: 12, 'f:26': 'Baghdad' } }),
    'Find Persons linked to Places where Name contains "Baghdad"'
  );
});

test('f:<field name> keys resolve within the record type', () => {
  const named = {
    ...DBDEFS,
    fieldIdByName: (rty, name) => (Number(rty) === 48 && /^event type$/i.test(name) ? 237 : null)
  };
  const tell = (q) => queryDescribe(q, { vocabulary: VOCAB, dbdefs: named });
  assert.equal(tell([{ t: '48' }, { 'f:Event type': '=10443' }]), 'Find Events where Event type is exactly "Death"');
  // unresolved name: shown as written, operator tokens still honoured
  assert.equal(tell([{ t: '48' }, { 'f:Date of event': '>=1900' }]), 'Find Events where Date of event is at least 1900');
});

test('geo match mode: explicit in the key, else WKT = within and extent = intersects', () => {
  const extent = { west: -16, south: 32, east: 40, north: 72 };
  assert.equal(say([{ geo: extent }]), 'Find records where Location intersects W -16, S 32, E 40, N 72');
  assert.equal(say([{ 'geo:within': extent }]), 'Find records where Location is within W -16, S 32, E 40, N 72');
  assert.equal(say([{ 'geo:28': '$X$' }]), 'Find records where field 28 is within ?');
  assert.equal(say([{ 'geo:28:intersects': '$X$' }]), 'Find records where field 28 intersects ?');
  assert.equal(say([{ 'geo:28:within': 'NULL' }]), 'Find records where field 28 has no value');
});
