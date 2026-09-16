/**
 * @file configurationSchema.test.js
 * @brief Tests configuration normalization and serialization.
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
import { createRecordViewConfigurationDefaults } from "../../src/ui/config/recordViewConfigurationDefaults.js";
import {
  normalizeRecordViewConfigurationSettings,
  serializeRecordViewConfigurationSettings,
} from "../../src/ui/config/recordViewConfigurationSchema.js";
import {
  CONFIGURATION_FORMAT,
  CONFIGURATION_VERSION,
} from "../../src/ui/config/configurationUtils.js";

test("record view configuration defaults expose the requested controls", () => {
  const value = createRecordViewConfigurationDefaults();
  assert.equal(value.config.defaults.engine, "builtin");
  assert.equal(value.config.defaults.selectionMode, "last");
  assert.equal(value.config.defaults.showHeader, true);
  assert.equal(value.config.defaults.headerTitle, null);
  assert.equal(value.config.defaults.emptyMessage, "Select a record");
  assert.equal(value.options.ui.language, "auto");
  assert.equal(value.options.ui.showOptions, true);
  assert.equal(value.options.ui.showPublish, true);
  assert.equal(value.options.interaction.readonly, false);
});

test("engine and selectionMode only accept the configured choices", () => {
  assert.equal(
    normalizeRecordViewConfigurationSettings({ config: { defaults: { engine: "smarty" } } }).config.defaults.engine,
    "smarty",
  );
  assert.equal(
    normalizeRecordViewConfigurationSettings({ config: { defaults: { engine: "unknown" } } }).config.defaults.engine,
    "builtin",
  );
  assert.equal(
    normalizeRecordViewConfigurationSettings({ config: { defaults: { selectionMode: "single-only" } } }).config.defaults
      .selectionMode,
    "single-only",
  );
  assert.equal(
    normalizeRecordViewConfigurationSettings({ config: { defaults: { selectionMode: "bogus" } } }).config.defaults
      .selectionMode,
    "last",
  );
});

test("template and headerTitle are nullable strings", () => {
  assert.equal(
    normalizeRecordViewConfigurationSettings({ config: { defaults: { template: "" } } }).config.defaults.template,
    null,
  );
  assert.equal(
    normalizeRecordViewConfigurationSettings({ config: { defaults: { template: "myreport" } } }).config.defaults
      .template,
    "myreport",
  );
  assert.equal(
    normalizeRecordViewConfigurationSettings({ config: { defaults: { headerTitle: "Custom" } } }).config.defaults
      .headerTitle,
    "Custom",
  );
});

test("normalization drops unknown keys", () => {
  const value = normalizeRecordViewConfigurationSettings({
    options: { accessToken: "discard", interaction: { readonly: true } },
    config: { defaults: { emptyMessage: "Nothing here" } },
  });
  assert.equal(value.options.accessToken, undefined);
  assert.equal(value.options.interaction.readonly, true);
  assert.equal(value.config.defaults.emptyMessage, "Nothing here");
});

test("published UI language is restricted to available locale resources", () => {
  assert.equal(
    normalizeRecordViewConfigurationSettings({ options: { ui: { language: "fre" } } }).options.ui.language,
    "fre",
  );
  assert.equal(
    normalizeRecordViewConfigurationSettings({ options: { ui: { language: "spa" } } }).options.ui.language,
    "auto",
  );
});

test("serializer creates the heurist-recordview settings envelope", () => {
  const value = serializeRecordViewConfigurationSettings({
    config: { defaults: { engine: "legacy" } },
  });
  assert.equal(value.format, CONFIGURATION_FORMAT);
  assert.equal(value.version, CONFIGURATION_VERSION);
  assert.equal(value.config.defaults.engine, "legacy");
});

test("round-trip through serialize/normalize preserves settings", () => {
  const settings = {
    config: { defaults: { engine: "smarty", template: "report1", selectionMode: "first", showHeader: false } },
    options: { ui: { language: "fre" } },
  };
  const result = normalizeRecordViewConfigurationSettings(serializeRecordViewConfigurationSettings(settings));
  assert.equal(result.config.defaults.engine, "smarty");
  assert.equal(result.config.defaults.template, "report1");
  assert.equal(result.config.defaults.selectionMode, "first");
  assert.equal(result.config.defaults.showHeader, false);
  assert.equal(result.options.ui.language, "fre");
});
