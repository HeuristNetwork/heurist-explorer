/**
 * @file graphRestoreState.test.js
 * @brief Tests reproduction of a published view: dataset/query, expansions, visibility.
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
import { GraphApplication } from "../../src/core/GraphApplication.js";
import { GraphDocument } from "../../src/core/GraphDocument.js";

const doc = (ids, edges = []) =>
  new GraphDocument({
    records: ids.map((id) => ({ id, recordTypeId: id === 3 ? 48 : 10 })),
    edges,
  });

function makeApp(configOverrides, { datasetQuery = "t:99" } = {}) {
  const loads = [];
  const engine = {
    initialize: async () => {},
    setGraph: async (g) => {
      engine.graph = g;
    },
    syncGraph: async (g) => {
      engine.graph = g;
    },
    mergeGraph: async (g) => {
      engine.graph = g;
    },
    setSelection: async () => {},
    fit: async () => {},
    destroy: async () => {},
  };
  const app = new GraphApplication({
    config: {
      selection: [],
      limits: { maxNodes: 5000, maxEdges: 10000, maxDepth: 5 },
      engineOptions: {},
      query: null,
      ...configOverrides,
    },
    engine,
    host: {},
    datasetProvider: {
      load: async (id) => ({
        id,
        title: "Published dataset",
        source: { query: datasetQuery },
      }),
    },
    provider: {
      load: async (request) => {
        loads.push(request);
        if (request.rule) {
          const seeds = request.query.ids;
          return {
            graph: doc([...new Set([...seeds, 3])], [{ from: seeds[0], to: 3, fieldId: 7 }]),
            expansion: { targetIds: [3] },
          };
        }
        return { graph: doc([1, 2], [{ from: 1, to: 2, fieldId: 7 }]), total: 2 };
      },
    },
  });
  return { app, engine, loads };
}

test("a published datasetId activates the Dataset instead of running a raw query", async () => {
  const { app, loads } = makeApp({ datasetId: 5, query: "ids:1,2" });
  await app.initialize({ hidden: false });
  assert.equal(app.getState().datasetId, 5);
  assert.equal(app.getState().query, "t:99", "loads the Dataset's own query");
  assert.ok(!loads.some((r) => r.query === "ids:1,2"), "the stale id query is not run");
});

test("with no datasetId the persisted query is executed", async () => {
  const { app, loads } = makeApp({ datasetId: null, query: "t:10" });
  await app.initialize({ hidden: false });
  assert.equal(app.getState().query, "t:10");
  assert.deepEqual(app.graph.recordIds, [1, 2]);
  assert.equal(loads[0].query, "t:10");
});

test("published base-scope expansions are re-enabled and driven to the saved depth", async () => {
  const rules = [{ query: { "lf:1": 1 }, levels: [] }];
  const { app, loads } = makeApp({
    query: "t:10",
    rules,
    initialExpansions: { rules, enabled: [true], depth: 1 },
  });
  await app.initialize({ hidden: false });
  assert.deepEqual(app.graph.recordIds, [1, 2, 3], "expansion added node 3");
  assert.ok(loads.some((r) => r.rule), "an expansion load ran during restore");
  const state = app.getState();
  assert.deepEqual(state.expansions.enabled, [true]);
  assert.equal(state.expansions.depth, 1);
});

test("published hidden record types are applied after the graph loads", async () => {
  const rules = [{ query: { "lf:1": 1 }, levels: [] }];
  const { app } = makeApp({
    query: "t:10",
    rules,
    initialExpansions: { rules, enabled: [true], depth: 1 },
    initialHidden: { recordTypes: [48], links: [], relationships: [] },
  });
  await app.initialize({ hidden: false });
  assert.deepEqual([...app.hiddenRecordTypes], [48]);
  assert.ok(
    !app.engine.graph.recordIds.includes(3),
    "the hidden record type is filtered out of the rendered graph",
  );
  assert.deepEqual(app.getState().hidden.recordTypes, [48]);
});

test("no persisted source leaves the graph in the empty state", async () => {
  const { app, loads } = makeApp({ datasetId: null, query: null });
  const message = { hidden: true, textContent: "" };
  await app.initialize({ hidden: false }, { messageElement: message });
  assert.equal(loads.length, 0);
  assert.equal(message.hidden, false);
});
