/**
 * @file graphApplicationConfiguration.test.js
 * @brief Tests GraphApplication's host-preference load-before-first-render lifecycle.
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

function baseConfig(overrides = {}) {
  return {
    loadPreferencesOnInit: true,
    persistedSettings: {},
    limits: { maxNodes: 5000, maxEdges: 10000, maxDepth: 5 },
    engineOptions: {},
    query: null,
    selection: [],
    ...overrides,
  };
}

test("initial host preferences are applied before the engine's first render", async () => {
  let initializedOptions;
  const engine = {
    initialize: async ({ options }) => {
      initializedOptions = structuredClone(options);
    },
    setGraph: async () => {},
    setSelection: async () => {},
  };
  const host = {
    initialize: async () => {},
    loadPreferences: async () => ({
      config: {
        defaults: {
          maxNodes: 5000,
          maxEdges: 10000,
          gravity: "tight",
          scaling: false,
          labelLength: 60,
          popupDelay: 3,
          popupTemplate: "custom",
        },
      },
    }),
  };
  const application = new GraphApplication({
    config: baseConfig(),
    provider: {},
    engine,
    host,
  });

  await application.initialize({ hidden: false });

  assert.equal(application.config.limits.maxNodes, 5000);
  assert.equal(application.config.limits.maxEdges, 10000);
  assert.equal(initializedOptions.gravity, "tight");
  assert.equal(initializedOptions.scaling, false);
  assert.equal(initializedOptions.labelMaxLength, 60);
  assert.equal(initializedOptions.popupDelay, 3);
  assert.equal(initializedOptions.popupTemplate, "custom");
});

test("loadPreferencesOnInit=false skips the host preference fetch", async () => {
  let called = false;
  const engine = { initialize: async () => {}, setGraph: async () => {}, setSelection: async () => {} };
  const host = {
    initialize: async () => {},
    loadPreferences: async () => {
      called = true;
      return {};
    },
  };
  const application = new GraphApplication({
    config: baseConfig({ loadPreferencesOnInit: false }),
    provider: {},
    engine,
    host,
  });

  await application.initialize({ hidden: false });

  assert.equal(called, false);
});

test("a failed preference load dispatches an error but does not block initialization", async () => {
  let initialized = false;
  const engine = {
    initialize: async () => {
      initialized = true;
    },
    setGraph: async () => {},
    setSelection: async () => {},
  };
  const host = {
    initialize: async () => {},
    loadPreferences: async () => {
      throw new Error("preference endpoint unavailable");
    },
  };
  const application = new GraphApplication({
    config: baseConfig(),
    provider: {},
    engine,
    host,
  });
  const events = [];
  application.addEventListener("heurist-graph-error", (event) => events.push(event.detail));

  await application.initialize({ hidden: false });

  assert.equal(initialized, true);
  assert.equal(events.length, 1);
  assert.equal(events[0].operation, "load-preferences");
});

test("applyConfiguration pushes engine options live and re-renders the current graph", async () => {
  let appliedOptions;
  let renderedGraph;
  const engine = {
    initialize: async () => {},
    setGraph: async (graph) => {
      renderedGraph = graph;
    },
    setSelection: async () => {},
    applyConfiguration: async (options) => {
      appliedOptions = structuredClone(options);
    },
  };
  const application = new GraphApplication({
    config: baseConfig({ loadPreferencesOnInit: false }),
    provider: {},
    engine,
    host: { initialize: async () => {} },
  });
  await application.initialize({ hidden: false });

  const events = [];
  application.addEventListener("heurist-graph-configuration-changed", (event) =>
    events.push(event.detail),
  );

  const state = await application.applyConfiguration({
    config: {
      defaults: {
        maxNodes: 10000,
        maxEdges: 10000,
        gravity: "tight",
        scaling: false,
        labelLength: 60,
        popupDelay: 4,
      },
    },
    options: {
      interaction: { selectionEnabled: false, popupEnabled: false },
    },
  });

  assert.equal(application.config.limits.maxNodes, 10000);
  assert.equal(appliedOptions.gravity, "tight");
  assert.equal(appliedOptions.scaling, false);
  assert.equal(appliedOptions.labelMaxLength, 60);
  assert.equal(appliedOptions.popupDelay, 4);
  assert.equal(appliedOptions.selectionEnabled, false);
  assert.equal(appliedOptions.popupEnabled, false);
  assert.ok(renderedGraph, "the current graph is re-rendered so scaling/labels refresh immediately");
  assert.equal(events.length, 1);
  assert.equal(events[0].config.defaults.gravity, "tight");
  assert.equal(state.limits, application.graph?.limits ?? null);
});
