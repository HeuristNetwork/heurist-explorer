import test from 'node:test';
import assert from 'node:assert/strict';
import { RecordTypeManager } from '../src/core/RecordTypeManager.js';

test('RecordTypeManager joins usage counts with definitions and groups', async () => {
  const requests = [];
  const manager = new RecordTypeManager({
    apiClient: {
      async get(path, options) {
        requests.push({ path, options });
        return {
          total: 12,
          rectypes: [
            { rec_RecTypeID: 12, count: 3 },
            { rec_RecTypeID: 10, count: 9 }
          ]
        };
      }
    },
    dbDefsProvider: async () => dbDefs(),
    baseUrl: 'https://example.test/heurist/',
    database: 'demo db'
  });

  await manager.load();
  assert.equal(requests[0].path, '/records/');
  assert.deepEqual(requests[0].options.query, { detail: 'rectypes' });
  assert.deepEqual(manager.list().map((item) => item.id), [10, 12]);
  assert.deepEqual(manager.list({ sort: 'name' }).map((item) => item.title), ['People', 'Places']);
  assert.deepEqual(manager.groups().map((group) => group.name), ['Entities', 'Locations']);
  assert.match(manager.get(12).iconUrl, /\?db=demo%20db&icon=12&t=\d+$/);
  assert.equal(manager.get(12).iconUrl.includes('version=thumb'), false);
});

test('RecordTypeManager resolves a record type to an executable DataSource', async () => {
  const manager = new RecordTypeManager({
    apiClient: { get: async () => ({ rectypes: { 12: 4 } }) },
    dbDefsProvider: async () => dbDefs()
  });
  await manager.load();
  const source = manager.resolveDataSource(12, { origin: 'favorite' });
  assert.equal(source.reference.key, 'recordtype:12');
  assert.equal(source.title, 'Places');
  assert.equal(source.request.q, 't:12');
  assert.equal(source.meta.count, 4);
  assert.equal(source.meta.origin, 'favorite');
  assert.equal(manager.resolveDataSource(99), null);
});

function dbDefs() {
  return {
    rectypes: () => [
      { id: 10, name: 'People', plural: 'People', group: 1 },
      { id: 12, name: 'Places', plural: 'Places', group: 2 }
    ],
    rectypeGroups: () => [
      { id: 2, name: 'Locations', order: 2 },
      { id: 1, name: 'Entities', order: 1 }
    ]
  };
}
