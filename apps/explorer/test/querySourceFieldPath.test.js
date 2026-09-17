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
