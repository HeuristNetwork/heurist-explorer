/**
 * @file headerCounter.test.js
 * @brief Tests where the counter and export buttons are, and double-click editing of HRecordList.
 * @project     Heurist academic knowledge management system
 * @package     heurist-data
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// HRecordList imports its template with ?raw, which node cannot load: read the sources
const list = await readFile(new URL("../../../../shared/src/widgets/record-list/HRecordList.js", import.meta.url), "utf8");
const html = await readFile(new URL("../../../../shared/src/widgets/record-list/HRecordList.html", import.meta.url), "utf8");
const css = await readFile(new URL("../../../../shared/src/widgets/record-list/HRecordList.css", import.meta.url), "utf8");
const table = await readFile(new URL("../../src/engine/datatables/DataTablesAdapter.js", import.meta.url), "utf8");

test("the record list counter is at the right end of its toolbar, not in the footer", () => {
  const toolbar = html.slice(html.indexOf('<header class="h-recordlist-toolbar'), html.indexOf("</header>"));
  const footer = html.slice(html.indexOf("<footer"), html.indexOf("</footer>"));
  assert.match(toolbar, /data-role="counter" data-control="counter"/);
  assert.doesNotMatch(footer, /data-role="counter"/);
  assert.match(css, /\.h-recordlist-counter \{ margin-left:auto;/);
});

test("the Table view's export buttons and counter are the top DataTables row, under the toolbar", () => {
  assert.match(table, /topStart: buttons,\s*topEnd: controls\.counter === false \? null : "info",/);
  assert.doesNotMatch(table, /bottom2(Start|End)/);
});

test("double-click edits the record, as the pen button, only when editing is allowed", () => {
  assert.match(list, /"dblclick",\s*"\.h-recordlist-item",/);
  // without the host's onRecordActivate (the record manager, plan 21) double-click edits
  assert.match(list, /if \(this\.options\.interaction\.editEnabled === false\) return;\s*this\._editRecord\(id\);/);
});
