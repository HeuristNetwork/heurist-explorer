/**
 * @file providers.test.js
 * @brief Tests data providers and API request contracts.
 * @project     Heurist academic knowledge management system
 * @package     heurist-data
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import test from "node:test";
import assert from "node:assert/strict";
import { DatasetProvider } from "../../src/data/DatasetProvider.js";
import { RecordDataProvider } from "../../src/data/RecordDataProvider.js";
import { FilterProvider } from "../../src/data/FilterProvider.js";
import { RecordTypeProvider } from "../../src/data/RecordTypeProvider.js";
import { DatasetListProvider } from "../../src/data/DatasetListProvider.js";
import { createFilterSearchRequest } from "../../src/data/FilterSearchRequest.js";

test("DatasetProvider uses the unified record-presentation endpoint", async () => {
  let request;
  const provider = new DatasetProvider({
    apiClient: {
      get: async (path, options) => {
        request = { path, options };
        return { id: 12 };
      },
    },
  });
  await provider.load(12);
  assert.equal(request.path, "/records/dataset/12");
});

test("RecordDataProvider requests only Dataset fields", async () => {
  let request;
  const provider = new RecordDataProvider({
    apiClient: {
      post: async (path, options) => {
        request = { path, options };
        return { records: [], meta: {}, pagination: {} };
      },
    },
  });
  await provider.load({ query: "t:10", fields: ["rec_Title", "20"] });
  assert.equal(request.path, "/records");
  assert.equal(request.options.body.fields, "rec_Title,20");
});

test("RecordDataProvider sends Heurist pagination, sort and filter parameters", async () => {
  let request;
  const provider = new RecordDataProvider({
    apiClient: {
      post: async (_path, options) => {
        request = options.body;
        return { records: [], meta: {}, pagination: { total: 0 } };
      },
    },
  });
  await provider.load({
    query: "t:10",
    fields: ["10:20", "10:20"],
    offset: 50,
    limit: 25,
    sort: "-f:20",
    filter: { f: "London" },
  });
  assert.deepEqual(request, {
    q: "t:10",
    fields: "10:20",
    limit: 25,
    offset: 50,
    resolveDetails: 1,
    sort: "-f:20",
    filter: { f: "London" },
  });
});

test("RecordDataProvider omits an unspecified sort so query ordering is retained", async () => {
  let request;
  const provider = new RecordDataProvider({
    apiClient: {
      post: async (_path, options) => {
        request = options.body;
        return { records: [], meta: {}, pagination: { total: 0 } };
      },
    },
  });
  await provider.load({ query: "t:10", fields: ["20"], offset: 25, limit: 25 });
  assert.equal(Object.hasOwn(request, "sort"), false);
});

test("FilterProvider loads all filters or restricts the OpenAPI request by IDs", async () => {
  const calls = [];
  const provider = new FilterProvider({
    apiClient: {
      get: async (path, options) => {
        calls.push({ path, options });
        return {
          items: [
            {
              rec_ID: 4,
              rec_Title: "Recent records",
              query: "after:2026-01-01",
            },
          ],
        };
      },
    },
  });
  const all = await provider.list();
  const selected = await provider.list({ ids: [4, "7", 4] });
  assert.deepEqual(
    all.map((item) => item.title),
    ["Recent records"],
  );
  assert.deepEqual(
    selected.map((item) => item.id),
    [4],
  );
  assert.equal(calls[0].path, "/sys");
  assert.deepEqual(calls[0].options.query, {
    q: '{"t":"filter","filterType":"filter"}',
  });
  assert.deepEqual(calls[1].options.query, {
    q: '{"t":"filter","filterType":"filter","ids":"4,7"}',
  });
});

test("FilterProvider loads a particular filter through the system endpoint", async () => {
  let request;
  const provider = new FilterProvider({
    apiClient: {
      get: async (path, options) => {
        request = { path, options };
        return { rec_ID: 9, rec_Title: "Places", query: "t:12" };
      },
    },
  });
  const result = await provider.load(9);
  assert.equal(request.path, "/sys/filter/9");
  assert.equal(request.options.query, undefined);
  assert.equal(result.query, "t:12");
});

test("DatasetListProvider resolves concept code and searches all Dataset records", async () => {
  const calls = [];
  const apiClient = {
    get: async (path, options) => {
      calls.push({ path, options });
      if (path === "/rty/2-1100") return { rty_ID: 42 };
      return {
        records: [{ rec_ID: 7, rec_RecTypeID: 42, rec_Title: "People" }],
        pagination: { total: 1 },
      };
    },
  };
  const recordTypes = new RecordTypeProvider({ apiClient });
  const provider = new DatasetListProvider({ apiClient, recordTypes });
  const result = await provider.list();
  assert.equal(calls[0].path, "/rty/2-1100");
  assert.equal(calls[1].path, "/records/");
  assert.deepEqual(JSON.parse(calls[1].options.query.q), { t: 42 });
  assert.deepEqual(result.items, [
    { id: 7, recordTypeId: 42, title: "People" },
  ]);
});

test("DatasetListProvider restricts the records search by IDs and short-circuits an empty list", async () => {
  const calls = [];
  const apiClient = {
    get: async (path, options) => {
      calls.push({ path, options });
      return path.startsWith("/rty/") ? 42 : { records: [] };
    },
  };
  const provider = new DatasetListProvider({
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

test("DatasetListProvider rejects malformed IDs", async () => {
  const provider = new DatasetListProvider({
    apiClient: { get: async () => ({ rty_ID: 42 }) },
    recordTypes: { getIdByConceptCode: async () => 42 },
  });
  await assert.rejects(() => provider.list({ ids: [7, "invalid"] }), {
    name: "TypeError",
  });
});

test("FilterProvider rejects malformed IDs", async () => {
  const provider = new FilterProvider({ apiClient: { get: async () => [] } });
  await assert.rejects(() => provider.list({ ids: [4, "invalid"] }), {
    name: "TypeError",
  });
});

test("createFilterSearchRequest parses only the saved-filter envelope", () => {
  const rules = '[{"query":{"t":10,"r":3115}}]';
  const request = createFilterSearchRequest(
    {
      query: JSON.stringify({
        q: "t:10 Ivanov",
        rules,
        rulesonly: 0,
      }),
    },
    { searchRealm: "main", source: "data-widget" },
  );
  assert.deepEqual(request, {
    q: "t:10 Ivanov",
    rules,
    rulesonly: 0,
    detail: "ids",
    isNewEngine: true,
    search_realm: "main",
    source: "data-widget",
  });
});

test("createFilterSearchRequest keeps a plain query and omits undefined rules", () => {
  assert.deepEqual(createFilterSearchRequest({ query: "t:10" }), {
    q: "t:10",
    detail: "ids",
    isNewEngine: true,
    search_realm: null,
    source: null,
  });
});

test("RecordDataProvider requests count without loading IDs", async () => {
  const calls = [];
  const provider = new RecordDataProvider({
    apiClient: {
      post: async (path, options) => {
        calls.push({ path, options });
        return { query: "t:10", total: 3 };
      },
    },
  });
  const result = await provider.count({
    query: "t:10",
    filter: { f: "London" },
  });
  assert.equal(result.total, 3);
  assert.equal(calls[0].path, "/records");
  assert.deepEqual(calls[0].options.body, {
    query: "t:10",
    detail: "count",
    filter: { f: "London" },
  });
});

test("RecordDataProvider requests and validates record-type counts", async () => {
  const provider = new RecordDataProvider({
    apiClient: {
      post: async () => ({
        query: "t:10",
        total: 3,
        rectypes: [{ rec_RecTypeID: 10, count: 3 }],
      }),
    },
  });
  const result = await provider.rectypes({ query: "t:10" });
  assert.deepEqual(result.rectypes, [{ rec_RecTypeID: 10, count: 3 }]);

  const invalid = new RecordDataProvider({
    apiClient: { post: async () => ({ total: 3 }) },
  });
  await assert.rejects(
    () => invalid.rectypes({ query: "t:10" }),
    /missing rectypes/,
  );
});
