import test from 'node:test';
import assert from 'node:assert/strict';
import { fieldPathCode, inferRecordTypeId } from '../src/widgets/query-source/helpers/fieldPathUtils.js';

test('Query Source field helper serializes HFieldTree paths in Heurist path-code form', () => {
  assert.equal(fieldPathCode([{ dty: 133, fieldType: 'text' }], 10), '10:133');
  assert.equal(fieldPathCode([
    { via: { link: 'lt', dty: 240, targetRty: 48 } },
    { dty: 237, fieldType: 'enum' }
  ], 10), '10:lt240:48:237');
  assert.equal(fieldPathCode([
    { via: { link: 'lt', dty: 240, targetRty: 48 } },
    { via: { link: 'lt', dty: 134, targetRty: 12 } },
    { dty: 28, fieldType: 'geo' }
  ], 10), '10:lt240:48:lt134:12:28');
});

test('Query Source helper infers root record type from text and structured queries', () => {
  assert.equal(inferRecordTypeId('t:12 title:Paris'), 12);
  assert.equal(inferRecordTypeId([{ t: '10' }, { 'f:1': 'x' }]), 10);
});

test('relationship hops are r; saved lt/lf/rt/rf relationship hops are repaired', async () => {
  const { relationLinkCode, normalizeFieldDescriptors, fieldCodeLabel } = await import('../src/widgets/query-source/helpers/fieldPathUtils.js');
  assert.equal(fieldPathCode([{ via: { link: 'r', dty: 155, targetRty: 14 } }, { dty: 10, fieldType: 'date' }], 10), '10:r155:14:10');
  const dbdefs = { fieldGlobal: (id) => ({ 155: { type: 'relmarker', name: 'Located at' }, 134: { type: 'resource', name: 'Place' }, 28: { name: 'Location' } }[id] || null) };
  assert.equal(relationLinkCode('10:lt155:14:10', dbdefs), '10:r155:14:10');
  assert.equal(relationLinkCode('10:rt155:14:10', dbdefs), '10:r155:14:10');
  assert.equal(relationLinkCode('14:lf155:10:1', dbdefs), '14:r155:10:1');
  assert.equal(relationLinkCode('10:lt134:12:28', dbdefs), '10:lt134:12:28', 'pointers keep lt');
  assert.equal(normalizeFieldDescriptors(['10:lt155:14:28'], dbdefs)[0].field, '10:r155:14:28');
  assert.equal(fieldCodeLabel('10:r155:14:28', dbdefs), 'Located at > Location');
});

test('header (metadata) leaves give /records header codes, also for linked records', async () => {
  const { fieldCodeLabel, fieldPathLabel } = await import('../src/widgets/query-source/helpers/fieldPathUtils.js');
  // the record itself: no record type prefix (was "10" = field 10 "Start date")
  assert.equal(fieldPathCode([{ dty: 'title', fieldType: 'freetext' }], 10), 'rec_Title');
  assert.equal(fieldPathCode([{ dty: 'ids', fieldType: 'integer' }], 10), 'rec_ID');
  assert.equal(fieldPathCode([{ dty: 'added', fieldType: 'date' }], 10), 'rec_Added');
  // linked records: the header field ends the path (was "10:lt241:12", refused by the server)
  const linked = [{ via: { link: 'lt', dty: 241, targetRty: 12 } }, { dty: 'ids', fieldType: 'integer' }];
  assert.equal(fieldPathCode(linked, 10), '10:lt241:12:rec_ID');
  assert.equal(fieldPathCode([{ via: { link: 'lf', dty: 134, targetRty: 12 } }, { dty: 'title' }], 10), '10:lf134:12:rec_Title');
  // a leaf that is not an output field gives no code
  assert.equal(fieldPathCode([{ dty: 'anyfield' }], 10), '');
  const dbdefs = { fieldGlobal: (id) => ({ 241: { name: 'Place of death' }, 10: { name: 'Start date' } }[id] || null) };
  assert.equal(fieldCodeLabel('rec_Title', dbdefs), 'Title');
  assert.equal(fieldCodeLabel('10:lt241:12:rec_ID', dbdefs), 'Place of death > Record ID');
  assert.equal(fieldPathLabel(linked, dbdefs), 'Place of death > Record ID');
});
