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
    recordTypeProvider: { getIdByConceptCode: async (code) => (code === '3-1021' ? 77 : null) }
  });
  assert.deepEqual(await manager.load(), [{ id: 8, title: 'Places source', ownerGroupId: null, parametrized: false, hasRules: false }]);
  assert.deepEqual(calls[0][1].query.q, [{ t: '77' }]);
  const source = await manager.resolveDataSource(8);
  assert.equal(source.reference.key, 'source:8');
  assert.equal(source.request.q, 't:12');
  assert.deepEqual(source.presentation.data.fields, [
    { field: '12:1', title: null, visible: true, width: null, aggregation: null, ext: null },
  ]);
  assert.deepEqual(source.presentation.map.geoFields, ['12:2']);
  assert.equal(source.presentation.map.dynamicRequests, true);
  assert.equal(source.presentation.map.minZoom, 4);
  assert.equal(source.presentation.map.maxZoom, 15);
  assert.deepEqual(source.presentation.timeline.fields, ['12:3']);
});

test('resolves RT_QUERY_SOURCE by its portable concept code, not the whole dbdefs snapshot', async () => {
  const conceptCodes = [];
  const manager = new QuerySourceManager({
    apiClient: { get: async () => ({ items: [] }) },
    recordTypeProvider: {
      async getIdByConceptCode(code) {
        conceptCodes.push(code);
        return 5;
      }
    }
  });
  await manager.load();
  assert.deepEqual(conceptCodes, ['3-1021']);
});

test('degrades to an empty list when RT_QUERY_SOURCE is not registered in this database', async () => {
  let getCalled = false;
  const manager = new QuerySourceManager({
    apiClient: { get: async () => { getCalled = true; return { items: [] }; } },
    recordTypeProvider: { getIdByConceptCode: async () => { throw new Error('did not return a valid rty_ID'); } }
  });
  assert.deepEqual(await manager.load(), []);
  assert.equal(getCalled, false);
  assert.equal(manager.recordTypeId, null);
});

test('constructor requires both apiClient and recordTypeProvider', () => {
  assert.throws(() => new QuerySourceManager({ recordTypeProvider: {} }), TypeError);
  assert.throws(() => new QuerySourceManager({ apiClient: {} }), TypeError);
});

test('loads only the owner scope, with owner, parameter and rules marks', async () => {
  const calls = [];
  const manager = new QuerySourceManager({
    apiClient: {
      async get(path, options) {
        calls.push(options.query);
        return { records: [
          { rec_ID: 1, rec_Title: 'Plain', rec_OwnerUGrpID: '0', details: { 12: ['[{"t":"10"}]'] } },
          { rec_ID: 2, rec_Title: 'Form', rec_OwnerUGrpID: '6', details: { 12: ['[{"t":"10"},{"f:1":"$X1$"}]'], 1172: ['[]'] } },
          { rec_ID: 3, rec_Title: 'Rules', rec_OwnerUGrpID: '2', details: { 12: ['t:10'], 1172: ['[{"query":"t:12 linkedfrom:10"}]'] } }
        ] };
      }
    },
    recordTypeProvider: { getIdByConceptCode: async () => 29 },
    ownerIds: () => [0, 4, 6, 2],
    dbDefsProvider: async () => ({ localId: (kind, code) => ({ '2-12': 12, '2-1163': 1172 })[code] || 0 })
  });
  const list = await manager.load();
  assert.deepEqual(calls[0].q, [{ t: '29' }, { owner: '0,4,6,2' }]);
  assert.equal(calls[0].fields, 'rec_OwnerUGrpID,12,1172');
  assert.deepEqual(list.map(({ id, ownerGroupId, parametrized, hasRules }) => [id, ownerGroupId, parametrized, hasRules]),
    [[2, 6, true, false], [1, 0, false, false], [3, 2, false, true]]);
});
