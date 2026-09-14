/**
 * @file publicApiPublish.test.js
 * @brief Tests the Publish button flow: PublicationController call + PublishedDialog.
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

/** Minimal DOM so the deferred PublishedDialog.open() does not throw off-thread. */
function stubDocument() {
  const make = () => ({
    className: "",
    textContent: "",
    setAttribute() {},
    append() {},
    addEventListener() {},
    removeEventListener() {},
    remove() {},
    focus() {},
    select() {},
    querySelectorAll: () => [],
  });
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: make, body: make() };
  return () => {
    globalThis.document = previousDocument;
  };
}

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
        return publishResult ?? { url: "https://h.org/?db=x&controller=Web&publication_id=7&type=graph" };
      },
    },
    getState: () => state ?? { datasetId: 12, query: "t:10", selection: [] },
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

test("saving the publish dialog calls the host PublicationController and opens the published link dialog", async () => {
  const restore = stubDocument();
  try {
    const { api, application, events } = createApi();
    let captured;
    api.setConfigurationDialogFactory((options) => {
      captured = options;
      return {};
    });
    api.openPublishDialog();

    const serialized = { format: "heurist-graph-settings", options: {}, config: {} };
    const result = await captured.onSave(captured.value, {
      mode: "publish",
      serialized,
      publishOptions: { preserveCurrentState: true },
    });

    assert.equal(application.host.lastPayload.format, "heurist-publication");
    assert.equal(application.host.lastPayload.version, 1);
    assert.deepEqual(application.host.lastPayload.state, {
      query: "t:10",
      datasetId: 12,
      datasetTitle: null,
      selection: [],
    });
    const published = events.find((e) => e.name === "heurist-graph-published");
    assert.ok(published, "dispatches heurist-graph-published");
    assert.equal(published.detail.settings, serialized);
    // The host link is canonicalized to a single pub_id parameter for the dialog.
    assert.match(result.url, /[?&]pub_id=7(&|$)/);
    assert.doesNotMatch(result.url, /publication_id|type=graph/);

    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.ok(api.publishedDialog, "opens PublishedDialog after the config overlay closes");
  } finally {
    restore();
  }
});

test("preserveCurrentState:false publishes without the live graph state", async () => {
  const restore = stubDocument();
  try {
    const { api, application } = createApi();
    let captured;
    api.setConfigurationDialogFactory((options) => {
      captured = options;
      return {};
    });
    api.openPublishDialog();
    await captured.onSave(captured.value, {
      mode: "publish",
      serialized: { options: {}, config: {} },
      publishOptions: { preserveCurrentState: false },
    });
    assert.deepEqual(application.host.lastPayload.state, {});
    await new Promise((resolve) => setTimeout(resolve, 0));
  } finally {
    restore();
  }
});

test("publication state keeps the original query, expansions and hidden groups but drops recordIds", async () => {
  const restore = stubDocument();
  try {
    const { api, application } = createApi({
      state: {
        query: "t:10",
        datasetId: null,
        datasetTitle: null,
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
    await captured.onSave(captured.value, {
      mode: "publish",
      serialized: { options: {}, config: {} },
      publishOptions: { preserveCurrentState: true },
    });
    const state = application.host.lastPayload.state;
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
    await new Promise((resolve) => setTimeout(resolve, 0));
  } finally {
    restore();
  }
});
