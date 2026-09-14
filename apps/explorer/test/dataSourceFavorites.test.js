import test from 'node:test';
import assert from 'node:assert/strict';
import { DataSourceFavorites } from '../src/core/DataSourceFavorites.js';

test('favorites store references rather than resolved DataSources', () => {
  const storage = memoryStorage();
  const favorites = new DataSourceFavorites({ database: 'demo', storage, clock: () => 42 });
  favorites.add({ type: 'filter', id: 7, title: 'Places', query: { q: 't:12' } });
  favorites.add({ type: 'dataset', id: 9, title: 'Mapped places', query: { q: 't:12' } });

  assert.deepEqual(favorites.list(), [
    { key: 'filter:7', title: 'Places', reference: { type: 'filter', id: 7, key: 'filter:7' }, addedAt: 42 },
    { key: 'source:9', title: 'Mapped places', reference: { type: 'source', id: 9, key: 'source:9' }, addedAt: 42 }
  ]);
  const persisted = JSON.parse(storage.getItem('heurist.explorer.demo.favorites'));
  assert.equal('dataSource' in persisted[0], false);
  assert.equal('query' in persisted[0], false);
});

test('favorites deduplicate aliases, remove and resolve through the supplied resolver', async () => {
  const storage = memoryStorage();
  let resolvedReference = null;
  const favorites = new DataSourceFavorites({
    database: 'demo', storage,
    resolver: (reference) => { resolvedReference = reference; return { ok: true }; }
  });
  favorites.add({ type: 'mapsource', id: 3 }, { title: 'Map source' });
  favorites.add({ reference: { type: 'source', id: 3 }, title: 'General source' });
  assert.equal(favorites.list().length, 1);
  assert.equal(favorites.has({ type: 'dataset', id: 3 }), true);
  assert.deepEqual(await favorites.resolve(favorites.list()[0]), { ok: true });
  assert.deepEqual(resolvedReference, { type: 'source', id: 3, key: 'source:3' });
  assert.equal(favorites.remove('source:3'), true);
  assert.equal(favorites.has({ type: 'source', id: 3 }), false);
});

test('favorites reject direct queries because they are not persistent references', () => {
  const favorites = new DataSourceFavorites({ database: 'demo', storage: memoryStorage() });
  assert.equal(favorites.add({ type: 'query', query: { q: 't:12' } }), null);
});

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
}
