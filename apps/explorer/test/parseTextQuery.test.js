import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTextQuery } from '../src/utils/parseTextQuery.js';

const DBDEFS = {
  rectypeIdByName: (t) => ({ person: 10, place: 12 }[String(t).toLowerCase()] || null),
  fieldIdByName: (_rty, name) => ({ name: 12, 'family name': 12, year: 5, country: 26 }[String(name).toLowerCase()] || null)
};
const p = (t) => parseTextQuery(t, { dbdefs: DBDEFS });

test('empty / whitespace -> []', () => {
  assert.deepEqual(p(''), []);
  assert.deepEqual(p('   '), []);
});

test('t: with id and with name', () => {
  assert.deepEqual(p('t:10'), [{ t: '10' }]);
  assert.deepEqual(p('t:Place'), [{ t: '12' }]);
});

test('leading bare record-type name becomes t:', () => {
  assert.deepEqual(p('Person year:>1900'), [{ t: '10' }, { 'f:5': '>1900' }]);
});

test('bare words that are not a record type become title matches', () => {
  assert.deepEqual(p('hello world'), [{ title: 'hello' }, { title: 'world' }]);
});

test('field name resolves via HDbDefs and keeps the operator token', () => {
  assert.deepEqual(p('t:10 name:smith'), [{ t: '10' }, { 'f:12': 'smith' }]);
  assert.deepEqual(p('year:>=1900'), [{ 'f:5': '>=1900' }]);
});

test('f:<id>:<value> form and enum sub-part', () => {
  assert.deepEqual(p('f:26:paris'), [{ 'f:26': 'paris' }]);
  assert.deepEqual(p('f:26:term:Paris'), [{ 'f:26:term': 'Paris' }]);
});

test('quoted phrase stays one value', () => {
  assert.deepEqual(p('name:"John Smith"'), [{ 'f:12': 'John Smith' }]);
  assert.deepEqual(p('"John Smith"'), [{ title: 'John Smith' }]);
});

test('negation prefix', () => {
  assert.deepEqual(p('-country:France'), [{ 'f:26': '-France' }]);
  assert.deepEqual(p('name:-smith'), [{ 'f:12': '-smith' }]);
});

test('header keywords and sortby pass through', () => {
  assert.deepEqual(p('title:@King sortby:-modified'), [{ title: '@King' }, { sortby: '-modified' }]);
});

test('unknown key is kept verbatim, not dropped', () => {
  assert.deepEqual(p('weirdo:zzz'), [{ weirdo: 'zzz' }]);
});

test('explicit and/or tokens are ignored (flat parser)', () => {
  assert.deepEqual(p('name:a or name:b'), [{ 'f:12': 'a' }, { 'f:12': 'b' }]);
});

test('works without dbdefs (no name resolution, tokens kept)', () => {
  assert.deepEqual(parseTextQuery('t:10 f:5:>1900 foo:bar'), [
    { t: '10' }, { 'f:5': '>1900' }, { foo: 'bar' }
  ]);
});

test('fc:<id>:<value> -> field value count', () => {
  assert.deepEqual(p('t:10 fc:12:>2'), [{ t: '10' }, { 'fc:12': '>2' }]);
});

test('t: with several record types', () => {
  assert.deepEqual(p('t:48,10'), [{ t: '48,10' }]);
});

test('lt<id>( … ) linked sub-queries nest, other ( … ) groups flatten', () => {
  assert.deepEqual(
    p('t:10 f:1:son% lt240(t:48 lt134(t:12 f:1:Athens) f:237:5381)'),
    [{ t: '10' }, { 'f:1': 'son%' },
      { 'lt:240': [{ t: '48' }, { 'lt:134': [{ t: '12' }, { 'f:1': 'Athens' }] }, { 'f:237': '5381' }] }]
  );
  assert.deepEqual(p('t:10 linked_to:240(t:48) f:1:x'), [{ t: '10' }, { 'lt:240': [{ t: '48' }] }, { 'f:1': 'x' }]);
  assert.deepEqual(p('(f:1:a) f:2:b'), [{ 'f:1': 'a' }, { 'f:2': 'b' }]);
});

test('f<id>:, f<Name>: and bare f: forms', () => {
  assert.deepEqual(p('t:12 f26:Athens'), [{ t: '12' }, { 'f:26': 'Athens' }]);
  assert.deepEqual(p('t:10 fYear:1900'), [{ t: '10' }, { 'f:5': '1900' }]);
  assert.deepEqual(p('t:12 f:Athens'), [{ t: '12' }, { f: 'Athens' }]);
  assert.deepEqual(p('t:12 Athens'), [{ t: '12' }, { title: 'Athens' }]);
});

test('geo:<value> and geo:<id>:<value>', () => {
  assert.deepEqual(p('geo:28:$X$'), [{ 'geo:28': '$X$' }]);
  assert.deepEqual(p('geo:$X$'), [{ geo: '$X$' }]);
});
