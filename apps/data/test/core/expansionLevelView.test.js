/**
 * @file expansionLevelView.test.js
 * @brief Tests the expansion-level pane: rules, levels, selection filter and DataSource changes.
 * @project     Heurist academic knowledge management system
 * @package     heurist-data
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import test from "node:test";
import assert from "node:assert/strict";
import { DataApplication } from "../../src/core/DataApplication.js";

const RULES = [
  { query: { connected: [] }, levels: [{ query: { connected: [] } }] },
  { query: { "lt:4": [] } },
];

/** Minimal DOM stand-ins: the view only appends elements and toggles classes. */
function fakeElement() {
  const classes = new Set();
  return {
    hidden: false,
    className: "",
    textContent: "",
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)),
      contains: (name) => classes.has(name),
    },
    append() {},
    remove() {},
  };
}

/** A record list that records the pages its level asks for. */
function fakeList(requests) {
  return {
    async initialize(context) { this.context = context; },
    async setCollection() {},
    async setData(data) { requests.push({ empty: true, data }); },
    async reload() { requests.push(await this.context.onDataRequest({ offset: 0, limit: 100 })); },
    async applyConfiguration(options) { this.options = options; },
    async destroy() {},
  };
}

/** Data application with fake host/engine/loaders; `requests` collects level loads. */
async function createApplication(requests) {
  globalThis.document ??= { createElement: () => fakeElement() };
  const frame = fakeElement();
  const loads = [];
  const application = new DataApplication({
    container: {},
    frame,
    config: {
      persistedSettings: {},
      ui: {},
      engineOptions: { pageLength: 100, controls: {}, viewMode: "card" },
      source: { querySourceId: null, query: null, fields: [], selection: [] },
    },
    engine: { initialize: async () => {}, setData: async () => {}, setCollection: async () => {},
      setSelection: async () => {}, getState: () => ({ viewMode: "card" }) },
    engineFactory: async () => fakeList(requests),
    host: { initialize: async () => {}, supportsCollection: () => false },
    loaders: {
      load: async (type, request) => {
        loads.push(request);
        return {
          querySource: { source: { query: request.query }, toJSON() { return this; } },
          response: { records: [], pagination: { total: 3, offset: 0 } },
        };
      },
    },
  });
  await application.initialize();
  return { application, frame, loads };
}

/** Wait for the level reloads the main result starts without awaiting them. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test("a DataSource's rules fill the level pane; showing it loads level 1 of all rules", async () => {
  const requests = [];
  const { application, frame, loads } = await createApplication(requests);
  const source = { reference: { type: "source", id: 5 }, request: { q: "t:10", rules: RULES } };
  await application.setDataSource(source);
  const view = application.expansion;
  assert.equal(view.getState().available, true);
  assert.equal(view.getState().maxDepth, 2);
  assert.equal(view.active, false, "the pane starts hidden");

  await view.setActive(true);
  assert.equal(frame.classList.contains("heurist-data-expanded"), true);
  const level = loads.at(-1).query;
  assert.equal(level.any.length, 2, "level 1 of both rules");
  assert.deepEqual(level.any[0], { all: { connected: [{ all: "t:10" }] } });

  await view.setLevel(2);
  assert.deepEqual(loads.at(-1).query, { connected: [{ all: { connected: [{ all: "t:10" }] } }] });
  await view.setLevel(9);
  assert.equal(view.level, 2, "the level stays within the rules");
});

test("the main selection filters the level; disabled rules are left out", async () => {
  const requests = [];
  const { application, loads } = await createApplication(requests);
  await application.setDataSource({ reference: { type: "source", id: 5 }, request: { q: "t:10", rules: RULES } });
  const view = application.expansion;
  await view.setActive(true);
  await view.setRuleEnabled(1, false);
  assert.deepEqual(loads.at(-1).query, { connected: [{ all: "t:10" }] });

  application.selection = [7, 8];
  await view.reload();
  assert.deepEqual(loads.at(-1).query, { connected: [{ all: { ids: [7, 8] } }] });
  await view.setFilterBySelection(false);
  assert.deepEqual(loads.at(-1).query, { connected: [{ all: "t:10" }] });
});

test("a Filter Form submit keeps the pane; another source, record type or removed rules hide it (U7, 2026-10-01)", async () => {
  const requests = [];
  const { application, loads } = await createApplication(requests);
  const source = { reference: { type: "source", id: 5 }, request: { q: "t:10", rules: RULES } };
  await application.setDataSource(source);
  const view = application.expansion;
  await view.setActive(true);
  await view.setLevel(2);
  const resets = [];
  application.addEventListener("heurist-data-expansion-reset", () => resets.push(true));

  await application.setDataSource({ ...source, request: { q: "t:10 f:1:x", rules: RULES } });
  await settle();
  assert.equal(view.active, true, "parameterized search (Filter Form) keeps the pane");
  assert.equal(view.level, 2);
  assert.deepEqual(loads.at(-1).query, { connected: [{ all: { connected: [{ all: "t:10 f:1:x" }] } }] });
  assert.equal(resets.length, 0);

  // QSE: another record type
  const draft = { reference: { type: "query", id: null, key: "query:draft" }, request: { q: "t:10", rules: RULES } };
  await application.setDataSource(draft);
  await view.setActive(true);
  await application.setDataSource({ ...draft, request: { q: "t:12", rules: RULES } });
  assert.equal(view.active, false, "another record type hides the pane");
  assert.equal(resets.length, 2, "and closes the section");

  // QSE: Clear removes the rules
  await application.setDataSource({ ...draft, request: { q: "t:12", rules: RULES } });
  await view.setActive(true);
  await application.setDataSource({ ...draft, request: { q: "t:12" } });
  assert.equal(view.active, false, "Clear (rules removed) hides the pane");
  assert.equal(resets.length, 3);

  await application.setDataSource({ reference: { type: "source", id: 5 }, request: { q: "t:10", rules: RULES } });
  await view.setActive(true);
  await application.setDataSource({ reference: { type: "filter", id: 9 }, request: { q: "t:12", rules: RULES } });
  assert.equal(view.active, false, "another DataSource hides the pane");
  assert.equal(view.level, 1);

  await application.setDataSource({ reference: { type: "filter", id: 9 }, request: { q: "t:12" } });
  assert.equal(view.getState().available, false, "no rules: nothing to show");
});

test("rules-only updates keep the level while the rules reach it", async () => {
  const requests = [];
  const { application } = await createApplication(requests);
  await application.setDataSource({ reference: { type: "source", id: 5 }, request: { q: "t:10", rules: RULES } });
  const view = application.expansion;
  await view.setActive(true);
  await view.setLevel(2);
  await application.setDataSourceRules([...RULES, { query: { rt: [] } }]);
  assert.equal(view.level, 2);
  assert.equal(view.getState().rules.length, 3);
  assert.equal(application.dataSource.request.rules.length, 3);
  await application.setDataSourceRules([{ query: { rt: [] } }]);
  assert.equal(view.level, 1, "the new rules have one level only");
});

test("smart expansion counts the record types one step further, then expands to the chosen ones", async () => {
  const requests = [];
  const { application } = await createApplication(requests);
  await application.setDataSource({ reference: { type: "source", id: 5 }, request: { q: "t:10", rules: [{ query: { t: 48, lt: [{ t: 10 }] }, levels: [] }] } });
  let saved = null;
  application.host.supportsRulesEditing = () => true;
  application.host.updateRules = async (rules) => { saved = rules; await application.setDataSourceRules(rules); };
  const counted = [];
  application.providers.recordDataProvider = {
    rectypes: async ({ query }) => { counted.push(query); return { total: 13, rectypes: [{ rec_RecTypeID: 12, count: 4 }, { rec_RecTypeID: 10, count: 9 }] }; },
  };
  application.providers.recordView = { vocabularyProvider: { getRecordTypeNames: async () => new Map([[12, "Place"], [10, "Person"]]) } };

  const types = await application.smartExpansionTypes();
  assert.deepEqual(types, [{ id: 10, count: 9, label: "Person" }, { id: 12, count: 4, label: "Place" }]);
  assert.ok(counted[0].connected, "counts one connected step further");
  assert.equal(saved, null, "nothing changes before the choice");

  assert.equal(await application.smartExpand([12]), true);
  assert.deepEqual(saved[0].levels, [{ query: { t: 12, connected: [{ t: 48 }] }, levels: [] }]);
  assert.equal(application.expansion.active, true);
  assert.equal(application.expansion.level, 2, "the new deepest level is shown");
});

test("smart expansion is for authors only", async () => {
  const { application } = await createApplication([]);
  await application.setDataSource({ reference: { type: "source", id: 5 }, request: { q: "t:10", rules: RULES } });
  application.providers.recordDataProvider = { rectypes: async () => assert.fail("must not count without rules editing") };
  assert.equal(await application.smartExpansionTypes(), null);
  assert.equal(await application.smartExpand([12]), false);
});

test("paging a counted result does not count again; a new filter or level query does (2026-10-06)", async () => {
  const requests = [];
  const { application, loads } = await createApplication(requests);
  await application.setDataSource({ reference: { type: "source", id: 5 }, request: { q: "t:10", rules: RULES } });
  assert.equal(loads.at(-1).countTotal, undefined, "the first page counts");

  const page = await application._loadPage({ offset: 100, limit: 100 });
  assert.equal(loads.at(-1).countTotal, false, "the next page does not");
  assert.equal(page.recordsFiltered, 3);
  await application._loadPage({ offset: 0, limit: 100, filter: "London" });
  assert.equal(loads.at(-1).countTotal, undefined, "a new filter counts");
  await application._loadPage({ offset: 100, limit: 100, filter: "London" });
  assert.equal(loads.at(-1).countTotal, false);

  const view = application.expansion;
  await view.setActive(true);
  await settle();
  assert.equal(loads.at(-1).countTotal, undefined, "the level's first page counts");
  await view.panes[0].list.context.onDataRequest({ offset: 100, limit: 100 });
  assert.equal(loads.at(-1).countTotal, false, "its next page does not");
  await view.setLevel(2);
  assert.equal(loads.at(-1).countTotal, undefined, "another level counts again");
});
