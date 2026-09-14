/**
 * @file graph.test.js
 * @brief Tests graph normalization, API requests, and application merging.
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
import { GraphDocument } from "../src/core/GraphDocument.js";
import { GraphProvider } from "../src/data/GraphProvider.js";
import { GraphApplication } from "../src/core/GraphApplication.js";
import { HeuristGraphHostAdapter } from "../src/host/HeuristGraphHostAdapter.js";

function graphEnvelope(graph = {}) {
  return {
    query: "t:10",
    total: graph.total ?? 0,
    offset: 0,
    limit: 1000,
    graph: {
      records: graph.records || [],
      edges: graph.edges || [],
      links: graph.links || {},
      paths: graph.paths || {},
      limits: graph.limits || {
        maxNodes: 5000,
        maxEdges: 10000,
        maxDepth: 5,
        nodesReturned: (graph.records || []).length,
        edgesReturned: (graph.edges || []).length,
        truncated: false,
      },
    },
  };
}

test("GraphDocument normalizes legacy graph records and edges", () => {
  const graph = new GraphDocument({
    records: [{ rec_ID: 1, rec_RecTypeID: 10, rec_Title: "A" }],
    edges: [{ source: 1, target: 2, field: 240 }],
  });
  assert.deepEqual(graph.recordIds, [1]);
  assert.deepEqual(graph.edges[0], {
    id: "1:2:240:0",
    from: 1,
    to: 2,
    fieldId: 240,
    relationshipId: null,
    link: null,
    path: null,
    raw: { source: 1, target: 2, field: 240 },
  });
});

test("GraphDocument keeps edge link/path provenance and the links map", () => {
  const graph = new GraphDocument(
    graphEnvelope({
      records: [{ rec_ID: 1, rec_RecTypeID: 10, rec_Title: "A" }],
      edges: [
        {
          id: "1:2:240:0:l1",
          source: 1,
          target: 2,
          field: 240,
          relationship: null,
          link: "l1",
          path: null,
        },
        {
          id: "2:3:0:0:p1",
          source: 2,
          target: 3,
          field: null,
          relationship: null,
          link: null,
          path: "p1",
        },
      ],
      links: { l1: "10:lt240:48" },
      paths: { p1: "10:lt240:48:lt134:12" },
    }),
  );
  assert.deepEqual(graph.links, { l1: "10:lt240:48" });
  assert.deepEqual(graph.paths, { p1: "10:lt240:48:lt134:12" });
  assert.equal(graph.edges[0].link, "l1");
  assert.equal(graph.edges[0].path, null);
  assert.equal(graph.edges[1].link, null);
  assert.equal(graph.edges[1].path, "p1");
});

test("GraphProvider posts the dedicated graph request with links and limits", async () => {
  let request;
  const provider = new GraphProvider({
    apiClient: {
      post: async (path, options) => {
        request = { path, options };
        return graphEnvelope({ total: 1 });
      },
    },
  });
  const result = await provider.load({
    query: "t:10",
    links: "all",
    limits: { maxNodes: 10, maxEdges: 0, bogus: 5 },
  });
  assert.equal(request.path, "/graph");
  assert.deepEqual(request.options.body, {
    query: "t:10",
    limit: 10,
    offset: 0,
    links: "all",
    limits: { maxNodes: 10 },
  });
  assert.equal(result.total, 1);
  assert.ok(result.graph instanceof GraphDocument);
});

test("GraphProvider forwards explicit link specs and omits empty selections", async () => {
  let body;
  const provider = new GraphProvider({
    apiClient: {
      post: async (_path, options) => {
        body = options.body;
        return graphEnvelope();
      },
    },
  });
  await provider.load({ query: "t:10", links: ["10:lt240:48", "10:lt240:48"] });
  assert.deepEqual(body.links, ["10:lt240:48"]);
  await provider.load({ query: "t:10", links: [] });
  assert.equal(Object.hasOwn(body, "links"), false);
});

test("GraphProvider rejects a response without a valid graph document", async () => {
  const provider = new GraphProvider({
    apiClient: { post: async () => ({ ids: [1], total: 1 }) },
  });
  await assert.rejects(
    () => provider.load({ query: "t:10" }),
    /missing a valid graph document/,
  );
});

test("GraphApplication loads and merges explicit graph fragments", async () => {
  const calls = [];
  const graphs = [
    { records: [{ rec_ID: 1, rec_Title: "A" }], edges: [], paths: {} },
    {
      records: [{ rec_ID: 2, rec_Title: "B" }],
      edges: [{ source: 1, target: 2 }],
      paths: {},
    },
  ];
  let index = 0;
  const application = new GraphApplication({
    config: { query: "t:10", selection: [], limits: {} },
    provider: {
      load: async (request) => {
        calls.push(request);
        return { graph: new GraphDocument(graphs[index++]) };
      },
    },
    engine: {
      initialize: async () => {},
      setGraph: async (graph) => {
        assert.deepEqual(graph.recordIds, [1]);
      },
      mergeGraph: async (graph) => {
        assert.deepEqual(graph.recordIds, [1, 2]);
      },
      setSelection: async () => {},
      destroy: async () => {},
    },
    host: { initialize: async () => {}, destroy: async () => {} },
  });
  await application.initialize({});
  await application.load({ query: { ids: [1] }, merge: true });
  assert.equal(calls.length, 2);
  assert.deepEqual(application.getState().recordIds, [1, 2]);
  assert.deepEqual(calls[0].links, "all");
  assert.equal(calls[1].links, undefined);
  assert.deepEqual(calls[1].query, { ids: [1] });
});

test("GraphApplication builds a legend and hides record types and link groups", async () => {
  let rendered;
  const engine = {
    initialize: async () => {},
    setGraph: async (graph) => {
      rendered = graph;
    },
    mergeGraph: async (graph) => {
      rendered = graph;
    },
    setSelection: async () => {},
    destroy: async () => {},
  };
  const payload = graphEnvelope({
    records: [
      { rec_ID: 1, rec_RecTypeID: 10, rec_Title: "Person" },
      { rec_ID: 2, rec_RecTypeID: 12, rec_Title: "Event" },
    ],
    edges: [
      { id: "1:2:240:0:l1", source: 1, target: 2, field: 240, link: "l1" },
    ],
    links: { l1: "10:lt240:48" },
  });
  const application = new GraphApplication({
    config: { query: "t:10", selection: [], limits: {} },
    provider: { load: async () => ({ graph: new GraphDocument(payload) }) },
    engine,
    host: {},
  });
  await application.initialize({});

  const legend = application.getLegend();
  assert.deepEqual(
    legend.recordTypes.map((entry) => entry.recordTypeId).sort(),
    [10, 12],
  );
  assert.equal(legend.links[0].key, "link:l1");
  assert.equal(legend.links[0].spec, "10:lt240:48");
  assert.equal(legend.links[0].visible, true);

  await application.setRecordTypeVisibility(12, false);
  assert.deepEqual(rendered.recordIds, [1]);
  assert.equal(rendered.edges.length, 0);
  assert.equal(
    application.getLegend().recordTypes.find((e) => e.recordTypeId === 12)
      .visible,
    false,
  );

  await application.setRecordTypeVisibility(12, true);
  await application.setLinkVisibility("link:l1", false);
  assert.deepEqual(rendered.recordIds, [1, 2]);
  assert.equal(rendered.edges.length, 0);
});

test("GraphApplication resolves edge detail-type and relation-type labels after load", async () => {
  const labelPushes = [];
  const engine = {
    initialize: async () => {},
    setGraph: async () => {},
    mergeGraph: async () => {},
    setSelection: async () => {},
    setEdgeLabels: async (labels) => labelPushes.push(labels),
    destroy: async () => {},
  };
  const payload = graphEnvelope({
    records: [
      { rec_ID: 1, rec_RecTypeID: 10, rec_Title: "Person A" },
      { rec_ID: 2, rec_RecTypeID: 10, rec_Title: "Person B" },
      { rec_ID: 3, rec_RecTypeID: 12, rec_Title: "Event" },
    ],
    edges: [
      { id: "1:3:16:0", source: 1, target: 3, field: 16 },
      { id: "1:2:0:3089", source: 1, target: 2, relationship: 3089 },
    ],
  });
  const vocabularyProvider = {
    getFieldNames: async (ids) => {
      assert.deepEqual([...ids].sort(), [16]);
      return new Map([[16, "Person"]]);
    },
    getRelationTypeTrees: async (ids) => {
      assert.deepEqual([...ids].sort(), [3089]);
      return {
        names: new Map([
          [3089, "IsParentOf"],
          [3095, "IsBiologicalParentOf"],
        ]),
        trees: {
          3089: {
            id: 3089,
            label: "IsParentOf",
            children: [{ id: 3095, label: "IsBiologicalParentOf", children: [] }],
          },
        },
      };
    },
  };
  const application = new GraphApplication({
    config: { query: "t:10", selection: [], limits: {} },
    provider: { load: async () => ({ graph: new GraphDocument(payload) }) },
    engine,
    host: {},
    vocabularyProvider,
  });

  let vocabEvent;
  application.addEventListener("heurist-graph-vocabulary-changed", (event) => {
    vocabEvent = event.detail;
  });

  await application.initialize({});

  assert.equal(labelPushes.length, 1);
  assert.equal(labelPushes[0].fields.get(16), "Person");
  assert.equal(labelPushes[0].relationTypes.get(3089), "IsParentOf");

  const vocab = application.getVocabulary();
  assert.equal(vocab.fields.get(16), "Person");
  assert.equal(vocab.relationTypeTrees[3089].children[0].label, "IsBiologicalParentOf");
  assert.deepEqual(vocabEvent.relationTypeTrees, vocab.relationTypeTrees);

  const legend = application.getLegend();
  const fieldGroup = legend.links.find((l) => l.key === "field:16");
  const relGroup = legend.links.find((l) => l.key === "relationship:3089");
  assert.equal(fieldGroup.label, "Person");
  assert.equal(relGroup.label, "IsParentOf");
  assert.deepEqual(legend.relationTypeTrees, vocab.relationTypeTrees);
});

test("GraphApplication load works unchanged without a vocabulary provider", async () => {
  const engine = {
    initialize: async () => {},
    setGraph: async () => {},
    mergeGraph: async () => {},
    setSelection: async () => {},
    destroy: async () => {},
  };
  const application = new GraphApplication({
    config: { query: "t:10", selection: [], limits: {} },
    provider: {
      load: async () => ({
        graph: new GraphDocument(
          graphEnvelope({
            records: [{ rec_ID: 1, rec_RecTypeID: 10, rec_Title: "A" }],
            edges: [{ id: "1:2:16:0", source: 1, target: 2, field: 16 }],
          }),
        ),
      }),
    },
    engine,
    host: {},
  });
  await application.initialize({});
  const legend = application.getLegend();
  assert.equal(legend.links[0].label, null);
  assert.deepEqual(application.getVocabulary().relationTypeTrees, {});
});

test("HeuristGraphHostAdapter publishes selection through the bridge", async () => {
  let selection;
  const host = new HeuristGraphHostAdapter({
    bridge: {
      onSelection: (ids) => {
        selection = ids;
      },
    },
  });
  await host.initialize();
  host.publishSelection([3, 4]);
  assert.deepEqual(selection, [3, 4]);
});

test("GraphApplication ignores a Filtered Result query while a Dataset is active, and activateCurrentResults restores the last remembered query", async () => {
  const engine = {
    initialize: async () => {},
    setGraph: async () => {},
    mergeGraph: async () => {},
    setSelection: async () => {},
    destroy: async () => {},
  };
  const datasetProvider = {
    load: async (id) => ({ id, title: "My dataset", source: { query: "t:20" } }),
  };
  const application = new GraphApplication({
    config: { query: "t:10", selection: [], limits: {} },
    provider: { load: async ({ query }) => ({ graph: new GraphDocument(graphEnvelope({})), query }) },
    engine,
    host: {},
    datasetProvider,
  });
  await application.initialize({});
  assert.equal(application.getState().query, "t:10");

  await application.setDataset(5);
  assert.equal(application.getState().datasetId, 5);
  assert.equal(application.getState().query, "t:20");

  // A host-driven Filtered Result query must not clobber the active Dataset,
  // but it must still be remembered - heurist-data's "host search events keep
  // Filtered Result up to date" - so reactivating Filtered Result afterward
  // shows the latest search, not a stale one from before the Dataset was
  // selected.
  const result = await application.load({ query: "t:99" });
  assert.equal(result.datasetId, 5);
  assert.equal(application.getState().query, "t:20");

  // Reactivating Filtered Result restores the latest remembered query (t:99),
  // not the one that was active before the Dataset was selected (t:10).
  await application.activateCurrentResults();
  assert.equal(application.getState().datasetId, null);
  assert.equal(application.getState().query, "t:99");
});

test("GraphApplication.load(null) always clears, deactivating an active Dataset", async () => {
  const engine = {
    initialize: async () => {},
    setGraph: async () => {},
    mergeGraph: async () => {},
    setSelection: async () => {},
    destroy: async () => {},
  };
  const datasetProvider = {
    load: async (id) => ({ id, source: { query: "t:20" } }),
  };
  const application = new GraphApplication({
    config: { query: "t:10", selection: [], limits: {} },
    provider: { load: async ({ query }) => ({ graph: new GraphDocument(graphEnvelope({})), query }) },
    engine,
    host: {},
    datasetProvider,
  });
  await application.initialize({});
  await application.setDataset(5);
  assert.equal(application.getState().datasetId, 5);

  await application.load({ query: null });
  assert.equal(application.getState().datasetId, null);
  assert.equal(application.getState().query, null);
});

test("GraphApplication.requestPopupContent loads content through the configured Popup template", async () => {
  const application = new GraphApplication({
    config: { selection: [], limits: {}, engineOptions: { popupTemplate: "custom-popup" } },
    provider: { load: async () => ({ graph: new GraphDocument(graphEnvelope({})) }) },
    engine: { initialize: async () => {} },
    host: {},
    recordContentProvider: {
      load: async ({ records, template }) => {
        assert.equal(template, "custom-popup");
        assert.deepEqual(records, [{ rec_ID: 7 }]);
        return new Map([[7, "<div>Custom</div>"]]);
      },
    },
  });
  const html = await application.requestPopupContent({ recordId: 7 });
  assert.equal(html, "<div>Custom</div>");
});

test("GraphApplication.requestPopupContent is a no-op without a configured template", async () => {
  const application = new GraphApplication({
    config: { selection: [], limits: {}, engineOptions: {} },
    provider: { load: async () => ({ graph: new GraphDocument(graphEnvelope({})) }) },
    engine: { initialize: async () => {} },
    host: {},
    recordContentProvider: {
      load: async () => assert.fail("must not fetch without a popupTemplate"),
    },
  });
  const html = await application.requestPopupContent({ recordId: 7 });
  assert.equal(html, null);
});

test("GraphApplication.activateFilter triggers the host search in hosted mode and loads locally in standalone mode", async () => {
  const engine = {
    initialize: async () => {},
    setGraph: async () => {},
    mergeGraph: async () => {},
    setSelection: async () => {},
    destroy: async () => {},
  };
  let searchRequest = null;
  const hostedApplication = new GraphApplication({
    config: { selection: [], limits: {}, searchRealm: "graph1", sourceId: "graph1" },
    provider: { load: async () => assert.fail("standalone load must not run in hosted mode") },
    engine,
    host: {
      supportsSearch: () => true,
      doSearch: (request) => {
        searchRequest = request;
      },
    },
  });
  await hostedApplication.initialize({});
  await hostedApplication.activateFilter({ id: 1, query: "t:30" });
  assert.equal(searchRequest.q, "t:30");
  assert.equal(searchRequest.search_realm, "graph1");

  let loadedQuery = null;
  const standaloneApplication = new GraphApplication({
    config: { selection: [], limits: {} },
    provider: {
      load: async ({ query }) => {
        loadedQuery = query;
        return { graph: new GraphDocument(graphEnvelope({})), query };
      },
    },
    engine,
    host: {},
  });
  await standaloneApplication.initialize({});
  await standaloneApplication.activateFilter({ id: 2, query: "t:40" });
  assert.equal(loadedQuery, "t:40");
});

test("GraphApplication shows the configured empty-result message for a missing or empty query", async () => {
  const engine = {
    initialize: async () => {},
    setGraph: async () => {},
    mergeGraph: async () => {},
    setSelection: async () => {},
    destroy: async () => {},
  };
  const canvas = { hidden: false };
  const message = { hidden: true, textContent: "" };
  let requested = false;
  const application = new GraphApplication({
    config: {
      selection: [],
      limits: {},
      persistedSettings: { config: { defaults: { emptyResultMessage: "Nothing to show" } } },
    },
    provider: {
      load: async ({ query }) => {
        requested = true;
        return { graph: new GraphDocument(graphEnvelope({ records: [{ rec_ID: 1, rec_Title: "A" }] })), query };
      },
    },
    engine,
    host: {},
  });
  await application.initialize(canvas, { messageElement: message });
  assert.equal(requested, false, "no query means no request");
  assert.equal(canvas.hidden, true);
  assert.equal(message.hidden, false);
  assert.equal(message.textContent, "Nothing to show");

  await application.load({ query: "t:10" });
  assert.equal(requested, true);
  assert.equal(canvas.hidden, false);
  assert.equal(message.hidden, true);

  await application.load({ query: null });
  assert.equal(canvas.hidden, true);
  assert.equal(message.hidden, false);
});

test("GraphApplication emits selection changes from the graph engine", async () => {
  let engineSelection;
  let publishedSelection;
  const application = new GraphApplication({
    config: { selection: [] },
    provider: { load: async () => ({ graph: new GraphDocument() }) },
    engine: {
      initialize: async ({ onSelectionChange }) => {
        engineSelection = onSelectionChange;
      },
      setSelection: async () => {},
      destroy: async () => {},
    },
    host: {
      publishSelection: (ids) => {
        publishedSelection = ids;
      },
    },
  });
  let eventSelection;
  application.addEventListener("heurist-graph-selection-changed", (event) => {
    eventSelection = event.detail.recordIds;
  });
  await application.initialize({});
  await engineSelection([8]);
  assert.deepEqual(eventSelection, [8]);
  assert.deepEqual(publishedSelection, [8]);
});

 test("GraphProvider uses configured node budget as seed limit and preserves explicit pages", async () => {
   const bodies = [];
   const provider = new GraphProvider({ apiClient: { post: async (_path, { body }) => {
     bodies.push(body); return graphEnvelope();
   } } });
   await provider.load({ query: "t:10", limits: { maxNodes: 5000 } });
   await provider.load({ query: "t:10", limits: { maxNodes: 5000 }, limit: 50 });
   assert.equal(bodies[0].limit, 5000);
   assert.equal(bodies[0].limits.maxNodes, 5000);
   assert.equal(bodies[1].limit, 50);
 });

 test("missing Dataset definition keeps the graph usable and enforces readonly preferences", async () => {
   const app = new GraphApplication({ config: { selection: [], limits: {}, engineOptions: {} }, engine: { applyConfiguration: async () => {}, setGraph: async () => {}, setSelection: async () => {} } });
   app.disableDatasetEditing();
   assert.equal(app.config.persistedSettings.options.interaction.readonly, true);
   await app.applyConfiguration({ options: { interaction: { readonly: false, editEnabled: true } } });
   assert.equal(app.config.persistedSettings.options.interaction.readonly, true);
   assert.equal(app.config.persistedSettings.options.interaction.editEnabled, false);
 });
