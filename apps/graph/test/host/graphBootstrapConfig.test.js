/**
 * @file graphBootstrapConfig.test.js
 * @brief Tests getHeuristGraphConfig() maps the publication `state` snapshot into config.
 * @project     Heurist academic knowledge management system
 * @package     heurist-graph
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import test from "node:test";
import assert from "node:assert/strict";
import { getHeuristGraphConfig } from "../../src/graphConfig.js";

function withBootstrap(value, run) {
  const previous = globalThis.heuristModuleBootstrap;
  globalThis.heuristModuleBootstrap = value;
  try {
    return run();
  } finally {
    globalThis.heuristModuleBootstrap = previous;
  }
}

test("a published bootstrap restores query/datasetId/expansions/hidden from state (not source)", () => {
  const config = withBootstrap(
    {
      runtime: { database: "db", baseUrl: "https://h.org/", runtimeMode: "published" },
      settings: {
        format: "heurist-graph-settings",
        options: {},
        config: {},
      },
      // The server sends no `source` for publications - only `state`.
      state: {
        query: "t:10",
        datasetId: 5,
        datasetTitle: "Published dataset",
        selection: [42],
        expansions: { rules: [{ query: "lf:1" }], enabled: [true], depth: 2 },
        hidden: { recordTypes: [48], links: ["link:x"], relationships: [] },
      },
    },
    getHeuristGraphConfig,
  );

  assert.equal(config.query, "t:10");
  assert.equal(config.datasetId, 5);
  assert.equal(config.datasetTitle, "Published dataset");
  assert.deepEqual(config.selection, [42]);
  assert.deepEqual(config.initialExpansions, {
    rules: [{ query: "lf:1" }],
    enabled: [true],
    depth: 2,
  });
  assert.deepEqual(config.rules, [{ query: "lf:1" }]);
  assert.deepEqual(config.initialHidden, {
    recordTypes: [48],
    links: ["link:x"],
    relationships: [],
  });
  assert.equal(config.loadPreferencesOnInit, false);
});

test("an embedded bootstrap still reads query/selection from source", () => {
  const config = withBootstrap(
    {
      runtime: { database: "db", baseUrl: "https://h.org/" },
      settings: { options: {}, config: {} },
      state: null,
      source: { query: "ids:1,2,3", selection: [2] },
    },
    getHeuristGraphConfig,
  );

  assert.equal(config.query, "ids:1,2,3");
  assert.deepEqual(config.selection, [2]);
  assert.equal(config.datasetId, null);
  assert.equal(config.initialExpansions, null);
  assert.equal(config.initialHidden, null);
});

test("a publication `state` wins over any stale embedded `source`", () => {
  const config = withBootstrap(
    {
      runtime: { database: "db", baseUrl: "https://h.org/", runtimeMode: "published" },
      settings: { options: {}, config: {} },
      source: { query: "ids:9,9,9", selection: [9] },
      state: { query: "t:10", datasetId: null, selection: [] },
    },
    getHeuristGraphConfig,
  );

  assert.equal(config.query, "t:10");
  assert.deepEqual(config.selection, []);
});
