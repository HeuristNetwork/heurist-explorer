import test from 'node:test';
import assert from 'node:assert/strict';
import { DataSourceHistory } from '../src/core/DataSourceHistory.js';

test('history is database scoped, unique, newest first and capped', () => {
  const storage = memoryStorage();
  let now = 100;
  const history = new DataSourceHistory({ database: 'demo', storage, limit: 3, clock: () => ++now });
  history.add(query('t:1', 'One'));
  history.add(query('t:2', 'Two'));
  history.add(query('t:3', 'Three'));
  history.add(query('t:4', 'Four'));
  assert.deepEqual(history.list().map((item) => item.title), ['Four', 'Three', 'Two']);

  history.add(query('t:2', 'Two updated'));
  assert.deepEqual(history.list().map((item) => item.title), ['Two updated', 'Four', 'Three']);
  assert.equal(storage.getItem('heurist.explorer.demo.history') != null, true);
  assert.equal(new DataSourceHistory({ database: 'other', storage }).list().length, 0);
});

test('history ignores invalid sources and returns isolated copies', () => {
  const history = new DataSourceHistory({ database: 'demo', storage: memoryStorage() });
  assert.equal(history.add({ type: 'query', query: '' }), null);
  history.add(query('t:12', 'Places'));
  const list = history.list();
  list[0].dataSource.request.q = 'changed';
  assert.equal(history.list()[0].dataSource.request.q, 't:12');
  assert.equal(history.remove(list[0].key), true);
  assert.equal(history.list().length, 0);
});

function query(q, title) { return { type: 'query', title, query: { q } }; }
function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
}
