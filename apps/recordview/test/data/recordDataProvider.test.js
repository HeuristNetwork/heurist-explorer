/**
 * @file recordDataProvider.test.js
 * @brief Tests the single-record fetch contract, including the `_all` fields sentinel.
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
import { RecordDataProvider } from "../../src/data/RecordDataProvider.js";

test("load() requests a single-record ids query with the _all sentinel plus footer fields", async () => {
  let request;
  const provider = new RecordDataProvider({
    apiClient: {
      post: async (path, options) => {
        request = { path, options };
        return { records: [{ rec_ID: 151, rec_Title: "Beijing" }] };
      },
    },
  });
  const record = await provider.load({ id: 151 });
  assert.equal(request.path, "/records");
  assert.equal(request.options.body.q, "ids:151");
  assert.equal(request.options.body.limit, 1);
  assert.equal(request.options.body.resolveDetails, 1);
  const fields = request.options.body.fields.split(",");
  assert.equal(fields[0], "_all");
  for (const footerField of ["rec_Title", "rec_Added", "rec_Modified", "rec_OwnerUGrpID", "rec_NonOwnerVisibility"]) {
    assert.ok(fields.includes(footerField), `expected fields to include ${footerField}`);
  }
  assert.equal(record.rec_ID, 151);
});

test("load() returns null when the record is not found", async () => {
  const provider = new RecordDataProvider({
    apiClient: { post: async () => ({ records: [] }) },
  });
  assert.equal(await provider.load({ id: 151 }), null);
});

test("load() rejects an invalid id", async () => {
  const provider = new RecordDataProvider({ apiClient: { post: async () => ({ records: [] }) } });
  await assert.rejects(() => provider.load({ id: "not-an-id" }), { name: "TypeError" });
});

test("load() rejects a response missing the records array", async () => {
  const provider = new RecordDataProvider({ apiClient: { post: async () => ({}) } });
  await assert.rejects(() => provider.load({ id: 151 }), { name: "TypeError" });
});
