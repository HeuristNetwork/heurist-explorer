/**
 * @file hostCollection.test.js
 * @brief Tests browser-local collection integration.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { HeuristDataHostAdapter } from "../../src/host/HeuristDataHostAdapter.js";
import { initLocale } from "#shared/ui";

test("data host adapter uses the shared client-core HCollection without a bridge", async () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, value),
  };
  const oldStorage = globalThis.localStorage;
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
  try {
    const host = new HeuristDataHostAdapter({ database: "testdb" });
    assert.equal(host.supportsCollection(), true);
    assert.deepEqual(await host.getCollection(), []);
    assert.deepEqual(await host.addToCollection([2, "3", 2]), ["2", "3"]);
    assert.deepEqual(await host.removeFromCollection("2"), ["3"]);
    await host.destroy();
  } finally {
    Object.defineProperty(globalThis, "localStorage", { value: oldStorage, configurable: true });
  }
});

test("record search bridge is exposed without coupling the module to HAPI", async () => {
  let received;
  const host = new HeuristDataHostAdapter({
    bridge: {
      doSearch: (request) => {
        received = request;
        return true;
      },
    },
  });
  assert.equal(host.supportsSearch(), true);
  await host.doSearch({ q: "t:10", detail: "ids" });
  assert.deepEqual(received, { q: "t:10", detail: "ids" });
});

test("openHelp forwards this module's own asset base, not the host's", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, text: async () => "" });
  try {
    await initLocale("eng", "https://example.org/heurist-data");
    let received;
    const host = new HeuristDataHostAdapter({
      bridge: { openHelp: (options) => { received = options; return true; } },
    });
    assert.equal(host.supportsHostedHelp(), true);
    assert.equal(host.openHelp(), true);
    assert.deepEqual(received, { moduleName: "data", baseUrl: "https://example.org/heurist-data" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
