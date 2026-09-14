/**
 * @file loaders.test.js
 * @brief Tests Dataset and query loaders.
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
import { DatasetLoader } from "../../src/engine/loaders/DatasetLoader.js";
import { QueryLoader } from "../../src/engine/loaders/QueryLoader.js";

test("DatasetLoader retrieves definition then selected record fields", async () => {
  const calls = [];
  const loader = new DatasetLoader({
    datasetProvider: {
      load: async () => ({
        id: 7,
        source: { query: "t:10" },
        fields: [{ field: "rec_Title" }, { field: "20" }],
      }),
    },
    recordDataProvider: {
      load: async (request) => {
        calls.push(request);
        return { records: [], meta: {}, pagination: { total: 0 } };
      },
    },
  });
  const result = await loader.load({ datasetId: 7 });
  assert.equal(result.dataset.id, 7);
  assert.deepEqual(calls[0].fields, ["rec_Title", "20"]);
  assert.equal(calls[0].query, "t:10");
});

test("DatasetLoader can request only presentation fields", async () => {
  let request;
  const loader = new DatasetLoader({
    datasetProvider: {
      load: async () => ({
        source: { query: "t:10" },
        fields: [{ field: "rec_Title" }, { field: "20" }],
      }),
    },
    recordDataProvider: {
      load: async (value) => {
        request = value;
        return { records: [], meta: {}, pagination: {} };
      },
    },
  });
  await loader.load({
    datasetId: 7,
    includeDatasetFields: false,
    additionalFields: ["rec_OwnerName", "rec_ThumbnailURL"],
  });
  assert.deepEqual(request.fields, ["rec_OwnerName", "rec_ThumbnailURL"]);
});

test("QueryLoader creates a transient Filtered Result Dataset", async () => {
  const loader = new QueryLoader({
    recordDataProvider: {
      load: async () => ({ records: [], meta: {}, pagination: {} }),
    },
  });
  const result = await loader.load({ query: "ids:1,2" });
  assert.equal(result.dataset.id, null);
  assert.equal(result.dataset.title, "Filtered Result");
  assert.deepEqual(result.dataset.getFieldCodes(), [
    "rec_Title",
    "rec_RecTypeID",
  ]);
});

test("QueryLoader can request only presentation fields", async () => {
  let request;
  const loader = new QueryLoader({
    recordDataProvider: {
      load: async (value) => {
        request = value;
        return { records: [], meta: {}, pagination: {} };
      },
    },
  });
  await loader.load({
    query: "ids:1,2",
    includeDatasetFields: false,
    additionalFields: ["rec_OwnerName", "rec_ThumbnailURL"],
  });
  assert.deepEqual(request.fields, ["rec_OwnerName", "rec_ThumbnailURL"]);
});
