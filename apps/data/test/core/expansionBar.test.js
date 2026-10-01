/**
 * @file expansionBar.test.js
 * @brief Tests the Data control panel's Expansion button and Expansion Rules section.
 * @project     Heurist academic knowledge management system
 * @package     heurist-data
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import test from "node:test";
import assert from "node:assert/strict";
import { installFakeDom, flush } from "../../../../shared/test/helpers/fakeDom.js";

installFakeDom();
const { DataExpansionBar } = await import("../../src/ui/DataExpansionBar.js");

function fakeApi(state) {
  const api = new EventTarget();
  api.calls = [];
  api.getExpansionState = () => state;
  api.setExpansionActive = async (active) => {
    api.calls.push(active);
    state.active = active && state.available;
    api.dispatchEvent(new Event("heurist-data-expansion-changed"));
  };
  api.canEditRules = () => true;
  api.canQuickExpand = () => true;
  return api;
}

const STATE = () => ({ available: false, active: false, level: 1, maxDepth: 0, cumulative: false, filterBySelection: true, rules: [] });

test("the Expansion button is enabled without rules and opens the panel body", async () => {
  const opened = [];
  const api = fakeApi(STATE());
  const bar = new DataExpansionBar({ api, onOpenChange: (open) => opened.push(open) });
  const { button, section } = bar.create();
  assert.equal(button.disabled, false, "enabled without rules");
  assert.equal(section.hidden, false, "Quick / Smart expansion create the first rules");
  button.click();
  await flush();
  assert.deepEqual(opened, [true]);
  assert.equal(bar.open, true, "stays open although there is no level pane");
});

test("the Expansion button shows the body and the level pane together; a reset closes both", async () => {
  const state = { ...STATE(), available: true, maxDepth: 2, rules: [{ index: 0, name: "R", enabled: true }] };
  const opened = [];
  const api = fakeApi(state);
  const bar = new DataExpansionBar({ api, onOpenChange: (open) => opened.push(open) });
  const { button } = bar.create();
  button.click();
  await flush();
  assert.deepEqual(api.calls, [true]);
  assert.equal(state.active, true);
  button.click();
  await flush();
  assert.deepEqual(api.calls, [true, false]);
  assert.deepEqual(opened, [true, false]);

  button.click();
  await flush();
  api.dispatchEvent(new Event("heurist-data-expansion-reset"));
  await flush();
  assert.equal(bar.open, false, "another source or query closes it");
  assert.equal(api.calls.at(-1), false);
});

test("the navigator order: Link, Quick, Smart, levels, all levels, Edit rules", () => {
  const bar = new DataExpansionBar({ api: fakeApi(STATE()) });
  bar.create();
  assert.deepEqual(bar.navigator.children, [bar.filterButton, bar.quickButton, bar.smartButton,
    bar.prevButton, bar.levelSelector, bar.nextButton, bar.cumulativeButton, bar.editButton]);
});
