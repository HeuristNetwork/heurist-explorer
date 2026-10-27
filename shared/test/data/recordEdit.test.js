/**
 * @file recordEdit.test.js
 * @brief Record editing data layer (plan 14 Phase 2): edit structure, editor
 *        values, writable record types and RecordEditClient.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEditStructure, separatorType, structureFields } from '../../src/data/recordEditStructure.js';
import {
  buildRecordBody, defaultFieldValues, fieldsToDetails, packValue, recordFieldValues, splitLanguage, unpackValue
} from '../../src/data/recordEditValues.js';
import { isWritableRecordType, multilangFieldIds, writableRecordTypeIds } from '../../src/data/writableRecordTypes.js';
import { RecordEditClient, RecordEditError } from '../../src/data/RecordEditClient.js';
import { RecordStructureProvider } from '../../src/recordview/RecordStructureProvider.js';

const ROWS = [
  { rst_DetailTypeID: '57', rst_DisplayName: 'Description', rst_DisplayOrder: '000', dty_Type: 'separator', rst_DefaultValue: 'tabs' },
  { rst_DetailTypeID: '1', rst_DisplayName: 'Title', rst_DisplayOrder: '001', dty_Type: 'freetext', rst_RequirementType: 'required', rst_MaxValues: '1' },
  { rst_DetailTypeID: '12', rst_DisplayName: 'Query', rst_DisplayOrder: '002', dty_Type: 'blocktext', rst_RequirementType: 'required', rst_MaxValues: '1', rst_DisplayHeight: '5' },
  { rst_DetailTypeID: '58', rst_DisplayName: 'Map', rst_DisplayOrder: '003', dty_Type: 'separator', rst_DefaultValue: 'tabs_new' },
  { rst_DetailTypeID: '1164', rst_DisplayName: 'By extent', rst_DisplayOrder: '004', dty_Type: 'enum', rst_MaxValues: '1', dty_JsonTermIDTree: '6247' },
  { rst_DetailTypeID: '28', rst_DisplayName: 'Box', rst_DisplayOrder: '005', dty_Type: 'geo', rst_MaxValues: '1' },
  { rst_DetailTypeID: '70', rst_DisplayName: 'Extra', rst_DisplayOrder: '006', dty_Type: 'separator', rst_DefaultValue: 'accordion' },
  { rst_DetailTypeID: '15', rst_DisplayName: 'Creators', rst_DisplayOrder: '007', dty_Type: 'resource', rst_MaxValues: '0', dty_PtrTargetRectypeIDs: '10,4' },
  { rst_DetailTypeID: '99', rst_DisplayName: 'Secret', rst_DisplayOrder: '008', dty_Type: 'freetext', rst_RequirementType: 'forbidden' },
  { rst_DetailTypeID: '3', rst_DisplayName: 'Summary', rst_DisplayOrder: '009', dty_Type: 'blocktext', rst_MaxValues: '1' }
];

const dbdefs = {
  dbconst: (name) => ({
    RT_QUERY_SOURCE: 29, RT_MAP_DOCUMENT: 24, RT_CMS_PAGE: 52, DT_NAME: 1, DT_SHORT_SUMMARY: 3, DT_EXTENDED_DESCRIPTION: 4
  })[name] ?? null,
  fieldGlobal: (dty) => ({ concept: `2-${dty}` })
};

test('separator types: the legacy values, anything else is group', () => {
  assert.equal(separatorType('tabs_new'), 'tabs_new');
  assert.equal(separatorType(' Accordion_Inner '), 'accordion_inner');
  assert.equal(separatorType('collapsed'), 'group');
  assert.equal(separatorType(''), 'group');
});

test('separators are placed as in the legacy editor (inner groups, new tab sets, expanded)', () => {
  let order = 0;
  const sep = (id, value, extra = {}) => ({ rst_DetailTypeID: String(id), rst_DisplayName: `S${id}`, rst_DisplayOrder: String(order++),
    dty_Type: 'separator', rst_DefaultValue: value, ...extra });
  const field = (id) => ({ rst_DetailTypeID: String(id), rst_DisplayName: `F${id}`, rst_DisplayOrder: String(order++), dty_Type: 'freetext' });
  const rows = [
    field(1),
    sep(901, 'group'), field(2), // no outer tabs/accordion yet: an outer group
    sep(902, 'tabs'), field(3),
    sep(903, ''), field(4), // inner heading of tab 902
    sep(904, 'accordion_inner'), field(5),
    sep(905, 'explanation', { rst_DisplayHelpText: 'Read this' }), // text only
    sep(906, 'tabs'), field(6),
    sep(907, 'tabs_new'), field(7),
    sep(908, 'expanded_inner'), field(8),
    sep(909, 'group_break'), field(9),
    sep(910, 'group'), field(10), // after a break: outer
    sep(911, 'expanded'), field(11),
    sep(912, 'expanded'), field(12),
    sep(913, 'tabs', { rst_RequirementType: 'forbidden' }), field(13), // heading hidden: stays in 912
    sep(914, 'accordion'), field(14)
  ];
  const structure = buildEditStructure(rows, { rty: 1 });
  const shape = structure.groups.map((group) => [group.id, group.type, group.inner === true ? 'inner' : 'outer',
    group.newTabs ? 'new' : '', group.open === true ? 'open' : '', group.explanation ? 'text' : '',
    group.children.map((child) => child.dty).join(',')].filter(Boolean).join(' '));
  assert.deepEqual(shape, [
    'group outer 1',
    '901 group outer 2',
    '902 tabs outer 3',
    '903 group inner 4',
    '904 accordion inner 5',
    '905 group inner text',
    '906 tabs outer 6',
    '907 tabs outer new 7',
    '908 accordion inner open 8',
    '909 group outer 9',
    '910 group outer 10',
    '911 accordion outer open 11',
    '912 accordion outer 12,13',
    '914 accordion outer 14'
  ]);
});

test('buildEditStructure groups the fields and keeps the edit details', () => {
  const structure = buildEditStructure(ROWS, { rty: 29, multilangIds: [1, 3], dbdefs });
  assert.deepEqual(structure.groups.map((group) => [group.type, group.label, group.newTabs === true]),
    [['tabs', 'Description', false], ['tabs', 'Map', true], ['accordion', 'Extra', false]]);
  const fields = structureFields(structure);
  assert.deepEqual(fields.map((field) => field.dty), [1, 12, 1164, 28, 15, 3], 'forbidden field left out');
  const query = fields.find((field) => field.dty === 12);
  assert.equal(query.req, 'required');
  assert.equal(query.height, 5);
  assert.equal(fields.find((field) => field.dty === 1164).vocabulary, 6247);
  assert.deepEqual(fields.find((field) => field.dty === 15).targetTypes, [10, 4]);
  assert.equal(fields.find((field) => field.dty === 15).max, 0);
  assert.equal(fields.find((field) => field.dty === 1).multilang, true);
  assert.equal(fields.find((field) => field.dty === 12).multilang, false);
  assert.equal(fields.find((field) => field.dty === 1).concept, '2-1');
});

test('fields before the first separator form a group without heading', () => {
  const structure = buildEditStructure([
    { rst_DetailTypeID: '1', rst_DisplayOrder: '1', dty_Type: 'freetext', rst_DisplayName: 'Name' }
  ], { rty: 5 });
  assert.equal(structure.groups.length, 1);
  assert.equal(structure.groups[0].type, 'group');
  assert.equal(structure.groups[0].label, null);
});

test('equal display orders are sorted by rst_ID, as in the legacy editor', () => {
  const structure = buildEditStructure([
    { rst_ID: '3381', rst_DetailTypeID: '9', rst_DisplayOrder: '00020', dty_Type: 'separator', rst_DisplayName: 'Birth and death' },
    { rst_ID: '2384', rst_DetailTypeID: '2', rst_DisplayOrder: '00020', dty_Type: 'resource', rst_DisplayName: 'Place of death' },
    { rst_ID: '2390', rst_DetailTypeID: '3', rst_DisplayOrder: '00021', dty_Type: 'enum', rst_DisplayName: 'Cause of death' },
    { rst_ID: '61', rst_DetailTypeID: '1', rst_DisplayOrder: '00001', dty_Type: 'freetext', rst_DisplayName: 'Name' }
  ], { rty: 10 });
  assert.deepEqual(structure.groups.map((group) => group.children.map((field) => field.dty)), [[1, 2], [3]]);
});

test('language prefixes: 3-letter codes, * and common 2-letter codes', () => {
  assert.deepEqual(splitLanguage('fre:Nom'), { lang: 'fre', text: 'Nom' });
  assert.deepEqual(splitLanguage('de:Name'), { lang: 'de', text: 'Name' });
  assert.deepEqual(splitLanguage('*:All'), { lang: '*', text: 'All' });
  assert.deepEqual(splitLanguage('Re: subject'), { lang: null, text: 'Re: subject' });
  assert.deepEqual(splitLanguage('http://x'), { lang: null, text: 'http://x' });
});

test('stored values become editor entries (compact and resolved forms)', () => {
  assert.deepEqual(unpackValue('resource', { value: '5', rec_ID: '5', rec_RecTypeID: '12', rec_Title: 'Five' }), { value: 5, hidden: false, label: 'Five', rectype: 12 });
  assert.deepEqual(unpackValue('enum', '42'), { value: 42, hidden: false });
  assert.deepEqual(unpackValue('geo', { geo: { type: 'p', wkt: 'POINT(1 2)' }, hidden: true }),
    { value: 'POINT(1 2)', hidden: true, geoType: 'p' });
  assert.deepEqual(unpackValue('freetext', { value: 'x', hidden: true }), { value: 'x', hidden: true });
  assert.equal(unpackValue('freetext', ''), null);
});

test('editor entries become request values', () => {
  assert.equal(packValue('freetext', { value: 'x' }), 'x');
  assert.equal(packValue('enum', { value: 42 }), '42');
  assert.deepEqual(packValue('freetext', { value: 'x', hidden: true }), { value: 'x', hidden: true });
  assert.deepEqual(packValue('geo', { value: 'POINT(1 2)', geoType: 'p' }), { geo: { wkt: 'POINT(1 2)', type: 'p' } });
  assert.deepEqual(packValue('geo', { value: { west: 0, south: 0, east: 1, north: 1 } }),
    { geo: { type: 'r', wkt: 'POLYGON((0 0,1 0,1 1,0 1,0 0))' } });
  assert.equal(packValue('freetext', { value: '  ' }), null);
});

test('a loaded record round-trips through the editor values', () => {
  const structure = buildEditStructure(ROWS, { rty: 29, multilangIds: [1, 3], dbdefs });
  const record = {
    rec_ID: '7', rec_RecTypeID: '29', rec_Modified: '2026-10-12 10:00:00', rec_URL: null, rec_ScratchPad: 'notes',
    details: {
      1: ['Main', 'fre:Principal'],
      12: ['t:10'],
      15: [{ value: '5', rec_ID: '5', rec_Title: 'Five' }],
      3: [{ value: 'Hidden summary', hidden: true }],
      777: ['not in structure']
    }
  };
  const values = recordFieldValues(record, structure);
  assert.deepEqual(values.get(1), { values: [{ value: 'Main', hidden: false }], translations: [{ lang: 'fre', value: 'Principal', hidden: false }] });
  assert.equal(values.get(15).values[0].label, 'Five');
  const body = buildRecordBody({
    record, rectypeId: 29, structure, fields: values,
    header: { owner: 2, visibility: 'hidden', viewGroups: [3], editGroups: [4] }
  });
  assert.equal(body.rec_ID, '7');
  assert.equal(body.rec_Modified, '2026-10-12 10:00:00', 'concurrency token is sent back');
  assert.equal(body.rec_ScratchPad, 'notes', 'headers the editor does not show are kept');
  assert.deepEqual(body.rec_NonOwnerVisibilityGroups, [], 'view groups only for viewable');
  assert.deepEqual(body.rec_EditGroups, ['4']);
  assert.deepEqual(body.details[1], ['Main', 'fre:Principal']);
  assert.deepEqual(body.details[15], ['5']);
  assert.deepEqual(body.details[3], [{ value: 'Hidden summary', hidden: true }]);
  assert.deepEqual(body.details[1164], [], 'empty field is sent as [] (PUT clears it)');
  assert.deepEqual(body.details[777], ['not in structure'], 'values of fields outside the structure are kept');
});

test('a new record starts with the default values', () => {
  const structure = buildEditStructure([
    { rst_DetailTypeID: '925', rst_DisplayOrder: '1', dty_Type: 'float', rst_DefaultValue: '5' },
    { rst_DetailTypeID: '36', rst_DisplayOrder: '2', dty_Type: 'freetext', rst_DefaultValue: 'increment_new_values_by_1' }
  ], { rty: 24 });
  const values = defaultFieldValues(structure);
  assert.deepEqual(values.get(925).values, [{ value: '5', hidden: false }]);
  assert.deepEqual(values.get(36).values, []);
  assert.deepEqual(fieldsToDetails(values, structure), { 925: ['5'], 36: [] });
});

test('writable record types and multilingual fields come from dbconst', () => {
  assert.deepEqual(writableRecordTypeIds(dbdefs), [24, 29, 52]);
  assert.equal(isWritableRecordType(dbdefs, 29), true);
  assert.equal(isWritableRecordType(dbdefs, 10), false);
  assert.deepEqual(multilangFieldIds(dbdefs, 29), [1, 3, 4]);
  assert.deepEqual(multilangFieldIds(dbdefs, 52), [1, 3], 'website page content is not multilingual');
});

/** API client double recording requests. */
function fakeApi(handler) {
  const calls = [];
  return {
    calls,
    async get(path, options = {}) { return this.request(path, { ...options, method: 'GET' }); },
    async request(path, options = {}) {
      calls.push({ path, ...options });
      return handler(path, options);
    }
  };
}

test('RecordEditClient sends inserts, replacements and patches to /records/{id}', async () => {
  const saved = { records: [{ rec_ID: '9', rec_Title: 'X' }], meta: { issues: [{ code: 'max', severity: 'warning' }] } };
  const api = fakeApi(() => saved);
  const client = new RecordEditClient({ apiClient: api });
  const inserted = await client.insert({ rec_RecTypeID: '29', details: {} });
  assert.equal(api.calls[0].method, 'POST');
  assert.equal(api.calls[0].path, '/records/0');
  assert.equal(inserted.record.rec_ID, '9');
  assert.equal(inserted.issues[0].code, 'max');
  await client.update({ rec_ID: '9', details: {} }, { force: true });
  assert.equal(api.calls[1].method, 'PUT');
  assert.equal(api.calls[1].path, '/records/9');
  assert.deepEqual(api.calls[1].query, { force: 1 });
  await client.patch(9, { details: { 1: ['y'] } });
  assert.equal(api.calls[2].method, 'PATCH');
  await client.remove(9, { force: true });
  assert.equal(api.calls[3].method, 'DELETE');
  await client.duplicate(9);
  assert.equal(api.calls[4].path, '/records/9/duplicate');
  await assert.rejects(() => client.insert({ rec_ID: '5' }), TypeError);
});

test('RecordEditClient turns API errors into RecordEditError', async () => {
  const failing = (status, details) => {
    const error = new Error('Heurist API request failed');
    error.status = status;
    error.details = details;
    throw error;
  };
  const issues = [{ field: '12', code: 'required', severity: 'error', message: 'Field "Query" is required' }];
  let client = new RecordEditClient({ apiClient: fakeApi(() => failing(422, { error: 'validation', message: 'invalid', errors: issues })) });
  const validation = await client.update({ rec_ID: '9' }).catch((error) => error);
  assert.ok(validation instanceof RecordEditError);
  assert.equal(validation.isValidation, true);
  assert.deepEqual(validation.issues, issues);
  assert.deepEqual(await client.validate({ rec_ID: '0' }), { valid: false, issues });

  client = new RecordEditClient({ apiClient: fakeApi(() => failing(409, { error: 'conflict', message: 'changed', rec_Modified: 'X' })) });
  const conflict = await client.update({ rec_ID: '9' }).catch((error) => error);
  assert.equal(conflict.isConflict, true);
  assert.equal(conflict.recModified, 'X');

  const references = { pointers: [{ rec_ID: '3' }], relationships: [] };
  client = new RecordEditClient({ apiClient: fakeApi(() => failing(409, { error: 'references', message: 'refs', references })) });
  const refused = await client.remove(9).catch((error) => error);
  assert.equal(refused.hasReferences, true);
  assert.deepEqual(refused.references, references);
});

test('RecordStructureProvider.editStructure loads the edit columns once per record type', async () => {
  const api = fakeApi(() => ({ items: ROWS }));
  const provider = new RecordStructureProvider({ apiClient: api });
  const first = await provider.editStructure(29, { multilangIds: [1] });
  const second = await provider.editStructure(29, { multilangIds: [] });
  assert.equal(api.calls.length, 1);
  assert.match(api.calls[0].query.details, /rst_MaxValues/);
  assert.equal(structureFields(first).find((field) => field.dty === 1).multilang, true);
  assert.equal(structureFields(second).find((field) => field.dty === 1).multilang, false);
});

test('DT_GEO_OBJECT of map documents and data sources is an extent, saved as bounds (2026-10-27)', async () => {
  const { buildEditStructure, geoKindOf } = await import('../../src/data/recordEditStructure.js');
  const { packValue } = await import('../../src/data/recordEditValues.js');
  const codes = { DT_GEO_OBJECT: 28, RT_MAP_DOCUMENT: 31, RT_QUERY_SOURCE: 29, RT_TILED_IMAGE_SOURCE: 40 };
  const defs = { dbconst: (name) => codes[name] ?? null };
  assert.equal(geoKindOf(31, 28, defs), 'extent');
  assert.equal(geoKindOf(40, 28, defs), 'extent');
  assert.equal(geoKindOf(12, 28, defs), 'feature', 'other record types draw any geometry');
  assert.equal(geoKindOf(31, 30, defs), 'feature', 'other geo fields draw any geometry');
  const structure = buildEditStructure([
    { rst_DetailTypeID: 28, dty_Type: 'geo', rst_DisplayOrder: 1, rst_DisplayName: 'Extent' },
    { rst_DetailTypeID: 1, dty_Type: 'freetext', rst_DisplayOrder: 0, rst_DisplayName: 'Name' }
  ], { rty: 29, dbdefs: defs });
  const [name, extent] = structure.groups[0].children;
  assert.equal(extent.geoKind, 'extent');
  assert.equal('geoKind' in name, false);
  assert.deepEqual(packValue('geo', { value: { west: 1, south: 2, east: 3, north: 4 } }),
    { geo: { type: 'r', wkt: 'POLYGON((1 2,3 2,3 4,1 4,1 2))' } });
  assert.deepEqual(packValue('geo', { value: 'POINT(1 2)', geoType: 'p' }), { geo: { wkt: 'POINT(1 2)', type: 'p' } });
});
