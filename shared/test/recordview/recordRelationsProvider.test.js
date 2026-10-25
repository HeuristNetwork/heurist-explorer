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
  localId: (kind, code) => ({ "rty:2-1": 1, "dty:2-5": 5, "dty:2-6": 6, "dty:2-7": 7 })[`${kind}:${code}`] || 0,
  dbconst: (name) => (name === "DT_PARENT_ENTITY" ? 247 : null),
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

test("loads relmarker relationships, relationships pointing here and linking records, as groups", async () => {
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
  const result = await provider.load({ id: 204979, rty: 4, sections: [{ fields: [{ id: 245, type: "relmarker", name: "Persons" }, { id: 1, type: "freetext" }] }] });

  const related = result.related[245];
  assert.deepEqual(related.items, [{ id: 204980, title: "Waldheim, Kurt", rty: 10, relation: "is Secretary Of" }]);
  assert.equal(related.label, "Persons");
  assert.equal(related.total, 1);
  assert.equal(related.more, null, "everything loaded");
  // the targets of the field's relationships: rf:<field> with this record (plan 09 §11)
  assert.deepEqual(related.query, [{ "rf:245": [{ ids: "204979" }] }]);

  assert.equal(result.relationsFrom.length, 1);
  const from = result.relationsFrom[0];
  assert.deepEqual(from.items, [{ id: 204979, title: "UNO", rty: 4, relation: "has Secretary" }]);
  assert.equal(from.label, "has Secretary");
  assert.deepEqual(from.query, [{ rt: [{ ids: "204979" }, { r: "6417" }] }]);

  // one group per record type; relationship records are left out
  assert.deepEqual(result.linkedFrom.map((group) => [group.rty, group.total, group.items.map((entry) => entry.id)]), [[12, 1, [76]]]);
  assert.deepEqual(result.linkedFrom[0].query, [{ t: "12" }, { lt: "204979" }, { not: [{ "lt:247": "204979" }] }]);

  const relatedCall = api.calls.find((call) => JSON.stringify(call.query.q).includes('"f:7"'));
  assert.deepEqual(relatedCall.query.q, [{ t: "1" }, { "f:7": "204979" }, { "f:6": "5414" }]);
  assert.equal(relatedCall.query.fields, "5,6");
  assert.equal(relatedCall.query.resolveDetails, 1);
  assert.equal(relatedCall.query.limit, 500);
  const fromCall = api.calls.find((call) => JSON.stringify(call.query.q).includes('"f:5"'));
  assert.deepEqual(fromCall.query.q, [{ t: "1" }, { "f:5": "204979" }]);
  assert.equal(fromCall.query.fields, "6,7");
  // child records pointing back through "Parent entity" (2-247) are left out
  const linking = api.calls.find((call) => JSON.stringify(call.query.q).includes('"lt"'));
  assert.deepEqual(linking.query.q, [{ lt: "204979" }, { not: [{ "lt:247": "204979" }] }]);
  // a normal record: one search of each kind, no counts
  assert.equal(api.calls.length, 3);
  assert.ok(api.calls.every((call) => call.path === "/records"));
});

test("a very large record: counts by /aggregate, the first `limit` of each group, more() for the next", async () => {
  // 1000 records link here: 900 of type 12 (ids 1..900), 100 of type 13 (ids 1001..1100);
  // 300 relationships of type 6417 point here (sources 2001..2300)
  const linking = [
    ...Array.from({ length: 900 }, (_, index) => ({ rec_ID: String(index + 1), rec_RecTypeID: "12", rec_Title: `A${index + 1}` })),
    ...Array.from({ length: 100 }, (_, index) => ({ rec_ID: String(index + 1001), rec_RecTypeID: "13", rec_Title: `B${index + 1}` })),
  ];
  const sources = Array.from({ length: 300 }, (_, index) => relationship(7, { id: 2001 + index, rty: 4, title: `S${index + 1}` }));
  const calls = [];
  const page = (rows, query) => {
    const offset = Number(query.offset) || 0;
    return { records: rows.slice(offset, offset + Number(query.limit)), pagination: { total: rows.length, offset } };
  };
  const api = {
    get: async (path, { query }) => {
      calls.push({ path, query });
      const q = JSON.stringify(query.q);
      if (path === "/records/aggregate") {
        if (query.op === "rectypes") return { rectypes: [{ rec_RecTypeID: 12, count: 900 }, { rec_RecTypeID: 13, count: 100 }] };
        return { values: [{ value: 6417, count: 300 }] };
      }
      if (q.includes('"f:6"')) return page(sources, query);
      if (q.includes('"f:5"')) return { records: sources.slice(0, 1), pagination: { total: sources.length, offset: 0 } };
      if (q.includes('"lt"')) {
        const type = (query.q.find((part) => part.t) || {}).t;
        if (!type) return { records: linking.slice(0, 3), pagination: { total: linking.length, offset: 0 } };
        return page(linking.filter((row) => row.rec_RecTypeID === type), query);
      }
      return { records: [] };
    },
  };
  // the first page holds 3 rows only (the fake answers at most what the store gives), to cut both groups
  const provider = new RecordRelationsProvider({ apiClient: api, dbDefsProvider: async () => dbdefs, limit: 5 });
  const result = await provider.load({ id: 7, rty: 4, sections: [] });

  const [a, b] = result.linkedFrom;
  assert.deepEqual([a.rty, a.total, a.items.length], [12, 900, 5]);
  assert.deepEqual([b.rty, b.total, b.items.length], [13, 100, 5], "type 13 is not in the first page: its first 5 from its own search");
  assert.deepEqual(b.items.map((entry) => entry.id), [1001, 1002, 1003, 1004, 1005]);
  assert.deepEqual(a.items.map((entry) => entry.id), [1, 2, 3, 4, 5], "the first page, then the group's own search from offset 3");
  const groupCall = calls.find((call) => call.query.q?.[0]?.t === "12");
  assert.deepEqual([groupCall.query.offset, groupCall.query.limit], [3, 2]);

  const more = await a.more();
  assert.deepEqual(more.map((entry) => entry.id), [6, 7, 8, 9, 10]);
  assert.equal(a.items.length, 10);

  const rel = result.relationsFrom[0];
  assert.deepEqual([rel.total, rel.items.length], [300, 5]);
  assert.deepEqual(rel.items.map((entry) => entry.id), [2001, 2002, 2003, 2004, 2005]);
  const typeCall = calls.find((call) => JSON.stringify(call.query.q).includes('"f:6"'));
  assert.deepEqual(typeCall.query.q, [{ t: "1" }, { "f:5": "7" }, { "f:6": "=6417" }], "exactly this relation type");
  assert.ok(calls.some((call) => call.path === "/records/aggregate" && call.query.op === "values" && call.query.field === "6"));
});

test("without definitions only linking records load; failures give empty lists", async () => {
  const api = fakeApi((query) => (JSON.stringify(query.q).includes('"lt"') ? [{ rec_ID: "76", rec_RecTypeID: "12", rec_Title: "Abidjan" }] : []));
  const provider = new RecordRelationsProvider({ apiClient: api, dbDefsProvider: async () => { throw new Error("offline"); } });
  const result = await provider.load({ id: 5, rty: 4, sections: [{ fields: [{ id: 245, type: "relmarker" }] }] });
  assert.deepEqual(result.related, {});
  assert.deepEqual(result.relationsFrom, []);
  assert.equal(result.linkedFrom.length, 1);
  assert.equal(result.linkedFrom[0].items.length, 1);
  assert.equal(api.calls.length, 1);

  const failing = new RecordRelationsProvider({
    apiClient: { get: async () => { throw new Error("500"); } }, dbDefsProvider: async () => dbdefs,
  });
  const empty = await failing.load({ id: 5, rty: 4, sections: [] });
  assert.deepEqual([empty.relationsFrom, empty.linkedFrom], [[], []]);
});
