/**
 * @file querySourceRecord.test.js
 * @brief Query Source record fields saved from the Query Source editor (record API, plan 14).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { querySourceDetails, DEFAULT_SOURCE_TITLE } from '../src/core/querySourceRecord.js';

const DBCONST = {
  DT_NAME: 1, DT_QUERY_STRING: 12, DT_EXPANSION_RULES: 1172, DT_TABLE_FIELDS: 1173, DT_FILTER_FORM: 1174,
  DT_GEO_FIELDS: 1169, DT_IS_LOADED_BY_EXTENT: 1164, DT_GEO_OUTPUTMODE: 1171, DT_MINIMUM_ZOOM_LEVEL: 32,
  DT_MAXIMUM_ZOOM_LEVEL: 33, DT_TIMELINE_FIELDS: 1105, TRM_YES: 5444, TRM_NO: 5442
};
const dbdefs = { dbconst: (name) => DBCONST[name] ?? null };

test('a DataSource becomes the Query Source fields of the editor', () => {
  const { title, details } = querySourceDetails({
    title: ' Events ',
    request: { q: [{ t: '10' }], rules: [{ query: 'lt:15' }] },
    presentation: {
      filterForm: { version: 1, groups: [] },
      data: { fields: ['1', '9'] },
      map: { geoFields: ['28', { field: '50' }], dynamicRequests: true, geoOutputMode: 'features', minZoom: 3, maxZoom: '' },
      timeline: { fields: [{ code: '9' }] }
    }
  }, dbdefs);
  assert.equal(title, 'Events');
  assert.deepEqual(details, {
    1: ['Events'],
    12: ['[{"t":"10"}]'],
    1172: ['[{"query":"lt:15"}]'],
    1174: ['{"version":1,"groups":[]}'],
    1173: ['["1","9"]'],
    1169: ['28', '50'],
    1164: ['5444'],
    1171: ['5444'],
    32: ['3'],
    33: [],
    1105: ['9']
  });
});

test('fields the editor does not set are cleared; fields it does not own are not sent', () => {
  const { title, details } = querySourceDetails({ request: { q: 't:10', rules: [] }, presentation: {} }, dbdefs);
  assert.equal(title, DEFAULT_SOURCE_TITLE);
  assert.deepEqual(details[12], ['t:10'], 'text query kept as given');
  assert.deepEqual(details[1172], [], 'no rules: cleared');
  assert.deepEqual(details[1174], [], 'no filter form: cleared');
  assert.deepEqual(details[1169], []);
  assert.deepEqual(details[1105], []);
  assert.deepEqual(details[1164], ['5442']);
  assert.equal('1173' in details, false, 'column fields kept when the source has none');
  assert.equal('3' in details, false, 'summary and other record fields are never sent (PATCH keeps them)');
});

test('the Yes/No terms are required', () => {
  const missing = { dbconst: (name) => (name.startsWith('TRM_') ? null : DBCONST[name]) };
  assert.throws(() => querySourceDetails({ request: { q: [] } }, missing), /Yes\/No/);
});
