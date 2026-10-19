/**
 * @file selectionMenu.test.js
 * @brief Tests the "Selected" menu: Show selected toggle, Select none, empty collection.
 * @project     Heurist academic knowledge management system
 * @package     heurist-data
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DataApplication } from "../../src/core/DataApplication.js";

const list = await readFile(new URL("../../../../shared/src/widgets/record-list/HRecordList.js", import.meta.url), "utf8");
const html = await readFile(new URL("../../../../shared/src/widgets/record-list/HRecordList.html", import.meta.url), "utf8");
const table = await readFile(new URL("../../src/engine/datatables/DataTablesAdapter.js", import.meta.url), "utf8");
const css = await readFile(new URL("../../../../shared/src/widgets/record-list/HRecordList.css", import.meta.url), "utf8");

test("Show selected has a check mark while on; Select none switches it off; nothing to show without a selection", () => {
  assert.match(html, /data-selection-action="show"><span data-label="Show selected"><\/span><i class="fa-solid fa-check h-recordlist-menu-check"/);
  assert.match(list, /show\.classList\.toggle\("is-checked", this\.showSelectionOnly === true\)/);
  assert.match(list, /this\.selected\.clear\(\);\s*this\.showSelectionOnly = false;/);
  assert.match(list, /if \(!this\.showSelectionOnly && !this\.selected\.size\) return;/);
});

test("Show collection shows the collection size and does nothing for an empty collection", () => {
  assert.match(html, /data-role="collection-count"/);
  assert.match(list, /else if \(action === "show" && this\.collected\.size\)/);
  assert.match(table, /else if \(name === "show" && this\.collected\.size\)/);
  assert.match(table, /this\.collectionCount\.textContent = `\(\$\{this\.collected\?\.size \|\| 0\}\)`/);
});

test("records are not text-selected by Shift+click", () => {
  assert.match(css, /\.h-recordlist-content \{ user-select:none;/);
});

test("showing an empty collection keeps the current result", async () => {
  const app = Object.create(DataApplication.prototype);
  app.config = { engineOptions: { interaction: { persistentSelectionEnabled: true } } };
  app.host = { supportsCollection: () => true };
  app.collection = [];
  app.clearData = () => assert.fail("the current result must stay");
  app.setQuery = () => assert.fail("nothing to show");
  assert.equal(await app.applyCollectionAction("show"), false);
});

test("collectionMode: a permanent checkbox or a +/- row action (default mouseover); collected records highlighted", () => {
  assert.match(list, /collectionMode: options\.collectionMode === "permanent" \? "permanent" : "mouseover"/);
  assert.match(list, /if \(this\.options\.collectionMode !== "permanent"\) return "";/);
  assert.match(list, /data-record-action="collect"/);
  assert.match(list, /item\.classList\.toggle\("h-recordlist-collected"/);
  assert.match(css, /\.h-recordlist-item\.h-recordlist-collected \{ background: var\(--h-color-attention\); \}/);
  assert.match(css, /\.h-recordlist-item\.h-recordlist-selected\.h-recordlist-collected \{ background: var\(--h-color-attention-selected\); \}/);
});

test("Table view: the same collectionMode and collected-row colours", () => {
  assert.match(table, /const collectionColumn = collectionEnabled && this\.options\.collectionMode === "permanent";/);
  assert.match(table, /data-action="collect"/);
  assert.match(table, /node\.classList\.toggle\("heurist-data-collected", inCollection\)/);
});

test("Table view: rows get their collected state when drawn (first draw runs before this.instance is set)", () => {
  assert.match(table, /rowCallback: \(row, data\) => \{/);
  assert.match(table, /this\._syncRowCollection\(row, id\);/);
});

test("list and Table view share the admin info markup (regular eye and bookmark icons)", () => {
  assert.match(list, /adminInfoHtml\(record, "h-recordlist"\)/);
  assert.match(table, /adminInfoHtml\(\s*record,\s*"heurist-data"/);
});
