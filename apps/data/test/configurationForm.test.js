/**
 * @file configurationForm.test.js
 * @brief The configuration form JSON (plan 29) has the same keys and defaults as the module settings.
 */

import test from "node:test";
import form from "../src/ui/config/dataConfigurationForm.json" with { type: "json" };
import { createDataConfigurationDefaults } from "../src/ui/config/dataConfigurationDefaults.js";
import { assertFormMatchesDefaults } from "../../../shared/test/helpers/configurationForm.js";

test("the configuration form has every setting with its default", () => {
  assertFormMatchesDefaults(form, createDataConfigurationDefaults());
});
