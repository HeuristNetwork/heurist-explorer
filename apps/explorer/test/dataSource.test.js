import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cloneDataSource, dataSourceKey, dataSourcePresentation, dataSourceRequest,
  dataSourceRole, isSameDataSource, normalizeDataSource
} from '../src/core/DataSource.js';

test('normalizes the legacy flat query shape', () => {
  const source = normalizeDataSource({
    type: 'query', title: 'Places', query: { q: 't:12', w: 'all', rulesonly: 0 },
    count: 42, origin: 'search'
  });
  assert.deepEqual(source, {
    reference: { type: 'query', id: null, key: 'query:{"q":"t:12"}' },
    title: 'Places',
    request: { q: 't:12', w: 'all', rulesonly: 0 },
    presentation: { data: null, map: null, graph: null, timeline: null, filterForm: null },
    meta: { count: 42, origin: 'search' }
  });
});

test('query identity is canonical and excludes display metadata and defaults', () => {
  const a = { reference: { type: 'query' }, title: 'One', request: { q: 't:12', w: 'all', rulesonly: 0 } };
  const b = { type: 'query', title: 'Two', query: { rulesonly: 0, q: 't:12' }, count: 99 };
  const c = { type: 'query', query: { q: 't:99' } };
  assert.equal(dataSourceKey(a), 'query:{"q":"t:12"}');
  assert.equal(isSameDataSource(a, b), true);
  assert.equal(isSameDataSource(a, c), false);
});

test('Dataset and MapSource normalize to the same Source identity', () => {
  const dataset = normalizeDataSource({ type: 'dataset', id: 7, query: { q: 't:1' } });
  const mapSource = normalizeDataSource({ type: 'mapsource', id: 7, query: { q: 't:2' } });
  const source = normalizeDataSource({
    reference: { type: 'source', id: 7 }, request: { q: 't:3' },
    presentation: { map: { geoFields: ['12:38'] }, data: { fields: ['12:1'] } }
  });
  assert.equal(dataset.reference.type, 'source');
  assert.equal(dataSourceKey(dataset), 'source:7');
  assert.equal(dataSourceKey(mapSource), 'source:7');
  assert.equal(isSameDataSource(dataset, mapSource), true);
  assert.deepEqual(dataSourcePresentation(source, 'map'), { geoFields: ['12:38'] });
  assert.deepEqual(dataSourcePresentation(source, 'data'), { fields: ['12:1'] });
});

test('saved filters and record-type producers preserve distinct provenance', () => {
  assert.equal(dataSourceKey({ type: 'filter', id: 7, query: { q: 't:1' } }), 'filter:7');
  assert.equal(dataSourceKey({ type: 'rectype', id: 12, query: { q: 't:12' } }), 'recordtype:12');
  assert.equal(dataSourceRole({ type: 'rectype', id: 12, query: { q: 't:12' } }), 'current');
  assert.equal(dataSourceRole({ type: 'filter', id: 7, query: { q: 't:1' } }), 'saved');
});

test('request and clones do not expose mutable shared state', () => {
  const source = normalizeDataSource({ type: 'query', query: { q: { t: 12 } } });
  const request = dataSourceRequest(source);
  const copy = cloneDataSource(source);
  request.q.t = 99;
  copy.request.q.t = 88;
  assert.equal(source.request.q.t, 12);
});

test('rejects malformed runtime sources', () => {
  assert.throws(() => normalizeDataSource({ type: 'dataset', query: { q: 't:1' } }), /positive reference id/);
  assert.throws(() => normalizeDataSource({ type: 'query', query: '' }), /executable request/);
  assert.throws(() => normalizeDataSource({ type: 'source', id: 7 }), /executable request/);
  assert.equal(dataSourceKey({ type: 'unknown' }), null);
});
