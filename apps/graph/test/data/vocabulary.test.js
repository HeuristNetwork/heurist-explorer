/**
 * @file vocabulary.test.js
 * @brief Tests detail-type and relation-type label resolution.
 * @project     Heurist academic knowledge management system
 * @package     heurist-graph
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import test from "node:test";
import assert from "node:assert/strict";
import { VocabularyProvider } from "../../src/data/VocabularyProvider.js";

/** Stub of HeuristApiClient.get for /fields. */
function stubApiClient({ fields = {} } = {}) {
  const calls = [];
  return {
    calls,
    async get(path, { query } = {}) {
      calls.push({ path, query });
      if (path === "/fields") {
        const ids = String(query.dty_ID).split(",").map(Number);
        return {
          items: ids
            .filter((id) => fields[id] != null)
            .map((id) => ({ dty_ID: String(id), dty_Name: fields[id] })),
        };
      }
      throw new Error(`unexpected path ${path}`);
    },
  };
}

test("VocabularyProvider resolves detail-type names and caches ids and misses", async () => {
  const api = stubApiClient({ fields: { 1: "Name", 16: "Person" } });
  const provider = new VocabularyProvider({ apiClient: api });

  const first = await provider.getFieldNames([1, 16, 999]);
  assert.deepEqual([...first.entries()], [
    [1, "Name"],
    [16, "Person"],
  ]);
  assert.equal(first.has(999), false, "unknown id is omitted, not guessed");

  // Second call for the same ids must not hit the API again (misses cached too).
  await provider.getFieldNames([1, 16, 999]);
  assert.equal(api.calls.filter((c) => c.path === "/fields").length, 1);
});


const node = (id, label, children = []) => ({ id, label, children });

test('Relation types load labeled ancestor trees in one batch and cache misses', async () => {
  const calls = [];
  const provider = new VocabularyProvider({ apiClient: { get: async (path, options) => {
    calls.push({ path, ...options });
    return { items: [node(1, 'Family', [node(2, 'Parent', [node(3, 'Biological'), node(4, 'Adoptive')])]), node(10, 'Work', [node(11, 'Colleague')])] };
  } } });
  const { trees, names } = await provider.getRelationTypeTrees([3, 4, 11, 999, 3]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, '/termlinks');
  assert.deepEqual(calls[0].query, { termId: '3,4,11,999', tree: 1, limit: 1000 });
  assert.equal(names.get(2), 'Parent');
  assert.deepEqual(trees[1].children[0].children.map(n => n.id), [4, 3]);
  assert.equal(trees[10].children[0].id, 11);
  assert.equal(trees[999].label, '999');
  assert.equal(names.has(999), false);
  await provider.getRelationTypeTrees([3, 4, 11, 999]);
  const subset = await provider.getRelationTypeTrees([3]);
  assert.equal(calls.length, 1);
  assert.deepEqual(Object.keys(subset.trees), ['1']);
  assert.deepEqual(subset.trees[1].children[0].children.map(n => n.id), [3]);
});

test('New branches merge into cached ancestors without losing earlier branches', async () => {
  const calls = [];
  const provider = new VocabularyProvider({ apiClient: { get: async (_path, { query }) => {
    calls.push(query.termId);
    return { items: [node(1, 'Vocabulary', [node(Number(query.termId), query.termId)])] };
  } } });
  await provider.getRelationTypeTrees([2]);
  const result = await provider.getRelationTypeTrees([2, 3]);
  assert.deepEqual(calls, ['2', '3']);
  assert.deepEqual(result.trees[1].children.map(n => n.id), [2, 3]);
});

test('Failed and malformed hierarchy responses remain retryable', async () => {
  for (const failure of [new Error('network down'), { items: [node(1, 'Broken', [{ id: 2 }])] }, { items: [], pagination: { next: '/next' } }]) {
    let attempts = 0;
    const provider = new VocabularyProvider({ apiClient: { get: async () => {
      if (!attempts++) { if (failure instanceof Error) throw failure; return failure; }
      return { items: [node(1, 'Vocabulary', [node(2, 'Resolved')])] };
    } } });
    const first = await provider.getRelationTypeTrees([2]);
    assert.equal(first.names.size, 0);
    assert.equal(first.trees[2].label, '2');
    const retry = await provider.getRelationTypeTrees([2]);
    assert.equal(retry.names.get(2), 'Resolved');
    assert.equal(attempts, 2);
  }
});

test('Hierarchy batches respect the server limit and propagate cancellation', async () => {
  const batches = [];
  const provider = new VocabularyProvider({ apiClient: { get: async (_path, { query }) => {
    batches.push(query.termId.split(',')); return { items: [] };
  } } });
  await provider.getRelationTypeTrees(Array.from({ length: 1001 }, (_, i) => i + 1));
  assert.deepEqual(batches.map(b => b.length), [1000, 1]);
  const controller = new AbortController();
  controller.abort();
  const aborted = new VocabularyProvider({ apiClient: { get: async (_path, { signal }) => { assert.equal(signal, controller.signal); throw signal.reason; } } });
  await assert.rejects(aborted.getRelationTypeTrees([2], { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(aborted.resolvedTerms.size, 0);
});

test('Empty relation sets require no API call and deep ancestor trees are preserved', async () => {
  let calls = 0;
  let root = node(30, '30');
  for (let id = 29; id > 0; id--) root = node(id, String(id), [root]);
  const provider = new VocabularyProvider({ apiClient: { get: async () => { calls++; return { items: [root] }; } } });
  assert.deepEqual(await provider.getRelationTypeTrees([]), { names: new Map(), trees: {} });
  assert.equal(calls, 0);
  const result = await provider.getRelationTypeTrees([30]);
  assert.equal(result.names.size, 30);
  let last = result.trees[1];
  while (last.children.length) last = last.children[0];
  assert.equal(last.id, 30);
});
