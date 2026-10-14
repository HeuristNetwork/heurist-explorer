import test from 'node:test';
import assert from 'node:assert/strict';
import { createSymbologyService } from '../../src/host/createSymbologyService.js';

const apiClient = { isConfigured: () => true, buildUrl: (path) => path };

test('in Explorer the symbology editors open through the host bridge; saving stays in the module', async () => {
  const calls = [];
  const hostBridge = { editSymbology: async (value, options) => { calls.push([value, options]); return { stroke: true }; } };
  const service = createSymbologyService({ apiClient, hostBridge });
  const options = { kind: 'style', mode: 'symbol', parentSymbol: { color: '#00f' }, complete: true };
  assert.deepEqual(await service.edit({ color: '#000' }, options), { stroke: true });
  assert.deepEqual(calls, [[{ color: '#000' }, options]]);
  assert.equal(typeof service.saveLayerSymbology, 'function');
});

test('without the bridge method the module opens its own editors', () => {
  const service = createSymbologyService({ apiClient, hostBridge: {} });
  assert.equal(Object.hasOwn(service, 'edit'), false, 'the SymbologyService method is used');
});
