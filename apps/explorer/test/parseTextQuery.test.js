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

test('negation: -keyword is not (no value matches), -value stays in the value', () => {
  assert.deepEqual(p('-country:France'), [{ not: [{ 'f:26': 'France' }] }]);
  assert.deepEqual(p('name:-smith'), [{ 'f:12': '-smith' }]);
});

test('header keywords and sortby pass through', () => {
  assert.deepEqual(p('title:@King sortby:-modified'), [{ title: '@King' }, { sortby: '-modified' }]);
});

test('unknown key is kept verbatim, not dropped', () => {
  assert.deepEqual(p('weirdo:zzz'), [{ weirdo: 'zzz' }]);
});

test('lowercase and / or are words (only uppercase AND / OR join)', () => {
  assert.deepEqual(p('name:a or name:b'), [{ 'f:12': 'a' }, { title: 'or' }, { 'f:12': 'b' }]);
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

test('geo[:<id>][:within|intersects]:<value>', () => {
  assert.deepEqual(p('geo:28:within:"POLYGON ((0 0, 1 0, 1 1, 0 0))"'), [{ 'geo:28:within': 'POLYGON ((0 0, 1 0, 1 1, 0 0))' }]);
  assert.deepEqual(p('geo:Intersects:$X$'), [{ 'geo:intersects': '$X$' }]);
});

test('related( … ) with r:<types> and relf:<id>:<value> / r:<id>:<value>', () => {
  assert.deepEqual(p('t:10 related(t:10 r:3115,3116 relf:10:>=1900 r:1:"Grand son")'), [
    { t: '10' },
    { related: [{ t: '10' }, { r: '3115,3116' }, { 'relf:10': '>=1900' }, { 'relf:1': 'Grand son' }] }
  ]);
});

test('keyword value form and compact field keys, as the server accepts', () => {
  assert.deepEqual(p('t 10 f1 Johnson'), [{ t: '10' }, { 'f:1': 'Johnson' }]);
  assert.deepEqual(p('fc240:>2'), [{ 'fc:240': '>2' }]);
  assert.deepEqual(p('count240:>2'), [{ 'fc:240': '>2' }]);
  assert.deepEqual(p('lt134:51'), [{ 'lt:134': '51' }]);
  // plain words are still title words
  assert.deepEqual(p('Johnson Smith'), [{ title: 'Johnson' }, { title: 'Smith' }]);
});

// Old simple format, the same rules as the server RecordQueryParser (2026-11-12,
// docs/development/Query-Language-Old-vs-New.md)

test('OR / AND / && like the server: a b OR c d = (a AND b) OR (c AND d)', () => {
  assert.deepEqual(p('Johnson OR Berlin'), [{ any: [{ title: 'Johnson' }, { title: 'Berlin' }] }]);
  assert.deepEqual(p('t:10 Johnson OR t:12 Berlin'), [{ any: [
    { all: [{ t: '10' }, { title: 'Johnson' }] }, { all: [{ t: '12' }, { title: 'Berlin' }] }] }]);
  assert.deepEqual(p('t:12 AND Berlin OR Paris sortby:title'),
    [{ t: '12' }, { any: [{ title: 'Berlin' }, { title: 'Paris' }] }, { sortby: 'title' }]);
  assert.deepEqual(p('Johnson && t:10'), [{ title: 'Johnson' }, { t: '10' }]);
  assert.deepEqual(p('"a OR b"'), [{ title: 'a OR b' }]);
});

test('-keyword: not group; t:-<type> excludes record types', () => {
  assert.deepEqual(p('-t:10'), [{ not: [{ t: '10' }] }]);
  assert.deepEqual(p('-tag:key1'), [{ not: [{ tag: 'key1' }] }]);
  assert.deepEqual(p('-f:1:'), [{ not: [{ 'f:1': '' }] }]);
  assert.deepEqual(p('-t 10 Johnson'), [{ not: [{ t: '10' }] }, { title: 'Johnson' }]);
  assert.deepEqual(p('-lt134(t:12)'), [{ not: [{ 'lt:134': [{ t: '12' }] }] }]);
  assert.deepEqual(p('-Johnson'), [{ title: '-Johnson' }]);
  assert.deepEqual(p('t:-Person'), [{ t: '-10' }]);
});

test('operator instead of the colon: title=x, f:1>B, modified>date, tag=x', () => {
  assert.deepEqual(p('title=Johnson'), [{ title: '=Johnson' }]);
  assert.deepEqual(p('title="Johnson, John"'), [{ title: '=Johnson, John' }]);
  assert.deepEqual(p('f:1>B f:1<C'), [{ 'f:1': '>B' }, { 'f:1': '<C' }]);
  assert.deepEqual(p('f:1160>=5000000'), [{ 'f:1160': '>=5000000' }]);
  assert.deepEqual(p('modified>2026-08-01'), [{ modified: '>2026-08-01' }]);
  assert.deepEqual(p('fc:240=2'), [{ 'fc:240': '=2' }]);
  assert.deepEqual(p('tag=key1'), [{ tag: 'key1' }]);
  assert.deepEqual(p('a<b'), [{ title: 'a<b' }]);
});

test('field names: f:Name:x, f:"Name with spaces"<x; all:x / any:x = any field', () => {
  assert.deepEqual(p('f:Name:smith'), [{ 'f:12': 'smith' }]);
  assert.deepEqual(p('f:"Family name"<C'), [{ 'f:12': '<C' }]);
  assert.deepEqual(p('fc:Country:>2'), [{ 'fc:26': '>2' }]);
  assert.deepEqual(parseTextQuery('f:Unknown:x'), [{ 'f:Unknown': 'x' }]);
  assert.deepEqual(p('f:"10:30"'), [{ f: '10:30' }]);
  assert.deepEqual(p('all:Berlin'), [{ f: 'Berlin' }]);
  assert.deepEqual(p('any:Berlin'), [{ f: 'Berlin' }]);
});

test('f:<field>:( … ): pointer field = lt, relationship marker = related', () => {
  const defs = { ...DBDEFS, fieldType: (_rty, id) => ({ 134: 'resource', 245: 'relmarker' }[id] || 'freetext') };
  assert.deepEqual(parseTextQuery('f:134:(t:12 title:Berlin)', { dbdefs: defs }),
    [{ 'lt:134': [{ t: '12' }, { title: 'Berlin' }] }]);
  assert.deepEqual(parseTextQuery('f:245:(t:4)', { dbdefs: defs }), [{ 'related:245': [{ t: '4' }] }]);
  assert.deepEqual(p('t:10 linkedto:134(t:12)'), [{ t: '10' }, { 'lt:134': [{ t: '12' }] }]);
});

test('outdated link aliases linkto / linkfrom are not keywords any more', () => {
  assert.deepEqual(parseTextQuery('linkto:153'), [{ linkto: '153' }]);
  assert.deepEqual(parseTextQuery('linkedfrom:153'), [{ lf: '153' }]);
});
