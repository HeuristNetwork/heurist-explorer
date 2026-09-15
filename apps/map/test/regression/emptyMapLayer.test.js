import test from 'node:test';
import assert from 'node:assert/strict';
import { isEmptyMapLayer, LayerPanelItem } from '../../src/ui/LayerPanelItem.js';

const layer = { id: 'workspace-1', loadState: 'loaded', source: { type: 'heurist-query' }, featureCount: 0 };

test('empty map state requires a known zero count from a successful non-viewport load', () => {
  assert.equal(isEmptyMapLayer(layer), true);
  for (const change of [
    { loadState: 'deferred' }, { loadState: 'loading' }, { loadState: 'error' },
    { options: { dynamicRequests: true } }, { featureCount: null },
    { featureCount: undefined }, { featureCount: 3 }, { source: { type: 'tile' } }
  ]) assert.equal(isEmptyMapLayer({ ...layer, ...change }), false);
  assert.equal(isEmptyMapLayer({ ...layer, resultMeta: { returnedFeatures: 0, isPartial: true } }), true);
  assert.equal(isEmptyMapLayer({ ...layer, resultMeta: { returnedFeatures: 2 } }), false);
});

test('empty layers suppress symbology and keep current-result visibility editable', () => {
  const previous = globalThis.document;
  globalThis.document = { createElement: () => ({ classList: { add() {} }, addEventListener() {} }) };
  try {
    const item = Object.create(LayerPanelItem.prototype);
    item.layer = layer;
    item.empty = true;
    assert.equal(item.createSymbologyActions(), null);
    assert.equal(item.createThematicSelector(), null);
    assert.equal(item.createStateControl().disabled, true);
    item.layer = { ...layer, id: 'current-results' };
    assert.equal(item.createStateControl().disabled, false);
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
});
