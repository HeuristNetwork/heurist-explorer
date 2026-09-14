/**
 * @file configurationSchema.test.js
 * @brief Tests configuration normalization and serialization.
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
import { createGraphConfigurationDefaults } from "../../src/ui/config/graphConfigurationDefaults.js";
import {
  normalizeGraphConfigurationSettings,
  serializeGraphConfigurationSettings,
} from "../../src/ui/config/graphConfigurationSchema.js";
import {
  CONFIGURATION_FORMAT,
  CONFIGURATION_VERSION,
} from "../../src/ui/config/configurationUtils.js";
import { GraphConfigurationDialog } from "../../src/ui/config/GraphConfigurationDialog.js";

test("graph configuration defaults expose the requested controls", () => {
  const value = createGraphConfigurationDefaults();
  assert.equal(value.options.datasets.allowAll, true);
  assert.equal(value.options.filters.allowAll, true);
  assert.equal(value.options.ui.language, "auto");
  assert.equal(value.options.ui.showSourceHeader, true);
  assert.equal(value.options.ui.showExpand, true);
  assert.equal(value.options.nativeControls.zoom, true);
  assert.equal(value.options.nativeControls.pan, true);
  assert.equal(value.options.nativeControls.rearrange, true);
  assert.equal(value.config.defaults.maxNodes, 5000);
  assert.equal(value.config.defaults.maxEdges, 10000);
  assert.equal(value.config.defaults.layoutMode, "automatic");
  assert.equal(value.config.defaults.popupTemplate, null);
  assert.deepEqual(value.config.currentResults.filterBy, {
    mode: "none",
    widgetId: null,
  });
});

test("node and edge limits accept only the configured choices", () => {
  assert.equal(
    normalizeGraphConfigurationSettings({
      config: { defaults: { maxNodes: 10000 } },
    }).config.defaults.maxNodes,
    10000,
  );
  assert.equal(
    normalizeGraphConfigurationSettings({
      config: { defaults: { maxNodes: 250000 } },
    }).config.defaults.maxNodes,
    5000,
  );
  assert.equal(
    normalizeGraphConfigurationSettings({
      config: { defaults: { maxEdges: 42 } },
    }).config.defaults.maxEdges,
    10000,
  );
});

test("publication mode locks interaction down to a read-only viewer", () => {
  const dialog = new GraphConfigurationDialog({
    mode: "publish",
    value: {
      options: { interaction: { editEnabled: true, selectionEnabled: true } },
    },
  });
  const interaction = dialog.getValue().options.interaction;
  assert.equal(interaction.readonly, true);
  assert.equal(interaction.editEnabled, false);
  assert.equal(interaction.selectionEnabled, false);
  assert.equal(interaction.popupEnabled, true);
});

test("normalization drops unknown keys and allowlists dataset ids and filter mode", () => {
  const value = normalizeGraphConfigurationSettings({
    options: {
      accessToken: "discard",
      datasets: { allowAll: false, allowed: [2, "3", 0, 2] },
      interaction: { editEnabled: false },
    },
    config: {
      currentResults: { filterBy: { mode: "selection", widgetId: "w2" } },
    },
    callback() {},
  });
  assert.equal(value.options.accessToken, undefined);
  assert.equal(value.options.interaction.persistentSelectionEnabled, undefined);
  assert.deepEqual(value.options.datasets.allowed, [2, 3]);
  assert.equal(value.options.interaction.editEnabled, false);
  assert.deepEqual(value.config.currentResults.filterBy, {
    mode: "selection",
    widgetId: "w2",
  });
});

test("legacy popupTemplate migrates to the node popup template and 'standard' means built-in", () => {
  const migrated = normalizeGraphConfigurationSettings({
    config: { defaults: { popupTemplate: "legacy.tpl" } },
  });
  assert.equal(migrated.config.defaults.popupTemplate, "legacy.tpl");

  const standard = normalizeGraphConfigurationSettings({
    config: { defaults: { popupTemplate: "standard" } },
  });
  assert.equal(standard.config.defaults.popupTemplate, null);
});

test("heurist-graph appearance defaults are allowlisted and clamped", () => {
  const value = normalizeGraphConfigurationSettings({
    config: {
      defaults: {
        gravity: "tight",
        scaling: false,
        labelLength: 15,
        popupDelay: 9,
      },
    },
  });
  assert.equal(value.config.defaults.gravity, "tight");
  assert.equal(value.config.defaults.scaling, false);
  assert.equal(value.config.defaults.labelLength, 20);
  assert.equal(value.config.defaults.popupDelay, 5);

  const defaults = normalizeGraphConfigurationSettings({});
  assert.equal(defaults.config.defaults.gravity, "normal");
  assert.equal(defaults.config.defaults.scaling, true);
  assert.equal(defaults.config.defaults.labelLength, 40);
  assert.equal(defaults.config.defaults.popupDelay, 1);
  assert.equal(defaults.config.defaults.popupTemplate, null);

  const invalidGravity = normalizeGraphConfigurationSettings({
    config: { defaults: { gravity: "extreme" } },
  });
  assert.equal(invalidGravity.config.defaults.gravity, "normal");
});

test("published UI language is restricted to available locale resources", () => {
  assert.equal(
    normalizeGraphConfigurationSettings({ options: { ui: { language: "fre" } } })
      .options.ui.language,
    "fre",
  );
  assert.equal(
    normalizeGraphConfigurationSettings({ options: { ui: { language: "spa" } } })
      .options.ui.language,
    "auto",
  );
});

test("serializer creates the heurist-graph settings envelope", () => {
  const value = serializeGraphConfigurationSettings({
    options: { filters: { allowAll: false, allowed: [5] } },
  });
  assert.equal(value.format, CONFIGURATION_FORMAT);
  assert.equal(value.version, CONFIGURATION_VERSION);
  assert.deepEqual(value.options.filters.allowed, [5]);
});

test("dialog is usable as a value object without a document", () => {
  const dialog = new GraphConfigurationDialog({
    mode: "website",
    value: {
      options: { ui: { showOptions: true, showPublish: true } },
      config: { currentResults: { initialQuery: "t:10" } },
    },
  });
  const value = dialog.getValue();
  assert.equal(value.options.ui.showOptions, true);
  assert.equal(value.options.ui.showPublish, false);
  assert.equal(value.config.currentResults.initialQuery, "t:10");
  assert.equal(dialog.serialize().format, "heurist-graph-settings");
});

test("Options visibility is fixed for preferences and publication but configurable for websites", () => {
  const preferences = new GraphConfigurationDialog({
    mode: "preferences",
    value: {
      options: { ui: { showOptions: false } },
    },
  }).getValue();
  const publication = new GraphConfigurationDialog({
    mode: "publish",
    value: {
      options: { ui: { showOptions: true } },
    },
  }).getValue();
  assert.equal(preferences.options.ui.showOptions, true);
  assert.equal(publication.options.ui.showOptions, false);
});

test("label visibility and disabled gravity survive serialization", () => {
  const defaults = normalizeGraphConfigurationSettings({}).config.defaults;
  assert.equal(defaults.showNodeLabels, true);
  assert.equal(defaults.showEdgeLabels, false);
  const settings = { config: { defaults: { gravity: "off", showNodeLabels: false, showEdgeLabels: true } } };
  const result = normalizeGraphConfigurationSettings(serializeGraphConfigurationSettings(settings));
  assert.equal(result.config.defaults.gravity, "normal");
  assert.equal(result.config.defaults.movement, "once");
  assert.equal(result.config.defaults.showNodeLabels, false);
  assert.equal(result.config.defaults.showEdgeLabels, true);
});
