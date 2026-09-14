import test from 'node:test';
import assert from 'node:assert/strict';
import { ExplorerWorkspace } from '../src/core/ExplorerWorkspace.js';

test('ExplorerWorkspace stores persistent sources as references and ad-hoc queries as DataSources', () => {
  const storage = memoryStorage();
  const workspace = new ExplorerWorkspace({ database: 'demo', storage, clock: () => 42 });
  workspace.add({ type: 'filter', id: 7, title: 'Places', query: { q: 't:12' } });
  workspace.add({ type: 'query', title: 'Temporary search', query: { q: 'after:"1 week ago"' } });

  const entries = workspace.list();
  assert.equal(entries[0].key, 'filter:7');
  assert.equal('dataSource' in entries[0], false);
  assert.match(entries[1].key, /^query:/);
  assert.equal(entries[1].dataSource.request.q, 'after:"1 week ago"');

  const persisted = JSON.parse(storage.getItem('heurist.explorer.demo.workspace'));
  assert.equal('dataSource' in persisted[0], false);
  assert.equal(persisted[1].dataSource.request.q, 'after:"1 week ago"');
});

test('workspace resolves references, restores ad-hoc queries and supports collection operations', async () => {
  const storage = memoryStorage();
  let resolved = null;
  const workspace = new ExplorerWorkspace({
    database: 'demo',
    storage,
    resolver: (reference) => {
      resolved = reference;
      return { type: 'filter', id: reference.id, query: { q: 't:12' } };
    }
  });
  workspace.add({ reference: { type: 'filter', id: 7 } }, { title: 'Places' });
  const queryEntry = workspace.add({ type: 'query', query: { q: 't:10' } });

  assert.equal(workspace.has('filter:7'), true);
  assert.equal(workspace.get(queryEntry.key).key, queryEntry.key);
  assert.equal((await workspace.resolve(queryEntry)).request.q, 't:10');
  assert.equal((await workspace.resolve('filter:7')).request.q, 't:12');
  assert.deepEqual(resolved, { type: 'filter', id: 7, key: 'filter:7' });
  assert.equal(workspace.remove(queryEntry), true);
  assert.equal(workspace.has(queryEntry), false);
});

test('workspace persists and reapplies map style opacity and visibility', async () => {
  const storage = memoryStorage();
  const workspace = new ExplorerWorkspace({
    database: 'demo', storage,
    resolver: async () => ({ type: 'source', id: 9, title: 'Resolved', query: { q: 't:12' } })
  });
  workspace.add({ type: 'source', id: 9, title: 'Places', query: { q: 't:12' } });
  workspace.update({
    reference: { type: 'source', id: 9 }, title: 'Places',
    presentation: { map: { style: { symbol: { color: '#123456' } }, opacity: 0.4, visible: false } }
  });
  const resolved = await workspace.resolve('source:9');
  assert.equal(resolved.presentation.map.opacity, 0.4);
  assert.equal(resolved.presentation.map.visible, false);
  assert.equal(resolved.presentation.map.style.symbol.color, '#123456');
});

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
}
