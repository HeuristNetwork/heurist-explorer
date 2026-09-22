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
        querySource: type === "source" ? querySource : queryQuerySource,
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
});

test("setLoading forwards to the active engine's own setLoading, tolerating engines without one", async () => {
  const calls = [];
  const application = new DataApplication({
    container: {},
    config: { source: {} },
    engine: { setData: async () => {}, setLoading: (loading) => calls.push(loading) },
    host: {},
    loaders: {},
  });
  application.setLoading(true);
  application.setLoading(false);
  assert.deepEqual(calls, [true, false]);

  const applicationWithoutIndicator = new DataApplication({
    container: {},
    config: { source: {} },
    engine: { setData: async () => {} },
    host: {},
    loaders: {},
  });
  assert.doesNotThrow(() => applicationWithoutIndicator.setLoading(true));
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
