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

test('every record type is editable for a logged-in user without the legacy editor (plan 21)', () => {
  const { host } = makeHost();
  assert.equal(host.canEditRecordType('RT_QUERY_SOURCE'), true);
  assert.equal(host.canEditRecordType(24), true, 'by id');
  assert.equal(host.canEditRecordType('RT_PERSON'), true);
  assert.equal(host.canEditRecordType(10), true);
  assert.equal(host.canEditRecordType(0), false, 'no type');
  assert.equal(host.canEditRecords(), true);
  const guest = makeHost({ loggedIn: false }).host;
  assert.equal(guest.canEditRecordType('RT_QUERY_SOURCE'), false, 'guest');
  assert.equal(guest.canEditRecords(), false);
  const legacy = { editRecord() {}, canEditRecords: () => true };
  assert.equal(makeHost({ loggedIn: false, bridge: legacy }).host.canEditRecordType(10), true, 'legacy editor edits any type');
});

test('editRecord opens every record in the new editor; the legacy editor only without a login', async () => {
  const legacyCalls = [];
  const bridge = { editRecord: (id) => { legacyCalls.push(id); return { saved: false }; }, canEditRecords: () => true };
  const { host, opened } = makeHost({ bridge, rectypeOf: 29 });
  await host.editRecord(5, { recordType: 'RT_QUERY_SOURCE' });
  assert.deepEqual(opened, [{ recordId: 5 }]);
  await host.editRecord(6); // type read from the server: 29
  assert.deepEqual(opened.at(-1), { recordId: 6 });
  const person = makeHost({ bridge, rectypeOf: 10 });
  await person.host.editRecord(7);
  assert.deepEqual(person.opened, [{ recordId: 7 }]);
  assert.deepEqual(legacyCalls, []);
  const guest = makeHost({ bridge, rectypeOf: 10, loggedIn: false });
  await guest.host.editRecord(8);
  assert.deepEqual(legacyCalls, [8]);
  await assert.rejects(() => makeHost({ rectypeOf: 10, loggedIn: false }).host.editRecord(7), /not available/);
});

test('addRecord creates records of any type in the new editor', async () => {
  const { host, opened } = makeHost();
  await host.addRecord('RT_MAP_DOCUMENT');
  assert.equal(opened.length, 1);
  assert.equal(opened[0].rectypeId, 24);
  // the remembered owner / visibility of new records; first time: viewable (plan 21)
  assert.equal(opened[0].access.visibility, 'viewable');
  await host.addRecord(10);
  assert.equal(opened.at(-1).rectypeId, 10);
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
  assert.equal(specials[1174].hidden, true, 'filter form hidden: set by the Edit of the query');
  assert.equal(specials[1174].edit, undefined);
  assert.equal(specials[12].json, false, 'legacy query text is allowed');
  assert.equal(specials[177].edit, undefined, 'no symbology editor without the legacy host');
});

test('a filter form without a DT_FILTER_FORM field in the record type is refused, values kept', async () => {
  const host = new RecordEditorHost({
    apiClient: { get: async () => ({}), request: async () => ({}) },
    getDbDefs: () => dbdefs,
    ensureDbDefs: async () => dbdefs,
    getBridge: () => null,
    isLoggedIn: () => true,
    editQuery: async (query) => ({ query, filterForm: { groups: [{ children: [] }] } })
  });
  const specials = host.specialEditors(dbdefs);
  const values = { 12: '[{"t":"10"}]' };
  const context = {
    getValue: (dty) => values[dty] ?? null,
    setValue: (dty, value) => { values[dty] = value; },
    hasField: (dty) => Number(dty) !== 1174
  };
  await assert.rejects(specials[12].edit(values[12], context), /DT_FILTER_FORM/);
  assert.deepEqual(values, { 12: '[{"t":"10"}]' }, 'nothing changed');
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

test('geo, time and column fields: Edit opens the Query Source helpers; geo sets the output mode', async () => {
  const consts = { ...DBCONST, DT_GEO_FIELDS: 1161, DT_GEO_OUTPUTMODE: 1162, DT_TIMELINE_FIELDS: 1105, TRM_YES: 532, TRM_NO: 533 };
  const defs = { ...dbdefs, dbconst: (name) => consts[name] ?? null };
  const { host } = makeHost();
  const opened = [];
  host._openHelper = async (title, editor, getResult) => {
    opened.push([title, editor.constructor.name, editor.viewportOptions]);
    if (title === 'Geographic fields') return { ...getResult(), geoFields: ['10:28', '10:lt4:12:28'], geoOutputMode: 'features' };
    if (title === 'Time fields') return [{ field: '10:9' }];
    return [{ field: '10:1' }];
  };
  const specials = host.specialEditors(defs);
  assert.equal(specials[1161].list, true);
  assert.equal(specials[1105].list, true);
  assert.equal(specials[1162].hidden, true, 'output mode hidden: set by the Geo dialog');
  const values = { 12: 't:10', 1162: '533' };
  const context = { getValue: (dty) => values[dty] ?? null, setValue: (dty, value) => { values[dty] = value; }, hasField: () => true };
  assert.deepEqual(await specials[1161].edit('10:28', context), ['10:28', '10:lt4:12:28']);
  assert.equal(values[1162], '532', 'individual features: Yes');
  assert.deepEqual(await specials[1105].edit('', context), ['10:9']);
  assert.equal(await specials[1173].edit('', context), '[{"field":"10:1"}]');
  assert.deepEqual(opened.map((item) => item[0]), ['Geographic fields', 'Time fields', 'Column fields']);
  assert.equal(opened[0][2], false, 'geo dialog without extent and zoom options');
});

