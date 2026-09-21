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
