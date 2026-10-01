/**
 * @file recordPopup.test.js
 * @brief Tests the "i" popup mode, the Built-in Extended view and the lazy Table engine.
 * @project     Heurist academic knowledge management system
 * @package     heurist-data
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { installFakeDom } from "../../../../shared/test/helpers/fakeDom.js";

installFakeDom();
const { dataPopupMode, extendedViewTemplate } = await import("../../src/core/recordTemplates.js");
const { DataApplication } = await import("../../src/core/DataApplication.js");
const { normalizeDataConfigurationSettings } = await import("../../src/ui/config/dataConfigurationSchema.js");

test("the popup and the Extended view default to Built-in", () => {
  assert.equal(dataPopupMode(null), "builtin");
  assert.equal(dataPopupMode(""), "builtin");
  assert.equal(dataPopupMode("none"), "none");
  assert.equal(dataPopupMode("standard"), "standard");
  assert.equal(dataPopupMode("Popup.tpl"), "Popup.tpl");
  assert.equal(extendedViewTemplate(null), "builtin");
  assert.equal(extendedViewTemplate("standard"), "standard");
});

test("the 'i' action is hidden for the None popup and when popups are off (list and table)", async () => {
  const list = await readFile(new URL("../../src/widgets/HRecordList.js", import.meta.url), "utf8");
  assert.match(list, /this\.options\.interaction\.popupEnabled === false \|\| dataPopupMode\(this\.options\.popupTemplate\) === "none"/);
  const table = await readFile(new URL("../../src/engine/datatables/DataTablesAdapter.js", import.meta.url), "utf8");
  assert.match(table, /&& dataPopupMode\(this\.options\.popupTemplate\) !== "none"/);
});

test("Popup template is its own setting; a legacy popupTemplate still fills the card/view templates once", () => {
  const current = normalizeDataConfigurationSettings({
    config: { defaults: { cardTemplate: null, viewTemplate: null, popupTemplate: "Popup.tpl" } },
  });
  assert.equal(current.config.defaults.popupTemplate, "Popup.tpl");
  assert.equal(current.config.defaults.cardTemplate, null, "the popup template is not copied");
  assert.equal(current.config.defaults.viewTemplate, null);
  const legacy = normalizeDataConfigurationSettings({ config: { defaults: { popupTemplate: "legacy.tpl" } } });
  assert.equal(legacy.config.defaults.viewTemplate, "legacy.tpl");
  assert.equal(normalizeDataConfigurationSettings({}).config.defaults.popupTemplate, null);
});

test("the Built-in Extended view renders records with the shared renderer, in one batch", async () => {
  const batches = [];
  const application = Object.create(DataApplication.prototype);
  application.config = { database: "db1", engineOptions: { baseUrl: "http://localhost/heurist/" } };
  application.providers = {
    recordView: {
      loadMany: async (ids) => {
        batches.push(ids);
        return new Map(ids.map((id) => [id, { record: { rec_ID: id, rec_RecTypeID: 12, rec_Title: `R${id}` }, sections: [], recordTypeName: "Place" }]));
      },
    },
    recordContent: { load: async () => assert.fail("no server request for Built-in") },
  };
  const content = await application.requestRecordContent({ records: [{ rec_ID: 1 }, { rec_ID: 2 }], template: "builtin" });
  assert.deepEqual(batches, [[1, 2]]);
  assert.equal(content.size, 2);
  assert.equal(content.get(1).className, "heurist-data-record-view");
});

test("DataTables is loaded only for the Table view; its exporters only with Export on", async () => {
  const engine = await readFile(new URL("../../src/engine/createDataEngine.js", import.meta.url), "utf8");
  assert.doesNotMatch(engine, /^import .*DataTablesAdapter/m, "no static import of the Table engine");
  assert.match(engine, /await import\("\.\/datatables\/DataTablesAdapter\.js"\)/);
  const adapter = await readFile(new URL("../../src/engine/datatables/DataTablesAdapter.js", import.meta.url), "utf8");
  assert.match(adapter, /if \(this\.options\.controls\?\.export !== false\) \{\s*await this\._initializeExportButtons\(\);/);
  assert.match(adapter, /await import\("jszip"\)/);
  assert.match(adapter, /import\("pdfmake\/build\/pdfmake\.js"\)/);
  assert.doesNotMatch(adapter, /^import .*(jszip|pdfmake)/m);
});

test("the Built-in popup shows the full record at once, without More...", async () => {
  const { DataRecordPopup } = await import("../../src/ui/DataRecordPopup.js");
  const loads = [];
  const popup = new DataRecordPopup({
    recordViewLoader: {
      load: async (id, { full }) => {
        loads.push([id, full]);
        return { record: { rec_ID: id, rec_RecTypeID: 12, rec_Title: "Athens" }, sections: [], recordTypeName: "Place" };
      },
    },
  });
  assert.equal(popup.open({ recordId: 7, mode: null }), true);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(loads, [[7, true]]);
  assert.equal(popup.element.querySelectorAll(".heurist-recordview-more").length, 0);
  popup.close();
});
