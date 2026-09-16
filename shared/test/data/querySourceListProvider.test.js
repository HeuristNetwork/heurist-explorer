/**
 * @file querySourceListProvider.test.js
 * @brief Tests the Query Source list/search contract and the missing-definition soft-fail guard.
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import test from "node:test";
import assert from "node:assert/strict";
import { QuerySourceListProvider } from "../../src/data/QuerySourceListProvider.js";
import { RecordTypeProvider } from "../../src/data/RecordTypeProvider.js";

test("QuerySourceListProvider resolves concept code and searches all Query Source records", async () => {
  const calls = [];
  const apiClient = {
    get: async (path, options) => {
      calls.push({ path, options });
      if (path === "/rty/3-1021") return { rty_ID: 42 };
      return {
        records: [{ rec_ID: 7, rec_RecTypeID: 42, rec_Title: "People" }],
        pagination: { total: 1 },
      };
    },
  };
  const recordTypes = new RecordTypeProvider({ apiClient });
  const provider = new QuerySourceListProvider({ apiClient, recordTypes });
  const result = await provider.list();
  assert.equal(calls[0].path, "/rty/3-1021");
  assert.equal(calls[1].path, "/records/");
  assert.deepEqual(JSON.parse(calls[1].options.query.q), { t: 42 });
  assert.deepEqual(result.items, [
    { id: 7, recordTypeId: 42, title: "People" },
  ]);
});

test("QuerySourceListProvider restricts the records search by IDs and short-circuits an empty list", async () => {
  const calls = [];
  const apiClient = {
    get: async (path, options) => {
      calls.push({ path, options });
      return path.startsWith("/rty/") ? 42 : { records: [] };
    },
  };
  const provider = new QuerySourceListProvider({
    apiClient,
    recordTypes: new RecordTypeProvider({ apiClient }),
  });
  await provider.list({ ids: [9, "9", 12] });
  assert.deepEqual(JSON.parse(calls[1].options.query.q), {
    t: 42,
    ids: [9, 12],
  });
  const empty = await provider.list({ ids: [] });
  assert.deepEqual(empty.items, []);
  assert.equal(calls.filter((call) => call.path === "/records/").length, 1);
});

test("QuerySourceListProvider rejects malformed IDs", async () => {
  const provider = new QuerySourceListProvider({
    apiClient: { get: async () => ({ rty_ID: 42 }) },
    recordTypes: { getIdByConceptCode: async () => 42 },
  });
  await assert.rejects(() => provider.list({ ids: [7, "invalid"] }), {
    name: "TypeError",
  });
});

test("missing Query Source definition returns an empty list and disables editing once", async () => {
  let lookups = 0, disabled = 0;
  const provider = new QuerySourceListProvider({
    apiClient: { get: async () => { assert.fail("Must not query Query Source records"); } },
    recordTypes: { getIdByConceptCode: async () => { lookups++; throw new Error("Heurist API request failed: Definition not found"); } },
    onUnavailable: () => { disabled++; },
  });
  assert.deepEqual(await provider.list(), { items: [], pagination: null, recordTypeId: null });
  assert.deepEqual(await provider.list({ ids: [] }), { items: [], pagination: null, recordTypeId: null });
  assert.equal(lookups, 1);
  assert.equal(disabled, 1);
  assert.equal(provider.available, false);
});

test("Query Source definition fallback preserves unrelated API errors and allows retry", async () => {
  const error = new Error("Unauthorized");
  let attempts = 0;
  const provider = new QuerySourceListProvider({
    recordTypes: { getIdByConceptCode: async () => { if (!attempts++) throw error; return 123; } },
    onUnavailable: () => assert.fail("Must not disable Query Sources"),
  });
  await assert.rejects(provider.list(), error);
  assert.equal((await provider.list({ ids: [] })).recordTypeId, 123);
});
