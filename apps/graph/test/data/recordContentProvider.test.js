/**
 * @file recordContentProvider.test.js
 * @brief Tests record presentation content loading.
 * @project     Heurist academic knowledge management system
 * @package     heurist-data
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import test from "node:test";
import assert from "node:assert/strict";
import { RecordContentProvider } from "../../src/data/RecordContentProvider.js";

test("RecordContentProvider batches lazy Smarty presentation requests", async () => {
  const urls = [];
  const provider = new RecordContentProvider({
    baseUrl: "https://example.test/heurist/",
    database: "demo",
    fetchImpl: async (url) => {
      urls.push(String(url));
      return { ok: true, text: async () => "<p>record</p>" };
    },
  });
  const result = await provider.load({
    records: [{ rec_ID: 3 }, { rec_ID: 4 }],
    template: "cards.tpl",
  });
  assert.equal(result.get(3), "<p>record</p>");
  assert.equal(urls.length, 2);
  assert.match(urls[0], /q=ids%3A3/);
  assert.match(urls[0], /template=cards.tpl/);
});

test("RecordContentProvider preserves successful content when one request fails", async () => {
  const provider = new RecordContentProvider({
    baseUrl: "https://example.test/heurist/",
    database: "demo",
    fetchImpl: async (url) => {
      if (String(url).includes("ids%3A4")) {
        throw new Error("temporary failure");
      }
      return { ok: true, text: async () => "<p>record 3</p>" };
    },
  });
  const result = await provider.load({
    records: [{ rec_ID: 3 }, { rec_ID: 4 }],
    template: "cards.tpl",
  });
  assert.deepEqual([...result], [[3, "<p>record 3</p>"]]);
});
