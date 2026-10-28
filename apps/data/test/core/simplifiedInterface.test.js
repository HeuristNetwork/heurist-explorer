/**
 * @file simplifiedInterface.test.js
 * @brief Tests heurist-explorer's simplified interface in heurist-data: fixed settings,
 *        the dialog without its sections, the toolbar order, Sort and See/hide owners.
 * @project     Heurist academic knowledge management system
 * @package     heurist-data
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { applySimplifiedDataSettings } from "../../src/ui/config/simplifiedDataSettings.js";
import { createHeuristDataConfig } from "../../src/dataConfig.js";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("the simplified settings: header, Options, Expansion; no page size or search; Built-in templates; all interactions", () => {
  const settings = applySimplifiedDataSettings({
    options: {
      ui: { showSourceHeader: false, showOptions: false, showExpansion: false },
      nativeControls: { pageSize: true, search: true, counter: false, export: false, viewMode: false, selectionActions: false },
      interaction: { editEnabled: false, selectionEnabled: false, persistentSelectionEnabled: false, popupEnabled: false, adminInfoEnabled: false },
    },
    config: { defaults: { viewTemplate: "standard", popupTemplate: "none", viewMode: "list" } },
  });
  assert.deepEqual(settings.options.ui, { showSourceHeader: true, showOptions: true, showExpansion: true });
  assert.deepEqual(settings.options.nativeControls,
    { pageSize: false, search: false, counter: true, export: true, viewMode: true, sort: true, showOwner: true, selectionActions: true });
  assert.equal(settings.options.interaction.editEnabled, true);
  assert.equal(settings.options.interaction.persistentSelectionEnabled, true);
  assert.equal(settings.options.interaction.adminInfoEnabled, true, "owners shown by default");
  assert.equal(settings.config.defaults.viewTemplate, null);
  assert.equal(settings.config.defaults.popupTemplate, null);
  assert.equal(settings.config.defaults.viewMode, "list", "the user's view mode stays");
  // See/hide owners: a saved value is kept
  const hidden = applySimplifiedDataSettings({ options: { interaction: { adminInfoEnabled: false } } }, { adminInfoSaved: true });
  assert.equal(hidden.options.interaction.adminInfoEnabled, false);
});

test("runtime simplifiedUI reaches the configuration and the engine options", () => {
  const config = createHeuristDataConfig({ runtime: { simplifiedUI: true }, settings: {} });
  assert.equal(config.simplified, true);
  assert.equal(config.engineOptions.simplified, true);
  assert.equal(config.persistedSettings.options.nativeControls.pageSize, false);
  assert.equal(createHeuristDataConfig({ runtime: {}, settings: {} }).simplified, false);
});

test("the form leaves out Interface, Interaction and the Extended view / Popup templates (plan 29)", async () => {
  const { default: form } = await import("../../src/ui/config/dataConfigurationForm.json", { with: { type: "json" } });
  const { describeConfigurationForm } = await import("../../../../shared/src/data/moduleConfigurationForm.js");
  const shown = describeConfigurationForm(form, { mode: "configuration", simplified: true, showOptional: true })
    .filter((row) => row.shown).map((row) => row.key);
  assert.ok(shown.every((key) => key.startsWith("config.defaults.")), shown.join());
  assert.ok(!shown.includes("config.defaults.viewTemplate") && !shown.includes("config.defaults.popupTemplate"));
});
test("record list toolbar: Counter, Pagination, View, Selected, Sort, See/hide owners", async () => {
  const list = await source("../../../../shared/src/widgets/record-list/HRecordList.js");
  assert.match(list, /toolbar\.prepend\(\s*\.\.\.\[\s*this\.\$\('\[data-role="counter"\]'\),\s*this\.\$\("\.h-recordlist-pagination"\),\s*this\.\$\('\[data-control="viewMode"\]'\),\s*this\.\$\('\[data-control="selectionActions"\]'\),\s*this\._sortControl,\s*this\._ownersToggle,/);
  const table = await source("../../src/engine/datatables/DataTablesAdapter.js");
  assert.match(table, /if \(this\.options\.simplified === true \|\| typeof listControls\.sort === "boolean"[^{]*\{\s*bar\.append\(\s*\(this\.sortControl = createSortSelect/);
});

test("the list sort is used by this module's loads only, unless the engine sorts itself", async () => {
  const app = await source("../../src/core/DataApplication.js");
  assert.match(app, /sort: request\.sort \?\? this\.listSort \?\? undefined,/);
  assert.match(app, /interaction\.adminInfoEnabled = interaction\.adminInfoEnabled !== true;/);
});

test("pagination pages: all up to 12; above, first … 3 before, current, 3 after … last", async () => {
  const { pageEntries } = await import("../../../../shared/src/widgets/record-list/pageEntries.js");
  assert.deepEqual(pageEntries(0, 12), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.deepEqual(pageEntries(10, 30), [0, null, 7, 8, 9, 10, 11, 12, 13, null, 29]);
  assert.deepEqual(pageEntries(0, 30), [0, 1, 2, 3, null, 29]);
  assert.deepEqual(pageEntries(29, 30), [0, null, 26, 27, 28, 29]);
});

test("pagination: hidden with one page, a select in a narrow pane", async () => {
  const list = await source("../../../../shared/src/widgets/record-list/HRecordList.js");
  const css = await source("../../../../shared/src/widgets/record-list/HRecordList.css");
  assert.match(list, /if \(nav\) nav\.hidden = pages <= 1;/);
  assert.match(css, /@container \(max-width: 520px\) \{\s*\.h-recordlist-pagination > \.h-pagination \{ display:none; \}\s*\.h-recordlist-page-select \{ display:inline-block; \}/);
});

test("the empty header slot (Filter Form open in Explorer's Search pane) leaves no gap", async () => {
  const css = await source("../../src/style.css");
  assert.match(css, /\.heurist-data-root \.heurist-data-header-content:empty \{ display:none; \}/);
});
