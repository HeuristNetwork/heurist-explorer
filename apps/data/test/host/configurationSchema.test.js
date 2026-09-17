/**
 * @file configurationSchema.test.js
 * @brief Tests configuration normalization and serialization.
 * @project     Heurist academic knowledge management system
 * @package     heurist-data
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createDataConfigurationDefaults } from "../../src/ui/config/dataConfigurationDefaults.js";
import {
  normalizeDataConfigurationSettings,
  serializeDataConfigurationSettings,
} from "../../src/ui/config/dataConfigurationSchema.js";
import {
  CONFIGURATION_FORMAT,
  CONFIGURATION_VERSION,
} from "../../src/ui/config/configurationUtils.js";
import { DataConfigurationDialog } from "../../src/ui/config/DataConfigurationDialog.js";

test("data configuration defaults expose the requested controls", () => {
  const value = createDataConfigurationDefaults();
  assert.equal(value.options.nativeControls.export, true);
  assert.equal(value.options.ui.language, "auto");
  assert.equal(value.options.ui.showSourceHeader, false);
  assert.equal(value.config.defaults.fontSize, 14);
  assert.equal(value.config.defaults.pageSize, 100);
  assert.equal(value.config.defaults.engine, "recordlist");
  assert.equal(value.config.defaults.viewMode, "card");
  assert.equal(value.config.defaults.cardTemplate, null);
  assert.equal(value.config.defaults.viewTemplate, null);
  assert.equal(value.options.nativeControls.viewMode, true);
  assert.equal(value.options.nativeControls.selectionActions, true);
});

test("page size accepts only configured choices and publication restricts interaction", () => {
  assert.equal(
    normalizeDataConfigurationSettings({
      config: { defaults: { pageSize: 500 } },
    }).config.defaults.pageSize,
    500,
  );
  assert.equal(
    normalizeDataConfigurationSettings({
      config: { defaults: { pageSize: 5000 } },
    }).config.defaults.pageSize,
    5000,
  );
  assert.equal(
    normalizeDataConfigurationSettings({
      config: { defaults: { pageSize: 25 } },
    }).config.defaults.pageSize,
    100,
  );
  assert.equal(
    normalizeDataConfigurationSettings({
      config: { defaults: { pageSize: 20 } },
    }).config.defaults.pageSize,
    100,
  );
  const dialog = new DataConfigurationDialog({
    mode: "publish",
    value: {
      options: { interaction: { persistentSelectionEnabled: true } },
    },
  });
  const interaction = dialog.getValue().options.interaction;
  assert.equal(interaction.readonly, true);
  assert.equal(interaction.editEnabled, false);
  assert.equal(interaction.selectionEnabled, false);
  assert.equal(interaction.persistentSelectionEnabled, false);
  assert.equal(interaction.popupEnabled, true);
  assert.equal(interaction.adminInfoEnabled, false);
});

test("normalization allowlists values and clamps font size", () => {
  const value = normalizeDataConfigurationSettings({
    options: {
      accessToken: "discard",
      interaction: { persistentSelectionEnabled: true },
    },
    config: {
      defaults: { fontSize: 50 },
    },
    callback() {},
  });
  assert.equal(value.options.accessToken, undefined);
  assert.equal(value.options.interaction.persistentSelectionEnabled, true);
  assert.equal(value.config.defaults.fontSize, 30);
});

test("view mode drives the engine and both are allowlisted", () => {
  const value = normalizeDataConfigurationSettings({
    config: { defaults: { engine: "recordlist", viewMode: "list" } },
  });
  assert.equal(value.config.defaults.engine, "recordlist");
  assert.equal(value.config.defaults.viewMode, "list");
  const invalid = normalizeDataConfigurationSettings({
    config: { defaults: { engine: "unknown", viewMode: "tiles" } },
  });
  assert.equal(invalid.config.defaults.engine, "recordlist");
  assert.equal(invalid.config.defaults.viewMode, "card");
  // Selecting the "datatable" view mode selects the DataTables engine.
  const table = normalizeDataConfigurationSettings({
    config: { defaults: { viewMode: "datatable" } },
  });
  assert.equal(table.config.defaults.viewMode, "datatable");
  assert.equal(table.config.defaults.engine, "datatables");
  // Legacy configs that selected DataTables via `engine` migrate to the mode.
  const legacy = normalizeDataConfigurationSettings({
    config: { defaults: { engine: "datatables" } },
  });
  assert.equal(legacy.config.defaults.viewMode, "datatable");
  assert.equal(legacy.config.defaults.engine, "datatables");
});

test("record-list card and extended templates are independent and migrate the legacy setting", () => {
  const value = normalizeDataConfigurationSettings({
    config: {
      defaults: {
        cardTemplate: "compact.tpl",
        viewTemplate: "full.tpl",
      },
    },
  });
  assert.equal(value.config.defaults.cardTemplate, "compact.tpl");
  assert.equal(value.config.defaults.viewTemplate, "full.tpl");

  const migrated = normalizeDataConfigurationSettings({
    config: {
      defaults: {
        popupTemplate: "legacy.tpl",
      },
    },
  });
  assert.equal(migrated.config.defaults.cardTemplate, "legacy.tpl");
  assert.equal(migrated.config.defaults.viewTemplate, "legacy.tpl");

  const standard = normalizeDataConfigurationSettings({
    config: {
      defaults: {
        popupTemplate: "standard",
      },
    },
  });
  assert.equal(standard.config.defaults.cardTemplate, null);
  assert.equal(standard.config.defaults.viewTemplate, null);
});

test("published UI language is restricted to available locale resources", () => {
  assert.equal(
    normalizeDataConfigurationSettings({ options: { ui: { language: "fre" } } })
      .options.ui.language,
    "fre",
  );
  assert.equal(
    normalizeDataConfigurationSettings({ options: { ui: { language: "spa" } } })
      .options.ui.language,
    "auto",
  );
});

test("serializer creates the heurist-data settings envelope", () => {
  const value = serializeDataConfigurationSettings({
    options: { nativeControls: { export: false } },
  });
  assert.equal(value.format, CONFIGURATION_FORMAT);
  assert.equal(value.version, CONFIGURATION_VERSION);
  assert.equal(value.options.nativeControls.export, false);
});

test("dialog is usable as a value object without a document", () => {
  const dialog = new DataConfigurationDialog({
    mode: "website",
    value: {
      options: { ui: { showOptions: true, showSourceHeader: true } },
    },
  });
  const value = dialog.getValue();
  assert.equal(value.options.ui.showOptions, true);
  assert.equal(value.options.ui.showSourceHeader, true);
  assert.equal(dialog.serialize().format, "heurist-data-settings");
});

test("Options visibility is fixed for preferences and publication but configurable for websites", () => {
  const preferences = new DataConfigurationDialog({
    mode: "preferences",
    value: {
      options: { ui: { showOptions: false } },
    },
  }).getValue();
  const publication = new DataConfigurationDialog({
    mode: "publish",
    value: {
      options: { ui: { showOptions: true } },
    },
  }).getValue();
  assert.equal(preferences.options.ui.showOptions, true);
  assert.equal(publication.options.ui.showOptions, false);
});
