/**
 * @file dataset.test.js
 * @brief Tests Dataset normalization and serialization.
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
import { Dataset } from "../../src/core/Dataset.js";

test("Dataset normalizes server presentation fields and preserves order", () => {
  const dataset = new Dataset({
    format: "heurist-dataset",
    version: 1,
    id: 15,
    title: "Events",
    source: { type: "heurist-query", query: "t:10" },
    fields: [
      { field: "rec_Title", title: "Title" },
      { field: "10:lt240:48:237", title: "Event type", ext: "label" },
    ],
  });
  assert.deepEqual(dataset.getFieldCodes(), ["rec_Title", "10:lt240:48:237"]);
  assert.equal(dataset.fields[1].ext, "label");
});

test("Dataset accepts the editor code alias during transition", () => {
  const dataset = new Dataset({
    source: { query: "t:10" },
    fields: [{ code: "20" }],
  });
  assert.equal(dataset.fields[0].field, "20");
});

test("Dataset requests duplicate field extensions through one physical path", () => {
  const dataset = new Dataset({
    source: { query: "t:10" },
    fields: [
      { code: "10:20", ext: "label" },
      { code: "10:20", ext: "code" },
    ],
  });
  assert.deepEqual(dataset.getFieldCodes(), ["10:20"]);
  assert.equal(dataset.fields.length, 2);
});
