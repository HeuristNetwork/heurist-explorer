import test from 'node:test';
import assert from 'node:assert/strict';
import {
  queryParameterNames, describeQueryParameters, resolveQueryParameters
} from '../src/data/queryParameters.js';

test('multiple query paths with the same detail type retain distinct parameters', () => {
  const query = [{ t: '10' }, { 'f:1': '$X1$' },
    { 'lt:240': [{ t: '48' }, { 'f:1': '$X2$' }] }];
  assert.deepEqual(queryParameterNames(query), ['X1', 'X2']);
  assert.deepEqual(resolveQueryParameters(query, { X1: 'John', X2: 'Athens' }).q,
    [{ t: '10' }, { 'f:1': 'John' },
      { 'lt:240': [{ t: '48' }, { 'f:1': 'Athens' }] }]);
  assert.deepEqual(resolveQueryParameters(query, {}).q, [{ t: '10' }]);
  assert.deepEqual(query, [{ t: '10' }, { 'f:1': '$X1$' },
    { 'lt:240': [{ t: '48' }, { 'f:1': '$X2$' }] }]);
});

test('blank scalar omits predicate while NULL remains literal', () => {
  const query = [{ t: '10' }, { 'f:1': '$X1$' }, { 'f:20': 'NULL' }];
  assert.deepEqual(resolveQueryParameters(query, {}).q,
    [{ t: '10' }, { 'f:20': 'NULL' }]);
});

test('range endpoints may be supplied independently', () => {
  const query = [{ t: '10' }, { 'f:20': '$X1$<>$X2$' }];
  assert.deepEqual(resolveQueryParameters(query, { X1: 10 }).q,
    [{ t: '10' }, { 'f:20': '>=10' }]);
  assert.deepEqual(resolveQueryParameters(query, { X2: 20 }).q,
    [{ t: '10' }, { 'f:20': '<=20' }]);
  assert.deepEqual(resolveQueryParameters(query, { X1: 10, X2: 20 }).q,
    [{ t: '10' }, { 'f:20': '10<>20' }]);
});

test('fixed range endpoint is part of the query, not the layout', () => {
  const query = [{ 'f:20': '10<>$X3$' }];
  const descriptors = describeQueryParameters(query, { fieldGlobal: () =>
    ({ type: 'integer', name: 'Age' }) });
  assert.deepEqual(descriptors.X3.fixedValue, { from: '10', to: null });
  assert.deepEqual(resolveQueryParameters(query, { X3: 30 }).q,
    [{ 'f:20': '10<>30' }]);
});

test('date overlap and containment operators expose one two-ended parameter', () => {
  const dbdefs = { fieldGlobal: () => ({ type: 'date', name: 'Date' }) };
  for (const value of ['<>$DateFrom$/$DateTo$', '><$DateFrom$/$DateTo$']) {
    const descriptors = describeQueryParameters([{ 'f:20': value }], dbdefs);
    assert.equal(descriptors.DateFrom.range, true);
    assert.equal(descriptors.DateFrom.endInput, 'DateTo');
    assert.equal(descriptors.DateTo.range, undefined);
  }
});

test('numeric descriptions distinguish integer and floating-point inputs', () => {
  const integer = describeQueryParameters([{ 'f:20': '$Value$' }], {
    fieldGlobal: () => ({ type: 'integer', name: 'Count' })
  });
  const float = describeQueryParameters([{ 'f:21': '$Value$' }], {
    fieldGlobal: () => ({ type: 'float', name: 'Score' })
  });
  assert.equal(integer.Value.integer, true);
  assert.equal(float.Value.integer, false);
});

test('descriptions include record type, field name, and geo field id', () => {
  const query = [{ t: '10' }, { 'geo:28': '$X1$' },
    { 'lt:240': [{ t: '48' }, { 'f:1': '$X2$' }] }];
  const dbdefs = {
    rectypeName: (id) => ({ 10: 'Person', 48: 'Place' })[id],
    fieldGlobal: (id) => ({ 28: { type: 'geo', name: 'Location' },
      1: { type: 'freetext', name: 'Full name' } })[id]
  };
  const parameters = describeQueryParameters(query, dbdefs);
  assert.equal(parameters.X1.pathLabel, 'Person.Location');
  assert.equal(parameters.X1.fieldId, 28);
  assert.equal(parameters.X2.pathLabel, 'Place.Full name');
});


test('geographic parameters remain geo field predicates', () => {
  const query = [{ t: '10' }, { 'geo:28': '$X1$' }];
  const extent = { west: 10, south: -5, east: 20, north: 8 };
  assert.deepEqual(resolveQueryParameters(query, { X1: extent }), {
    q: [{ t: '10' }, { 'geo:28': 'POLYGON((10 -5,20 -5,20 8,10 8,10 -5))' }],
    extent: null
  });
});

test('ranges picked from a list fill the template; several become an OR group', async () => {
  const { resolveQueryParameters: resolve, describeQueryParameters: describe, splitRangeValue } =
    await import('../src/data/queryParameters.js');
  const layout = { version: 1, groups: [{ id: 'main', children: [
    { input: 'D', mode: 'checkbox', groupBy: 'decade' },
    { input: 'N', mode: 'radio', ranges: 5 },
    { input: 'F', mode: 'select', groupBy: 'year' }
  ] }] };
  const query = [{ 'f:10': '<>$D$/$D_to$' }, { 'f:3': '$N$<>$N_to$' }, { 'f:11': '$F$' }];
  assert.deepEqual(resolve(query, { D: ['1990/1999'], N: '-5/10', F: '1850/1850' }, layout).q,
    [{ 'f:10': '<>1990/1999' }, { 'f:3': '-5<>10' }, { 'f:11': '1850/1850' }]);
  assert.deepEqual(resolve(query, { D: ['1990/1999', '-0500/-0491'] }, layout).q,
    [{ any: [{ 'f:10': '<>1990/1999' }, { 'f:10': '<>-0500/-0491' }] }]);
  assert.deepEqual(resolve(query, { D: [], N: '', F: null }, layout).q, []);
  // any other operator: the picked range replaces it
  const single = { version: 1, groups: [{ id: 'main', children: [
    { input: 'A', mode: 'select', groupBy: 'year' }, { input: 'B', mode: 'radio', ranges: 5 }
  ] }] };
  assert.deepEqual(resolve([{ 'f:10': '>$A$' }, { 'f:3': '=$B$' }], { A: '1990/1999', B: '0/100' }, single).q,
    [{ 'f:10': '1990/1999' }, { 'f:3': '0<>100' }]);
  assert.deepEqual(splitRangeValue('-5/10'), ['-5', '10']);
  assert.equal(splitRangeValue('1850'), null);
  // the operator decides how a date span counts
  assert.equal(describe([{ 'f:10': '><$D$/$D_to$' }]).D.rangeOperator, '><');
  assert.equal(describe([{ 'f:10': '<>$D$/$D_to$' }]).D.rangeOperator, '<>');
});
