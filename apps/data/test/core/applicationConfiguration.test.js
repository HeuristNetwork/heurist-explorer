/**
 * @file applicationConfiguration.test.js
 * @brief Tests application configuration and lifecycle behavior.
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
import { DataApplication } from "../../src/core/DataApplication.js";

test("initial user preferences are applied before DataTables initialization", async () => {
  let initializedOptions;
  const engine = {
    initialize: async ({ options }) => {
      initializedOptions = structuredClone(options);
    },
    setData: async () => {},
    setCollection: async () => {},
  };
  const host = {
    initialize: async () => {},
    loadPreferences: async () => ({
      options: {
        nativeControls: { pageSize: false, search: false, counter: true },
      },
      config: { defaults: { pageSize: 500, fontSize: 12 } },
    }),
    supportsCollection: () => false,
  };
  const config = {
    loadPreferencesOnInit: true,
    persistedSettings: {},
    ui: {},
    engineOptions: { pageLength: 100, controls: {} },
    source: { querySourceId: null, query: null, fields: [], selection: [] },
  };
  const application = new DataApplication({
    container: {},
    config,
    engine,
    host,
    loaders: {},
  });
  await application.initialize();
  assert.equal(initializedOptions.pageLength, 500);
  assert.equal(initializedOptions.fontSize, 12);
  assert.equal(initializedOptions.controls.pageSize, false);
  assert.equal(initializedOptions.controls.search, false);
});

test("switching back from a Query Source restores the latest Filtered Result query", async () => {
  const requests = [];
  const querySource = {
    id: 7,
    source: { query: "t:7" },
    fields: [],
    toJSON() {
      return this;
    },
  };
  const queryQuerySource = {
    id: null,
    source: { query: "t:10" },
    fields: [],
    toJSON() {
      return this;
    },
  };
  const loaders = {
    load: async (type, request) => {
      requests.push({ type, request });
      return {
        querySource: type === "querySource" ? querySource : queryQuerySource,
        response: { records: [], meta: {}, pagination: { total: 0 } },
      };
    },
  };
  const engine = { setData: async () => {} };
  const application = new DataApplication({
    container: {},
    config: { source: {} },
    engine,
    host: {},
    loaders,
  });
  await application.setQuery("t:10", { fields: ["rec_Title"] });
  await application.setQuerySource(7);
  await application.activateCurrentResults();
  assert.equal(requests.at(-1).type, "query");
  assert.equal(requests.at(-1).request.query, "t:10");
  assert.deepEqual(requests.at(-1).request.fields, ["rec_Title"]);
});

test("a host Filtered Result update does not replace the active Query Source", async () => {
  const requests = [];
  const querySource = {
    id: 7,
    source: { query: "t:7" },
    fields: [],
    toJSON() {
      return this;
    },
  };
  const queryQuerySource = {
    id: null,
    source: { query: "t:11" },
    fields: [],
    toJSON() {
      return this;
    },
  };
  const loaders = {
    load: async (type, request) => {
      requests.push({ type, request });
      return {
        querySource: type === "querySource" ? querySource : queryQuerySource,
        response: { records: [], meta: {}, pagination: { total: 0 } },
      };
    },
  };
  const application = new DataApplication({
    container: {},
    config: { source: {} },
    engine: { setData: async () => {} },
    host: {},
    loaders,
  });
  await application.setQuerySource(7);
  await application.setQuery("t:11", { fields: ["rec_Title"] });
  assert.equal(requests.length, 1);
  assert.equal(application.getState().querySourceId, 7);
  await application.activateCurrentResults();
  assert.equal(requests.at(-1).type, "query");
  assert.equal(requests.at(-1).request.query, "t:11");
});

test("host filter activation delegates the parsed request and leaves Filtered Result pending", async () => {
  const querySource = {
    id: 7,
    source: { query: "t:7" },
    fields: [],
    toJSON() {
      return this;
    },
  };
  let request;
  const application = new DataApplication({
    container: {},
    config: {
      source: {},
      runtimeMode: "main",
      searchRealm: "realm-1",
      sourceId: "data-1",
    },
    engine: { setData: async () => {} },
    host: {
      supportsSearch: () => true,
      doSearch: async (value) => {
        request = value;
      },
    },
    loaders: {
      load: async () => ({
        querySource,
        response: { records: [], meta: {}, pagination: { total: 0 } },
      }),
    },
  });
  await application.setQuerySource(7);
  await application.activateFilter({
    id: 4,
    title: "People",
    query: JSON.stringify({
      q: "t:10",
      rules: "",
      rulesonly: 0,
    }),
  });
  assert.deepEqual(request, {
    q: "t:10",
    rules: "",
    rulesonly: 0,
    detail: "ids",
    isNewEngine: true,
    search_realm: "realm-1",
    source: "data-1",
  });
  assert.equal(application.getState().querySourceId, null);
});

test("standalone filter activation counts, then loads Filtered Result by query", async () => {
  const order = [];
  const queryQuerySource = {
    id: null,
    source: {},
    fields: [],
    toJSON() {
      return this;
    },
  };
  const application = new DataApplication({
    container: { id: "heurist-data" },
    config: { source: {}, runtimeMode: "standalone" },
    engine: { setData: async () => {} },
    host: {},
    providers: {
      recordDataProvider: {
        count: async (request) => {
          order.push(["count", request]);
          assert.equal(request.query, "t:10");
          return { query: "t:10", total: 2 };
        },
      },
    },
    loaders: {
      load: async (type, request) => {
        order.push(["load", type, request]);
        return {
          querySource: queryQuerySource,
          response: { records: [], meta: {}, pagination: { total: 0 } },
        };
      },
    },
  });
  await application.activateFilter({ id: 4, query: "t:10" });
  assert.equal(order[0][0], "count");
  assert.equal(order[1][0], "load");
  assert.equal(order[1][2].query, "t:10");
  assert.equal(application.getState().query, "t:10");
});

test("a superseded load cannot replace the Filtered Result", async () => {
  const pending = new Map();
  const querySource = (id) => ({
    id,
    source: { query: `t:${id}` },
    fields: [],
    toJSON() {
      return this;
    },
  });
  const application = new DataApplication({
    config: { source: {} },
    engine: { setData: async () => {} },
    host: {},
    loaders: {
      load: (type, request) =>
        new Promise((resolve) =>
          pending.set(request.querySourceId, { type, resolve }),
        ),
    },
  });
  const first = application.setQuerySource(1);
  const second = application.setQuerySource(2);
  pending.get(2).resolve({
    querySource: querySource(2),
    response: { records: [], meta: {}, pagination: { total: 0 } },
  });
  await second;
  pending.get(1).resolve({
    querySource: querySource(1),
    response: { records: [], meta: {}, pagination: { total: 0 } },
  });
  await assert.rejects(first, { name: "AbortError" });
  assert.equal(application.getState().querySourceId, 2);
});

test("creating a Query Source tolerates a null allowed list", async () => {
  const settings = {
    options: { querySources: { allowAll: false, allowed: null } },
    config: {},
  };
  const application = new DataApplication({
    config: { source: {}, persistedSettings: settings },
    engine: { setData: async () => {} },
    host: {
      supportsEditing: () => true,
      addRecord: async () => ({ recordId: 9 }),
    },
    providers: {
      querySourceList: { list: async () => ({ recordTypeId: 42 }) },
    },
    loaders: {
      load: async () => ({
        querySource: {
          id: 9,
          source: { query: "t:42" },
          fields: [],
          toJSON() {
            return this;
          },
        },
        response: { records: [], meta: {}, pagination: { total: 0 } },
      }),
    },
  });
  await application.requestCreateQuerySource();
  assert.deepEqual(settings.options.querySources.allowed, [9]);
});
