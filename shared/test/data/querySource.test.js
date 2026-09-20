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

test("QuerySource normalizes timefields through the same field normalizer as fields", () => {
  const querySource = new QuerySource({
    source: { query: "t:10" },
    timefields: [{ field: "10:20", title: "Start" }, "10:21"],
  });
  assert.deepEqual(
    querySource.timefields.map((field) => field.field),
    ["10:20", "10:21"],
  );
  assert.equal(querySource.timefields[0].title, "Start");
});

test("QuerySource defaults timefields, map and rules when the server omits them", () => {
  const querySource = new QuerySource({ source: { query: "t:10" } });
  assert.deepEqual(querySource.timefields, []);
  assert.deepEqual(querySource.map, {
    geoFields: [],
    dynamicRequests: false,
    minZoom: null,
    maxZoom: null,
    geoOutputMode: 'records',
  });
  assert.deepEqual(querySource.rules, []);
});

test("QuerySource normalizes map.geoFields through the field normalizer and coerces zoom/dynamicRequests", () => {
  const querySource = new QuerySource({
    source: { query: "t:10" },
    map: {
      geoFields: ["10:22"],
      dynamicRequests: true,
      minZoom: "4",
      maxZoom: 15,
    },
  });
  assert.deepEqual(
    querySource.map.geoFields.map((field) => field.field),
    ["10:22"],
  );
  assert.equal(querySource.map.dynamicRequests, true);
  assert.equal(querySource.map.geoOutputMode, 'records');
  assert.equal(querySource.map.minZoom, 4);
  assert.equal(querySource.map.maxZoom, 15);
});

test("QuerySource passes expansion rules through unvalidated (opaque to the client)", () => {
  const rules = [{ name: "Parents", query: { "lf:1": 1 }, levels: [] }];
  const querySource = new QuerySource({ source: { query: "t:10" }, rules });
  assert.deepEqual(querySource.rules, rules);
});

test("QuerySource#toJSON includes timefields, map and rules", () => {
  const querySource = new QuerySource({
    source: { query: "t:10" },
    timefields: ["10:20"],
    map: { geoFields: ["10:22"], dynamicRequests: true, minZoom: 4, maxZoom: 15 },
    rules: [{ name: "Parents" }],
  });
  const json = JSON.parse(JSON.stringify(querySource));
  assert.deepEqual(
    json.timefields.map((field) => field.field),
    ["10:20"],
  );
  assert.equal(json.map.dynamicRequests, true);
  assert.deepEqual(json.rules, [{ name: "Parents" }]);
});

test("QuerySource keeps the Filter Form layout separate from the query", () => {
  const query = [{ t: "10" }, { "f:1": "$X1$" }];
  const filterForm = { version: 1, groups: [{ id: "main", type: "section",
    children: [{ input: "X1", label: "Person name" }] }] };
  const source = new QuerySource({ source: { query }, filterForm });
  assert.deepEqual(source.toJSON().source.query, query);
  assert.deepEqual(source.toJSON().filterForm, filterForm);
});
