/**
 * @file recentRecords.test.js
 * @brief Tests the last-viewed records list: most recent first, no repeats, at most 12.
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
import { RecentRecords } from "../../src/core/RecentRecords.js";

function memoryStorage() {
  const map = new Map();
  return { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)) };
}

test("a record viewed again moves to the top instead of repeating", () => {
  const recent = new RecentRecords({ database: "db", storage: memoryStorage() });
  recent.add(1, "One");
  recent.add(2, "Two");
  recent.add(1, "One");
  assert.deepEqual(recent.list(), [{ id: 1, title: "One" }, { id: 2, title: "Two" }]);
});

test("keeps the last 12 records and a known title when a view has none", () => {
  const recent = new RecentRecords({ database: "db", storage: memoryStorage() });
  for (let id = 1; id <= 14; id++) recent.add(id, `R${id}`);
  recent.add(10, null);
  const list = recent.list();
  assert.equal(list.length, 12);
  assert.deepEqual(list[0], { id: 10, title: "R10" });
  assert.deepEqual(list.slice(1, 3).map((entry) => entry.id), [14, 13]);
  assert.ok(!list.some((entry) => entry.id <= 2));
});

test("lists are per database and survive an unavailable storage", () => {
  const storage = memoryStorage();
  new RecentRecords({ database: "a", storage }).add(5, "Five");
  assert.deepEqual(new RecentRecords({ database: "b", storage }).list(), []);
  const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  const recent = new RecentRecords({ database: "a", storage: broken });
  assert.deepEqual(recent.add(5, "Five"), [{ id: 5, title: "Five" }]);
  assert.deepEqual(recent.list(), []);
});
