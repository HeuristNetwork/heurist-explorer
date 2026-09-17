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
import { RecordDataProvider } from "../../src/data/RecordDataProvider.js";

test("RecordDataProvider requests only Query Source fields", async () => {
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
