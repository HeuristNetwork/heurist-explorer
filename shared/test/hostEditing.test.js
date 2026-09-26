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
