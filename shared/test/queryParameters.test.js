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
