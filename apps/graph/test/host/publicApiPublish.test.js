/**
 * @file publicApiPublish.test.js
 * @brief Tests the Publish button flow (plan 29): the publication form of heurist-explorer gets the
 *        settings and the publication state; Preserve current state is the graph's preparePublication.
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
import { HeuristGraphPublicApi } from "../../src/host/HeuristGraphPublicApi.js";

function createApi({ publishResult, state } = {}) {
  const events = [];
  const application = {
    config: {
      language: "fre",
      persistedSettings: { options: { ui: { language: "auto" } } },
    },
    host: {
      publish: async (payload) => {
        application.host.lastPayload = payload;
        return publishResult === undefined ? { id: 7, url: "https://h.org/x/site/7" } : publishResult;
      },
    },
    getState: () => state ?? { querySourceId: 12, query: "t:10", selection: [] },
    dispatch: (name, detail) => events.push({ name, detail }),
  };
  return { api: new HeuristGraphPublicApi(application), application, events };
}

test("publish mode materializes the active runtime language and leaves persisted settings untouched", () => {
  const { api, application } = createApi();
  let dialogOptions;
  api.setConfigurationDialogFactory((options) => {
    dialogOptions = options;
    return {};
  });
  api.openPublishDialog();
  assert.equal(dialogOptions.mode, "publish");
  assert.equal(dialogOptions.value.options.ui.language, "fre");
  assert.equal(application.config.persistedSettings.options.ui.language, "auto");
});

test("publication state keeps the original query, expansions and hidden groups but drops recordIds", () => {
  const { api } = createApi({
    state: {
      query: "t:10",
      querySourceId: null,
      querySourceTitle: null,
      selection: [42],
      recordIds: [1, 2, 3, 4, 5, 6, 7, 8],
      limits: { maxNodes: 5000, nodesReturned: 8 },
      expansions: {
        rules: [{ query: "linkedfrom:2" }],
        enabled: [true],
        depth: 2,
      },
      hidden: { recordTypes: [48], links: ["link:x"], relationships: [] },
    },
  });
  let captured;
  api.setConfigurationDialogFactory((options) => {
    captured = options;
    return {};
  });
  api.openPublishDialog();
  const state = captured.state;
  assert.equal(state.query, "t:10");
  assert.deepEqual(state.selection, [42]);
  assert.deepEqual(state.expansions, {
    rules: [{ query: "linkedfrom:2" }],
    enabled: [true],
    depth: 2,
  });
  assert.deepEqual(state.hidden, {
    recordTypes: [48],
    links: ["link:x"],
    relationships: [],
  });
  assert.ok(!("recordIds" in state), "recordIds is not published");
  assert.ok(!("limits" in state), "limits is not published");
});

test("Preserve current state off: the page has no state (preparePublication)", async () => {
  const { graphConfiguration } = await import("../../src/configuration.js");
  const settings = { options: {}, config: {} };
  assert.deepEqual(graphConfiguration.preparePublication({ settings, state: { query: "x" }, publish: { preserveState: false } }),
    { settings, state: {} });
  assert.deepEqual(graphConfiguration.preparePublication({ settings, state: { query: "x" }, publish: {} }).state, { query: "x" });
});

test("the graph is published from heurist-explorer only", () => {
  const { api, application } = createApi();
  assert.equal(api.canPublish(), false);
  application.host.bridge = { openConfiguration: async () => null };
  assert.equal(api.canPublish(), true);
});
