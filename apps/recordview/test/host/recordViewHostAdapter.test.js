/**
 * @file recordViewHostAdapter.test.js
 * @brief Tests HeuristRecordViewHostAdapter's capability, preference, and publish contracts.
 * @project     Heurist academic knowledge management system
 * @package     heurist-recordview
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import test from "node:test";
import assert from "node:assert/strict";
import { HeuristRecordViewHostAdapter } from "../../src/host/HeuristRecordViewHostAdapter.js";
import { createHostAdapter } from "../../src/host/createHostAdapter.js";
import { StandaloneHostAdapter } from "#shared/host";

test("getCapabilities reflects editing support and FrontController configuration", () => {
  const configured = new HeuristRecordViewHostAdapter({
    bridge: { editRecord: () => {}, canEditRecords: () => true },
    baseUrl: "http://example.test/heurist/",
    database: "demo",
  });
  assert.deepEqual(configured.getCapabilities(), {
    editing: true,
    recordViewPreferences: true,
    recordViewPublishing: true,
    mapZoom: false,
  });

  const unconfigured = new HeuristRecordViewHostAdapter();
  assert.deepEqual(unconfigured.getCapabilities(), {
    editing: false,
    recordViewPreferences: false,
    recordViewPublishing: false,
    mapZoom: false,
  });
});

test("preferences round-trip through the keyed FrontController contract", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return { ok: true, json: async () => ({ status: 0, data: { format: "heurist-recordview-settings" } }) };
  };
  const host = new HeuristRecordViewHostAdapter({
    baseUrl: "http://example.test/heurist/",
    database: "demo",
    fetchImpl,
  });

  await host.loadPreferences();
  await host.savePreferences({ format: "heurist-recordview-settings" });

  assert.match(calls[0].url, /controller=UserController/);
  assert.match(calls[0].url, /action=get_prefs/);
  assert.match(calls[0].url, /key=heurist-recordview/);
  assert.equal(calls[1].init.method, "POST");
  assert.match(calls[1].init.body, /key=heurist-recordview/);
});

test("publish posts to the PublicationController with the recordview module type", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return { ok: true, json: async () => ({ status: 0, data: { id: "abc123" } }) };
  };
  const host = new HeuristRecordViewHostAdapter({
    baseUrl: "http://example.test/heurist/",
    database: "demo",
    fetchImpl,
  });

  const result = await host.publish({ format: "heurist-publication" });

  assert.deepEqual(result, { id: "abc123" });
  assert.match(calls[0].url, /controller=PublicationController/);
  assert.match(calls[0].url, /action=save/);
  assert.match(calls[0].url, /type=recordview/);
});

test("publishSelection forwards to the bridge's onSelection callback", () => {
  const calls = [];
  const host = new HeuristRecordViewHostAdapter({
    bridge: { onSelection: (ids) => calls.push(ids) },
  });
  host.publishSelection([12, 34]);
  assert.deepEqual(calls, [[12, 34]]);
});

test("host factory creates HeuristRecordViewHostAdapter for declarative host config, and StandaloneHostAdapter otherwise", () => {
  const host = createHostAdapter({
    type: "heurist",
    baseUrl: "/heurist/",
    database: "demo",
    fetchImpl: async () => {},
  });
  assert.ok(host instanceof HeuristRecordViewHostAdapter);
  assert.ok(createHostAdapter(null) instanceof StandaloneHostAdapter);
});
