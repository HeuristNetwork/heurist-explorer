/**
 * @file graphHostAdapter.test.js
 * @brief Tests HeuristGraphHostAdapter's editing, capability, preference, and publish contracts.
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
import { HeuristGraphHostAdapter } from "../../src/host/HeuristGraphHostAdapter.js";
import { createHostAdapter } from "../../src/host/createHostAdapter.js";

test("record editing and creation are exposed only when the bridge supports them", async () => {
  const calls = [];
  const adapter = new HeuristGraphHostAdapter({
    bridge: {
      editRecord(recordId) {
        calls.push(["edit", recordId]);
        return Promise.resolve({ saved: true, recordId });
      },
      addRecord(recordTypeId) {
        calls.push(["add", recordTypeId]);
        return Promise.resolve({ recordId: 9 });
      },
    },
  });

  assert.equal(adapter.supportsEditing(), true);
  assert.deepEqual(await adapter.editRecord(122), { saved: true, recordId: 122 });
  assert.deepEqual(await adapter.addRecord(7), { recordId: 9 });
  assert.deepEqual(calls, [["edit", 122], ["add", 7]]);

  const noBridge = new HeuristGraphHostAdapter();
  assert.equal(noBridge.supportsEditing(), false);
  await assert.rejects(() => noBridge.editRecord(122), /not available/);
  await assert.rejects(() => noBridge.addRecord(3), /not available/);
});

test("getCapabilities reflects editing support and FrontController configuration", () => {
  const configured = new HeuristGraphHostAdapter({
    bridge: { editRecord: () => {} },
    baseUrl: "http://example.test/heurist/",
    database: "demo",
  });
  assert.deepEqual(configured.getCapabilities(), {
    editing: true,
    graphPreferences: true,
    graphPublishing: true,
  });

  const unconfigured = new HeuristGraphHostAdapter();
  assert.deepEqual(unconfigured.getCapabilities(), {
    editing: false,
    graphPreferences: false,
    graphPublishing: false,
  });
});

test("graph preferences round-trip through the keyed FrontController contract", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return { ok: true, json: async () => ({ status: 0, data: { format: "heurist-graph-settings" } }) };
  };
  const host = new HeuristGraphHostAdapter({
    baseUrl: "http://example.test/heurist/",
    database: "demo",
    fetchImpl,
  });

  await host.loadPreferences();
  await host.savePreferences({ format: "heurist-graph-settings" });

  assert.match(calls[0].url, /controller=UserController/);
  assert.match(calls[0].url, /action=get_prefs/);
  assert.match(calls[0].url, /key=heurist-graph/);
  assert.equal(calls[1].init.method, "POST");
  assert.match(calls[1].init.body, /key=heurist-graph/);
});

test("publish posts to the PublicationController with the graph module type", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return { ok: true, json: async () => ({ status: 0, data: { id: "abc123" } }) };
  };
  const host = new HeuristGraphHostAdapter({
    baseUrl: "http://example.test/heurist/",
    database: "demo",
    fetchImpl,
  });

  const result = await host.publish({ format: "heurist-publication" });

  assert.deepEqual(result, { id: "abc123" });
  assert.match(calls[0].url, /controller=PublicationController/);
  assert.match(calls[0].url, /action=save/);
  assert.match(calls[0].url, /type=graph/);
});

test("host factory creates HeuristGraphHostAdapter for declarative host config", () => {
  const host = createHostAdapter({
    type: "heurist",
    baseUrl: "/heurist/",
    database: "demo",
    fetchImpl: async () => {},
  });
  assert.ok(host instanceof HeuristGraphHostAdapter);
});
