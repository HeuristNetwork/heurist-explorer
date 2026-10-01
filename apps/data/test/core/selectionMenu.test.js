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

const list = await readFile(new URL("../../src/widgets/HRecordList.js", import.meta.url), "utf8");
const html = await readFile(new URL("../../src/widgets/HRecordList.html", import.meta.url), "utf8");
const table = await readFile(new URL("../../src/engine/datatables/DataTablesAdapter.js", import.meta.url), "utf8");
const css = await readFile(new URL("../../src/widgets/HRecordList.css", import.meta.url), "utf8");

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
