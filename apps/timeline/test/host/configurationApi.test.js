/**
 * @file configurationApi.test.js
 * @brief The configuration API of heurist-timeline without a running module (plan 29 §12).
 */

import test from "node:test";
import assert from "node:assert/strict";
import { HeuristTimelineConfigurationApi } from "../../src/host/HeuristTimelineConfigurationApi.js";

const api = new HeuristTimelineConfigurationApi({});

test("the defaults are valid settings", () => {
  const defaults = api.getConfigurationDefaults();
  assert.ok(defaults.format.startsWith("heurist-"));
  assert.deepEqual(api.validateConfiguration(defaults), []);
});

test("an unknown key is reported", () => {
  const errors = api.validateConfiguration({ options: { ui: { noSuchOption: true } } });
  assert.deepEqual(errors.map((error) => error.key), ["options.ui.noSuchOption"]);
});

test("describeConfiguration: every option of the form, publication forces no editing", () => {
  const description = api.describeConfiguration({ mode: "publication" });
  assert.equal(description.mode, "publication");
  assert.ok(description.options.length > 3);
  const help = description.options.find((row) => row.key === "options.ui.showHelp");
  assert.deepEqual(help?.forced, { value: false });
  assert.ok(description.options.every((row) => row.key.startsWith("options.") || row.key.startsWith("config.")
    || row.key.startsWith("publish.")));
});
