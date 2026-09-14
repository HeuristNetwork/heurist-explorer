import test from 'node:test';
import assert from 'node:assert/strict';
import { QuerySourceManager } from '../src/core/QuerySourceManager.js';

test('loads RT_QUERY_SOURCE records and resolves all presentation profiles', async () => {
  const calls = [];
  const apiClient = {
    async get(path, options) {
      calls.push([path, options]);
      if (path === '/records/') return { items: [{ rec_ID: 8, rec_Title: 'Places source' }] };
      return {
        id: 8, title: 'Places source', source: { query: 't:12' },
        fields: [{ field: '12:1' }], geofields: ['12:2'], timefields: ['12:3'], rules: [{ levels: [] }],
        map: { geoFields: [{ field: '12:2' }], dynamicRequests: true, minZoom: 4, maxZoom: 15 }
      };
    }
  };
  const manager = new QuerySourceManager({
    apiClient,
    dbDefsProvider: async () => ({ dbconst: (name) => name === 'RT_QUERY_SOURCE' ? 77 : null })
  });
  assert.deepEqual(await manager.load(), [{ id: 8, title: 'Places source' }]);
  assert.equal(calls[0][1].query.q, 't:77');
  const source = await manager.resolveDataSource(8);
  assert.equal(source.reference.key, 'source:8');
  assert.equal(source.request.q, 't:12');
  assert.deepEqual(source.presentation.data.fields, [{ field: '12:1' }]);
  assert.deepEqual(source.presentation.map.geoFields, ['12:2']);
  assert.equal(source.presentation.map.dynamicRequests, true);
  assert.equal(source.presentation.map.minZoom, 4);
  assert.equal(source.presentation.map.maxZoom, 15);
  assert.deepEqual(source.presentation.timeline.fields, ['12:3']);
});
