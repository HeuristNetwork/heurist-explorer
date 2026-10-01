/**
 * @file recordRelationsProvider.test.js
 * @brief Tests the relationship / "linked from" searches of the `builtin` engine.
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
import { RecordRelationsProvider, relationshipIds } from "../../src/recordview/RecordRelationsProvider.js";

// relationship type 1, fields 5 (target), 6 (type), 7 (source); relmarker 245 on type 4
const dbdefs = {
  localId: (kind, code) => ({ "rty:2-1": 1, "dty:2-5": 5, "dty:2-6": 6, "dty:2-7": 7, "dty:2-247": 247 })[`${kind}:${code}`] || 0,
  vocabRoot: (dty) => (dty === 245 ? 5414 : 0),
  field: (rty, dty) => (rty === 4 && dty === 245 ? { targetTypes: [10] } : null),
  fieldGlobal: () => null,
  termInverse: (id) => (Number(id) === 6417 ? 6416 : 0),
  termLabel: (id) => ({ 6416: "has Secretary" })[id] || "",
};

const relationship = (pointer, other, type = { value: "6417", trm_ID: "6417", trm_Label: "is Secretary Of" }) => ({
  rec_ID: "900", rec_RecTypeID: "1",
  details: { [pointer]: [{ value: String(other.id), rec_ID: String(other.id), rec_RecTypeID: String(other.rty), rec_Title: other.title }], 6: [type] },
});

function fakeApi(responses) {
  const calls = [];
  return {
    calls,
    get: async (path, { query }) => {
      calls.push({ path, query });
      return { records: responses(query) };
    },
  };
}

test("relationship IDs come from concept codes, or not at all", () => {
  assert.deepEqual(relationshipIds(dbdefs), { rty: 1, target: 5, type: 6, source: 7 });
  assert.equal(relationshipIds({ localId: () => 0 }), null);
  assert.equal(relationshipIds(null), null);
});

test("loads relmarker relationships, relationships pointing here and linking records", async () => {
  const api = fakeApi((query) => {
    const q = JSON.stringify(query.q);
    if (q.includes('"f:7"')) {
      return [
        relationship(5, { id: 204980, rty: 10, title: "Waldheim, Kurt" }),
        relationship(5, { id: 300, rty: 12, title: "Vienna" }),   // not allowed by the field
      ];
    }
    if (q.includes('"f:5"')) return [relationship(7, { id: 204979, rty: 4, title: "UNO" })];
    if (q.includes('"lt"')) {
      return [{ rec_ID: "76", rec_RecTypeID: "12", rec_Title: "Abidjan" }, { rec_ID: "901", rec_RecTypeID: "1", rec_Title: "rel" }];
    }
    return [];
  });
  const provider = new RecordRelationsProvider({ apiClient: api, dbDefsProvider: async () => dbdefs });
  const result = await provider.load({ id: 204979, rty: 4, sections: [{ fields: [{ id: 245, type: "relmarker" }, { id: 1, type: "freetext" }] }] });

  assert.deepEqual(result.related, { 245: [{ id: 204980, title: "Waldheim, Kurt", rty: 10, relation: "is Secretary Of" }] });
  assert.deepEqual(result.relationsFrom, [{ id: 204979, title: "UNO", rty: 4, relation: "has Secretary" }]);
  assert.deepEqual(result.linkedFrom, [{ id: 76, title: "Abidjan", rty: 12, relation: "" }]);

  const related = api.calls.find((call) => JSON.stringify(call.query.q).includes('"f:7"'));
  assert.deepEqual(related.query.q, [{ t: "1" }, { "f:7": "204979" }, { "f:6": "5414" }]);
  assert.equal(related.query.fields, "5,6");
  assert.equal(related.query.resolveDetails, 1);
  const from = api.calls.find((call) => JSON.stringify(call.query.q).includes('"f:5"'));
  assert.deepEqual(from.query.q, [{ t: "1" }, { "f:5": "204979" }]);
  assert.equal(from.query.fields, "6,7");
  // child records pointing back through "Parent entity" (2-247) are left out
  const linking = api.calls.find((call) => JSON.stringify(call.query.q).includes('"lt"'));
  assert.deepEqual(linking.query.q, [{ lt: "204979" }, { not: [{ "lt:247": "204979" }] }]);
});

test("without definitions only linking records load; failures give empty lists", async () => {
  const api = fakeApi((query) => (JSON.stringify(query.q).includes('"lt"') ? [{ rec_ID: "76", rec_RecTypeID: "12", rec_Title: "Abidjan" }] : []));
  const provider = new RecordRelationsProvider({ apiClient: api, dbDefsProvider: async () => { throw new Error("offline"); } });
  const result = await provider.load({ id: 5, rty: 4, sections: [{ fields: [{ id: 245, type: "relmarker" }] }] });
  assert.deepEqual(result.related, {});
  assert.deepEqual(result.relationsFrom, []);
  assert.equal(result.linkedFrom.length, 1);
  assert.equal(api.calls.length, 1);

  const failing = new RecordRelationsProvider({
    apiClient: { get: async () => { throw new Error("500"); } }, dbDefsProvider: async () => dbdefs,
  });
  const empty = await failing.load({ id: 5, rty: 4, sections: [] });
  assert.deepEqual([empty.relationsFrom, empty.linkedFrom], [[], []]);
});
