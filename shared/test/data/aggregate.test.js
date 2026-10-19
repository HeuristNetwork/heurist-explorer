import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregate, AGGREGATE_OPS } from '../../src/data/aggregate.js';

/** API stub recording get and post calls. */
function fakeApi() {
  const calls = [];
  return {
    calls,
    get: async (path, options) => { calls.push({ method: 'GET', path, ...options }); return { total: 1 }; },
    post: async (path, options) => { calls.push({ method: 'POST', path, ...options }); return { total: 2 }; }
  };
}

test('aggregate sends op with the parameters to /records/aggregate (GET by default)', async () => {
  const api = fakeApi();
  const signal = new AbortController().signal;
  const result = await aggregate(api, 'values', { q: [{ t: '10' }], field: '1' }, { signal });
  assert.deepEqual(result, { total: 1 });
  assert.deepEqual(api.calls[0], {
    method: 'GET', path: '/records/aggregate', query: { q: [{ t: '10' }], field: '1', op: 'values' }, signal
  });
});

test('aggregate posts the body and takes another domain', async () => {
  const api = fakeApi();
  const result = await aggregate(api, 'count', { query: 'owner:2' }, { domain: 'files', method: 'POST' });
  assert.deepEqual(result, { total: 2 });
  assert.equal(api.calls[0].path, '/files/aggregate');
  assert.deepEqual(api.calls[0].body, { query: 'owner:2', op: 'count' });
});

test('aggregate refuses an unknown op', async () => {
  assert.deepEqual([...AGGREGATE_OPS], ['count', 'rectypes', 'values', 'minmax', 'ranges']);
  await assert.rejects(aggregate(fakeApi(), 'sum', {}), TypeError);
  await assert.rejects(aggregate(null, 'count', {}), TypeError);
});
