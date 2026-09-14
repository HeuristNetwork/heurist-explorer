import test from 'node:test';
import assert from 'node:assert/strict';
import { VisNetworkAdapter } from '../src/engine/visnetwork/VisNetworkAdapter.js';

test('record-type group colors survive hiding, new expansion types and restoration', () => {
  const adapter = new VisNetworkAdapter();
  const groups = {};
  let updates = 0;
  adapter.network = { setOptions: options => { updates++; Object.assign(groups, options.groups); } };
  adapter.options = {};
  const records = ids => ids.map(recordTypeId => ({ recordTypeId }));
  adapter.syncNodeGroups(records([10,48]));
  const original = structuredClone(groups);
  adapter.syncNodeGroups(records([48]));
  assert.equal(updates, 1, 'visibility changes do not rebuild the palette');
  adapter.syncNodeGroups(records([48,12]));
  adapter.syncNodeGroups(records([12,10,48]));
  assert.deepEqual(groups[10], original[10]);
  assert.deepEqual(groups[48], original[48]);
  for (const id of [10,48,12]) assert.equal(groups[id].color, adapter.getNodeColor(id));
});

test('explicit group color and highlight styles are retained', () => {
  const adapter = new VisNetworkAdapter();
  let assigned;
  const color = { background:'#123456', border:'#234567', highlight:{ background:'#345678' } };
  adapter.options = { groups:{10:{ color, shape:'box' }}, nodes:{color:'#abcdef'} };
  adapter.network = { setOptions: options => { assigned = options.groups; } };
  adapter.syncNodeGroups([{recordTypeId:10},{recordTypeId:48}]);
  assert.deepEqual(assigned[10], { color, shape:'box' });
  assert.equal(assigned[48].color, '#abcdef');
  assert.equal(adapter.getNodeColor(10), color.background);
});

test('node group identifiers match the string keys registered with vis-network', async () => {
  const adapter = new VisNetworkAdapter();
  let groups, nodes;
  adapter.options = {};
  adapter.network = { setOptions: options => { groups = new Map(Object.entries(options.groups)); } };
  adapter.nodes = { update: values => { nodes = values; } };
  adapter.edges = { update: () => {} };
  adapter.rearrange = () => {};
  await adapter.mergeGraph({ records:[{id:1,recordTypeId:48,title:'Event'}], edges:[] });
  assert.equal(groups.get(nodes[0].group).color, nodes[0].color);
});
