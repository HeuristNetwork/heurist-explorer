/**
 * @file configurationForm.test.js
 * @brief The configuration form JSON (plan 29) has the same keys and defaults as the module settings.
 */

import test from "node:test";
import form from "../src/ui/config/graphConfigurationForm.json" with { type: "json" };
import { createGraphConfigurationDefaults } from "../src/ui/config/graphConfigurationDefaults.js";
import { assertFormMatchesDefaults } from "../../../shared/test/helpers/configurationForm.js";

test("the configuration form has every setting with its default", () => {
  assertFormMatchesDefaults(form, createGraphConfigurationDefaults());
});
