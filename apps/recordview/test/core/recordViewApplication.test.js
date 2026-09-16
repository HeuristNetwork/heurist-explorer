/**
 * @file recordViewApplication.test.js
 * @brief Tests selection-following policy, one-way sync, and the single-record fetch contract.
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
import { RecordViewApplication } from "../../src/core/RecordViewApplication.js";
import { normalizeRecordViewConfigurationSettings } from "../../src/ui/config/recordViewConfigurationSchema.js";

/** Build a stub renderer recording every call made to it. */
function createRenderer() {
  const calls = [];
  return {
    calls,
    setNotice(text) { calls.push(["setNotice", text]); },
    showEmpty(message) { calls.push(["showEmpty", message]); },
    showBuiltin(record, vocabulary) { calls.push(["showBuiltin", record, vocabulary]); },
    showFrame(url) { calls.push(["showFrame", String(url)]); },
    clear() { calls.push(["clear"]); },
    destroy() { calls.push(["destroy"]); },
  };
}

/** Build a stub record-data provider serving canned records, recording every load call. */
function createRecordDataProvider(records) {
  const loadCalls = [];
  return {
    loadCalls,
    async load({ id }) {
      loadCalls.push(id);
      return records.get(Number(id)) || null;
    },
  };
}

function createVocabularyProvider() {
  return {
    async getFieldNames() { return new Map(); },
    async getRecordTypeNames() { return new Map(); },
  };
}

function createApplication({ selectionMode = "last", selection = [], recordId = null, records = new Map(), host = {} } = {}) {
  const renderer = createRenderer();
  const recordDataProvider = createRecordDataProvider(records);
  const config = {
    persistedSettings: normalizeRecordViewConfigurationSettings({
      config: { defaults: { selectionMode, engine: "builtin" } },
    }),
    selection,
    recordId,
    loadPreferencesOnInit: false,
  };
  const application = new RecordViewApplication({
    config,
    recordDataProvider,
    vocabularyProvider: createVocabularyProvider(),
    recordContentProvider: { buildUrl: () => null },
    renderer,
    host,
  });
  return { application, renderer, recordDataProvider };
}

test("setSelection with mode 'last' displays the final id in the array", async () => {
  const records = new Map([[5, { rec_ID: 5, rec_Title: "Five", details: {} }], [7, { rec_ID: 7, rec_Title: "Seven", details: {} }]]);
  const { application, recordDataProvider } = createApplication({ selectionMode: "last", records });
  await application.setSelection([5, 7]);
  assert.equal(application.recordId, 7);
  assert.deepEqual(recordDataProvider.loadCalls, [7]);
});

test("setSelection with mode 'first' displays the first id in the array", async () => {
  const records = new Map([[5, { rec_ID: 5, rec_Title: "Five", details: {} }], [7, { rec_ID: 7, rec_Title: "Seven", details: {} }]]);
  const { application, recordDataProvider } = createApplication({ selectionMode: "first", records });
  await application.setSelection([5, 7]);
  assert.equal(application.recordId, 5);
  assert.deepEqual(recordDataProvider.loadCalls, [5]);
});

test("setSelection with mode 'single-only' ignores a multi-record selection and keeps the current record", async () => {
  const records = new Map([[5, { rec_ID: 5, rec_Title: "Five", details: {} }], [7, { rec_ID: 7, rec_Title: "Seven", details: {} }]]);
  const { application, recordDataProvider } = createApplication({ selectionMode: "single-only", records });
  await application.setSelection([5]);
  assert.equal(application.recordId, 5);
  await application.setSelection([5, 7]);
  // The multi-selection is ignored: still showing 5, and no second record fetch was made.
  assert.equal(application.recordId, 5);
  assert.deepEqual(recordDataProvider.loadCalls, [5]);
});

test("setSelection with mode 'single-only' and no prior record shows a distinct empty state for a multi-selection", async () => {
  const { application, renderer } = createApplication({ selectionMode: "single-only" });
  await application.setSelection([5, 7]);
  assert.equal(application.recordId, null);
  assert.deepEqual(renderer.calls.at(-1), ["showEmpty", "Select a single record"]);
});

test("an empty selection always clears, regardless of selectionMode", async () => {
  const records = new Map([[5, { rec_ID: 5, rec_Title: "Five", details: {} }]]);
  const { application } = createApplication({ selectionMode: "first", records, selection: [5], recordId: 5 });
  await application.setSelection([]);
  assert.equal(application.recordId, null);
  assert.deepEqual(application.selection, []);
});

test("setSelection never dispatches the module's own selection-changed event (one-way sync)", async () => {
  const records = new Map([[5, { rec_ID: 5, rec_Title: "Five", details: {} }], [7, { rec_ID: 7, rec_Title: "Seven", details: {} }]]);
  const { application } = createApplication({ selectionMode: "last", records });
  let dispatched = false;
  application.addEventListener("heurist-recordview-selection-changed", () => { dispatched = true; });
  await application.setSelection([5, 7]);
  assert.equal(dispatched, false);
});

test("navigateToRecord updates the display and echoes the selection outward (the deliberate exception)", async () => {
  const records = new Map([[9, { rec_ID: 9, rec_Title: "Nine", details: {} }]]);
  const published = [];
  const { application } = createApplication({ records, host: { publishSelection: (ids) => published.push(ids) } });
  let dispatchedSelection = null;
  application.addEventListener("heurist-recordview-selection-changed", (event) => {
    dispatchedSelection = event.detail.selection;
  });
  await application.navigateToRecord(9);
  assert.equal(application.recordId, 9);
  assert.deepEqual(dispatchedSelection, [9]);
  assert.deepEqual(published, [[9]]);
});

test("the builtin engine fetches exactly one record by id, never a broader query", async () => {
  const records = new Map([[3, { rec_ID: 3, rec_Title: "Three", details: {} }]]);
  const { application, recordDataProvider } = createApplication({ records });
  await application.setRecord(3);
  assert.deepEqual(recordDataProvider.loadCalls, [3]);
  // RecordView has no DataSource-consuming surface at all.
  assert.equal(typeof application.setDataSource, "undefined");
});

test("clear() resets selection and record, and shows the empty state", async () => {
  const records = new Map([[3, { rec_ID: 3, rec_Title: "Three", details: {} }]]);
  const { application, renderer } = createApplication({ records, selection: [3], recordId: 3 });
  await application.setRecord(3);
  await application.clear();
  assert.equal(application.recordId, null);
  assert.deepEqual(application.selection, []);
  assert.deepEqual(renderer.calls.at(-1), ["showEmpty", "Select a record"]);
});

test("setOptions merges partial overrides and re-renders with the new engine", async () => {
  const { application, renderer } = createApplication({ records: new Map(), recordId: null });
  await application.setOptions({ selectionMode: "first", emptyMessage: "Nothing selected" });
  assert.equal(application.selectionMode, "first");
  assert.deepEqual(renderer.calls.at(-1), ["showEmpty", "Nothing selected"]);
});

test("getState reports recordId, selection, selectionMode, engine and options", async () => {
  const records = new Map([[3, { rec_ID: 3, rec_Title: "Three", details: {} }]]);
  const { application } = createApplication({ records });
  await application.setSelection([3]);
  const state = application.getState();
  assert.equal(state.recordId, 3);
  assert.deepEqual(state.selection, [3]);
  assert.equal(state.selectionMode, "last");
  assert.equal(state.engine, "builtin");
  assert.ok(state.options);
});
