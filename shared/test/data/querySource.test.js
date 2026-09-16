/**
 * @file querySource.test.js
 * @brief Tests QuerySource normalization and serialization.
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
import { QuerySource } from "../../src/data/QuerySource.js";

test("QuerySource normalizes server presentation fields and preserves order", () => {
  const querySource = new QuerySource({
    format: "heurist-query-source",
    version: 1,
    id: 15,
    title: "Events",
    source: { type: "heurist-query", query: "t:10" },
    fields: [
      { field: "rec_Title", title: "Title" },
      { field: "10:lt240:48:237", title: "Event type", ext: "label" },
    ],
  });
  assert.deepEqual(querySource.getFieldCodes(), ["rec_Title", "10:lt240:48:237"]);
  assert.equal(querySource.fields[1].ext, "label");
});

test("QuerySource accepts the editor code alias during transition", () => {
  const querySource = new QuerySource({
    source: { query: "t:10" },
    fields: [{ code: "20" }],
  });
  assert.equal(querySource.fields[0].field, "20");
});

test("QuerySource requests duplicate field extensions through one physical path", () => {
  const querySource = new QuerySource({
    source: { query: "t:10" },
    fields: [
      { code: "10:20", ext: "label" },
      { code: "10:20", ext: "code" },
    ],
  });
  assert.deepEqual(querySource.getFieldCodes(), ["10:20"]);
  assert.equal(querySource.fields.length, 2);
});

test("QuerySource rejects an unsupported format", () => {
  assert.throws(
    () => new QuerySource({ format: "heurist-dataset", source: { query: "t:10" } }),
    { name: "TypeError" },
  );
});

test("QuerySource rejects a missing source query", () => {
  assert.throws(() => new QuerySource({ source: {} }), { name: "TypeError" });
});

test("QuerySource#toJSON round-trips through JSON", () => {
  const querySource = new QuerySource({
    id: 15,
    title: "Events",
    source: { query: "t:10" },
    fields: ["rec_Title"],
  });
  const json = JSON.parse(JSON.stringify(querySource));
  assert.equal(json.format, "heurist-query-source");
  assert.equal(json.id, 15);
  assert.equal(json.source.query, "t:10");
});
