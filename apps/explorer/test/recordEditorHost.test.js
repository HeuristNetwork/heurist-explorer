/**
 * @file recordEditorHost.test.js
 * @brief Explorer as record editor host (plan 14 Phase 3): which editor opens,
 *        edit pens of system record types, readable values of special fields.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from '../../../shared/test/helpers/fakeDom.js';

installFakeDom();
const {
  RecordEditorHost, describeColumns, describeFilterForm, describeRules, describeSymbology, parseJson
} = await import('../src/core/RecordEditorHost.js');

const DBCONST = {
  RT_QUERY_SOURCE: 29, RT_MAP_DOCUMENT: 24, RT_MAP_LAYER: 25,
  DT_QUERY_STRING: 12, DT_FILTER_FORM: 1174, DT_EXPANSION_RULES: 1172, DT_TABLE_FIELDS: 1173, DT_SYMBOLOGY: 177
};
const dbdefs = { dbconst: (name) => DBCONST[name] ?? null, rectypeName: (id) => `Type ${id}` };

/** Host with stubbed dialog and services. */
function makeHost({ loggedIn = true, bridge = null, rectypeOf = 29 } = {}) {
  const opened = [];
  const host = new RecordEditorHost({
    apiClient: {
      get: async () => ({ records: [{ rec_ID: '5', rec_RecTypeID: String(rectypeOf) }] }),
      request: async () => ({})
    },
    getDbDefs: () => dbdefs,
    ensureDbDefs: async () => dbdefs,
    getBridge: () => bridge,
    isLoggedIn: () => loggedIn,
    editQuery: async (query, filterForm) => ({ query: [...query, { f: 1 }], filterForm: filterForm ? { ...filterForm, edited: true } : null }),
    describeQuery: (q) => `query of ${Array.isArray(q) ? q.length : 0} parts`
  });
  host.open = async (target) => { opened.push(target); return { saved: true, recordId: target.recordId || 9 }; };
  return { host, opened };
}

test('system record types are editable for a logged-in user without the legacy editor', () => {
  const { host } = makeHost();
  assert.equal(host.canEditRecordType('RT_QUERY_SOURCE'), true);
  assert.equal(host.canEditRecordType(24), true, 'by id');
  assert.equal(host.canEditRecordType('RT_PERSON'), false);
  assert.equal(host.canEditRecordType(10), false);
  assert.equal(makeHost({ loggedIn: false }).host.canEditRecordType('RT_QUERY_SOURCE'), false, 'guest');
  const legacy = { editRecord() {}, canEditRecords: () => true };
  assert.equal(makeHost({ loggedIn: false, bridge: legacy }).host.canEditRecordType(10), true, 'legacy editor edits any type');
});

test('editRecord opens system records in the new editor and other records in the legacy editor', async () => {
  const legacyCalls = [];
  const bridge = { editRecord: (id) => { legacyCalls.push(id); return { saved: false }; }, canEditRecords: () => true };
  const { host, opened } = makeHost({ bridge, rectypeOf: 29 });
  await host.editRecord(5, { recordType: 'RT_QUERY_SOURCE' });
  assert.deepEqual(opened, [{ recordId: 5 }]);
  await host.editRecord(6); // type read from the server: 29
  assert.deepEqual(opened.at(-1), { recordId: 6 });
  const person = makeHost({ bridge, rectypeOf: 10 });
  await person.host.editRecord(7);
  assert.deepEqual(legacyCalls, [7]);
  assert.equal(person.opened.length, 0);
  await assert.rejects(() => makeHost({ rectypeOf: 10 }).host.editRecord(7), /not available/);
});

test('addRecord creates system records in the new editor', async () => {
  const { host, opened } = makeHost();
  await host.addRecord('RT_MAP_DOCUMENT');
  assert.deepEqual(opened, [{ rectypeId: 24 }]);
});

test('special fields: query and filter form are edited together', async () => {
  const { host } = makeHost();
  const specials = host.specialEditors(dbdefs);
  assert.deepEqual(Object.keys(specials).map(Number).sort((a, b) => a - b), [12, 177, 1172, 1173, 1174]);
  const values = { 12: '[{"t":"10"}]', 1174: '{"groups":[]}' };
  const context = { getValue: (dty) => values[dty] ?? null, setValue: (dty, value) => { values[dty] = value; }, record: null };
  assert.equal(specials[12].describe(values[12]), 'query of 1 parts');
  const query = await specials[12].edit(values[12], context);
  assert.equal(query, '[{"t":"10"},{"f":1}]');
  assert.deepEqual(JSON.parse(values[1174]), { groups: [], edited: true }, 'filter form set too');
  assert.equal(specials[1174].json, true);
  assert.equal(specials[12].json, false, 'legacy query text is allowed');
  assert.equal(specials[177].edit, undefined, 'no symbology editor without the legacy host');
});

test('readable values of special fields', () => {
  assert.equal(describeFilterForm({ groups: [{ children: [{ label: 'Name' }, { label: 'Year' }] }] }), '2 inputs: Name, Year');
  assert.equal(describeRules([{ name: 'People' }, { name: 'Places' }], dbdefs), 'People; Places');
  assert.equal(describeColumns([{}, {}, {}]), '3 columns');
  assert.equal(describeSymbology({ color: '#f00', fillColor: '#0f0' }), 'line #f00, fill #0f0');
  assert.equal(describeSymbology({ symbol: { color: '#f00' }, thematic: [{}, {}] }), 'line #f00, 2 thematic maps');
  assert.equal(parseJson('not json'), null);
  assert.deepEqual(parseJson('[1]'), [1]);
});
