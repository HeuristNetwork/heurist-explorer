import test from 'node:test';
import assert from 'node:assert/strict';
import { HostAdapter } from '../src/host/HostAdapter.js';

const adapter = (bridge) => new HostAdapter({ bridge, moduleType: 'data' });

test('editing needs editRecord and, when the bridge reports it, canEditRecords()', () => {
  assert.equal(adapter(null).supportsEditing(), false);
  assert.equal(adapter({}).supportsEditing(), false);
  // a bridge that does not answer cannot prove it
  assert.equal(adapter({ editRecord() {} }).supportsEditing(), false);
  assert.equal(adapter({ editRecord() {}, canEditRecords: () => true }).supportsEditing(), true);
  assert.equal(adapter({ editRecord() {}, canEditRecords: () => false }).supportsEditing(), false, 'guest / no editor');
  assert.equal(adapter({ editRecord() {}, canEditRecords: () => { throw new Error('x'); } }).supportsEditing(), false);
});

test('the answer follows the host (e.g. after login)', () => {
  let loggedIn = false;
  const host = adapter({ editRecord() {}, canEditRecords: () => loggedIn });
  assert.equal(host.supportsEditing(), false);
  loggedIn = true;
  assert.equal(host.supportsEditing(), true);
});

test('system record types can be edited without the legacy editor (canEditRecordType, plan 14)', async () => {
  const calls = [];
  const bridge = {
    editRecord: (id, options) => { calls.push([id, options]); return { saved: true }; },
    canEditRecords: () => false, // no legacy host editor
    canEditRecordType: (type) => type === 'RT_MAP_DOCUMENT'
  };
  const host = adapter(bridge);
  assert.equal(host.supportsEditing(), false, 'any record: legacy answer');
  assert.equal(host.supportsEditing('RT_MAP_DOCUMENT'), true);
  assert.equal(host.supportsEditing('RT_PERSON'), false);
  assert.deepEqual(await host.editRecord(5, { recordType: 'RT_MAP_DOCUMENT' }), { saved: true });
  assert.deepEqual(calls[0], [5, { recordType: 'RT_MAP_DOCUMENT' }]);
  await assert.rejects(() => host.editRecord(5), /not available/);
  // an older bridge without canEditRecordType keeps the legacy answer
  assert.equal(adapter({ editRecord() {}, canEditRecords: () => true }).supportsEditing('RT_MAP_DOCUMENT'), true);
});

test('browseRecords: the host record manager when the bridge has it (plan 21)', async () => {
  assert.equal(adapter({}).supportsBrowse(), false);
  await assert.rejects(adapter({}).browseRecords({ recordTypes: [10] }), /not available/);
  const calls = [];
  const host = adapter({ browseRecords: async (options) => { calls.push(options); return [7]; } });
  assert.equal(host.supportsBrowse(), true);
  assert.deepEqual(await host.browseRecords({ recordTypes: [10], selectMode: 'select' }), [7]);
  assert.deepEqual(calls, [{ recordTypes: [10], selectMode: 'select' }]);
});
