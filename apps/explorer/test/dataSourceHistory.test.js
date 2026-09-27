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

test('an untitled search is named by its query in words, never "Untitled search"', () => {
  const describe = (q) => (JSON.stringify(q) === '[{"t":"10"},{"f:20":"-414"}]' ? 'Find Persons where Gender is not "Male"' : '');
  const history = new DataSourceHistory({ database: 'demo', storage: memoryStorage(), describe });
  history.add({ type: 'query', query: { q: [{ t: '10' }, { 'f:20': '-414' }] } });
  assert.equal(history.list()[0].title, 'Find Persons where Gender is not "Male"');
  // nothing to describe with: the query text, else the placeholder
  const plain = new DataSourceHistory({ database: 'demo2', storage: memoryStorage() });
  plain.add({ type: 'query', query: { q: 't:10' } });
  assert.equal(plain.list()[0].title, 't:10');
});

test('the same query is one entry, however it was run or written', () => {
  const history = new DataSourceHistory({ database: 'demo', storage: memoryStorage() });
  history.add({ type: 'query', title: 'A', query: { q: [{ t: 10 }, { 'f:20': '414' }] } });
  history.add({ type: 'query', title: 'B', query: { q: '[{"t":"10"},{"f:20":"414"}]' } });
  history.add({ type: 'filter', id: 5, title: 'Men', query: { q: [{ t: '10' }, { 'f:20': '414' }] } });
  assert.deepEqual(history.list().map((item) => item.title), ['Men']);
  history.add({ type: 'query', query: { q: [{ t: '12' }] } });
  history.add({ type: 'query', title: 'Men again', query: { q: [{ 'f:20': '414' }, { t: '10' }].reverse() } });
  assert.deepEqual(history.list().map((item) => item.title), ['Men again', 'Untitled search']);
});

test('entries stored as "Untitled search" get described when read', () => {
  const storage = memoryStorage();
  new DataSourceHistory({ database: 'demo', storage }).add({ type: 'query', query: { q: [{ t: '12' }] } });
  const history = new DataSourceHistory({ database: 'demo', storage, describe: () => 'Find Places' });
  assert.equal(history.list()[0].title, 'Find Places');
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
