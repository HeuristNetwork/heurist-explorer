/**
 * @file recordEdit.test.js
 * @brief Record editing data layer (plan 14 Phase 2): edit structure, editor
 *        values, writable record types and RecordEditClient.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEditStructure, separatorLayout, structureFields } from '../../src/data/recordEditStructure.js';
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

test('separators become tabs, accordion or plain groups', () => {
  assert.equal(separatorLayout('tabs'), 'tabs');
  assert.equal(separatorLayout('tabs_new'), 'tabs');
  assert.equal(separatorLayout('accordion_inner'), 'accordion');
  assert.equal(separatorLayout('expanded'), 'accordion');
  assert.equal(separatorLayout('group_break'), 'group');
  assert.equal(separatorLayout(''), 'group');
});

test('buildEditStructure groups the fields and keeps the edit details', () => {
  const structure = buildEditStructure(ROWS, { rty: 29, multilangIds: [1, 3], dbdefs });
  assert.deepEqual(structure.groups.map((group) => [group.type, group.label]),
    [['tabs', 'Description'], ['tabs', 'Map'], ['accordion', 'Extra']]);
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

test('language prefixes: 3-letter codes, * and common 2-letter codes', () => {
  assert.deepEqual(splitLanguage('fre:Nom'), { lang: 'fre', text: 'Nom' });
  assert.deepEqual(splitLanguage('de:Name'), { lang: 'de', text: 'Name' });
  assert.deepEqual(splitLanguage('*:All'), { lang: '*', text: 'All' });
  assert.deepEqual(splitLanguage('Re: subject'), { lang: null, text: 'Re: subject' });
  assert.deepEqual(splitLanguage('http://x'), { lang: null, text: 'http://x' });
});

test('stored values become editor entries (compact and resolved forms)', () => {
  assert.deepEqual(unpackValue('resource', { value: '5', rec_ID: '5', rec_Title: 'Five' }), { value: 5, hidden: false, label: 'Five' });
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
    { geo: { wkt: 'POLYGON((0 0,1 0,1 1,0 1,0 0))' } });
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
