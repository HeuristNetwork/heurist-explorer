import test from 'node:test';
import assert from 'node:assert/strict';
import { MapApplication } from '../../src/core/MapApplication.js';

function createSelectionApplication() {
  const nativeSelections = [];
  const recordByFeature = new Map([
    ['layer-a:a1', 101],
    ['layer-a:a2', 102],
    ['layer-b:b1', 201]
  ]);
  const featuresByRecord = new Map([
    ['layer-a:101', ['a1', 'a1-secondary']],
    ['layer-a:102', ['a2']],
    ['layer-b:201', ['b1']]
  ]);
  const mapEngine = {
    async setFeatureSelection(layerId, featureIds) {
      nativeSelections.push({ layerId, featureIds: [...featureIds] });
      return true;
    },
    getFeatureRecordId(layerId, featureId) {
      return recordByFeature.get(`${layerId}:${featureId}`) ?? null;
    },
    getFeatureIdsByRecord(layerId, recordId) {
      return [...(featuresByRecord.get(`${layerId}:${recordId}`) || [])];
    },
    async getSelectionBounds() {
      return { west: 1, south: 2, east: 3, north: 4 };
    },
    async fitBounds() {},
    async removeLayer() { return true; },
    getCapabilities() { return {}; }
  };
  const events = [];
  const application = new MapApplication({
    container: { dispatchEvent(event) { events.push({ type: event.type, detail: event.detail }); } },
    config: { mapDocument: {}, baseMaps: [], readonly: true },
    mapEngine,
    host: { supportsEditing() { return false; } }
  });
  application.layers.set('layer-a', {
    id: 'layer-a', title: 'A', selectable: true, visible: true, loadState: 'loaded'
  });
  application.layers.set('layer-b', {
    id: 'layer-b', title: 'B', selectable: true, visible: true, loadState: 'loaded'
  });
  application.layers.set('layer-locked', {
    id: 'layer-locked', title: 'Locked', selectable: false, visible: true, loadState: 'loaded'
  });
  return { application, nativeSelections, events };
}

test('selection registry keeps only featureId and recordId', async () => {
  const { application } = createSelectionApplication();
  await application.selectFeature('layer-a', 'a1');
  assert.deepEqual(application.getSelection(), {
    layerId: 'layer-a',
    features: [{ featureId: 'a1', recordId: 101 }]
  });
});

test('multi-selection is restricted to one layer', async () => {
  const { application, nativeSelections } = createSelectionApplication();
  await application.selectFeature('layer-a', 'a1');
  await application.selectFeature('layer-a', 'a2', { additive: true });
  assert.deepEqual(application.getSelection().features, [
    { featureId: 'a1', recordId: 101 },
    { featureId: 'a2', recordId: 102 }
  ]);

  await application.selectFeature('layer-b', 'b1', { additive: true });
  assert.deepEqual(application.getSelection(), {
    layerId: 'layer-b',
    features: [{ featureId: 'b1', recordId: 201 }]
  });
  assert.deepEqual(nativeSelections.at(-2), { layerId: 'layer-a', featureIds: [] });
});

test('non-selectable layer cannot be selected', async () => {
  const { application } = createSelectionApplication();
  await assert.rejects(
    application.selectFeature('layer-locked', 'x1'),
    /not selectable/
  );
  assert.equal(application.getSelection(), null);
});

test('additive click toggles a selected feature', async () => {
  const { application } = createSelectionApplication();
  await application.selectFeature('layer-a', 'a1');
  await application.selectFeature('layer-a', 'a2', { additive: true, toggle: true });
  await application.selectFeature('layer-a', 'a1', { additive: true, toggle: true });
  assert.deepEqual(application.getSelection(), {
    layerId: 'layer-a',
    features: [{ featureId: 'a2', recordId: 102 }]
  });
});

test('selectRecord selects all geometries for one record', async () => {
  const { application } = createSelectionApplication();
  await application.selectRecord('layer-a', 101);
  assert.deepEqual(application.getSelection(), {
    layerId: 'layer-a',
    features: [
      { featureId: 'a1', recordId: 101 },
      { featureId: 'a1-secondary', recordId: 101 }
    ]
  });
});

test('synchronized selection finds a matching visible Workspace layer', async () => {
  const { application } = createSelectionApplication();
  const selection = await application.setSelection([201]);
  assert.equal(selection.layerId, 'layer-b');
  assert.deepEqual(selection.features, [{ featureId: 'b1', recordId: 201 }]);
});

test('feature click emits public events and respects selectable', async () => {
  const { application, events } = createSelectionApplication();
  await application.handleFeatureClick({
    layerId: 'layer-locked', featureId: 'x1', recordId: 301,
    selectable: false, latlng: { latitude: 1, longitude: 2 }
  });
  assert.equal(application.getSelection(), null);
  assert.ok(events.some((event) => event.type === 'heurist-map-feature-click'));
  assert.ok(events.some((event) => event.type === 'heurist-map-layer-click'));
});


test('normal feature click selects all geometries for the clicked record and replaces the previous record', async () => {
  const { application, nativeSelections } = createSelectionApplication();

  await application.handleFeatureClick({
    layerId: 'layer-a', featureId: 'a1', recordId: 101,
    selectable: true, additive: false, latlng: { latitude: 1, longitude: 2 }
  });
  assert.deepEqual(application.getSelection(), {
    layerId: 'layer-a',
    features: [
      { featureId: 'a1', recordId: 101 },
      { featureId: 'a1-secondary', recordId: 101 }
    ]
  });

  await application.handleFeatureClick({
    layerId: 'layer-a', featureId: 'a2', recordId: 102,
    selectable: true, additive: false, latlng: { latitude: 3, longitude: 4 }
  });

  assert.deepEqual(application.getSelection(), {
    layerId: 'layer-a',
    features: [{ featureId: 'a2', recordId: 102 }]
  });
  assert.deepEqual(nativeSelections.at(-1), { layerId: 'layer-a', featureIds: ['a2'] });
});

test('hiding selected layer clears selection', async () => {
  const { application } = createSelectionApplication();
  application.mapEngine.setLayerVisibility = async () => {};
  await application.selectFeature('layer-a', 'a1');
  await application.setLayerVisibility('layer-a', false);
  assert.equal(application.getSelection(), null);
});

test('background map click clears selection and emits event', async () => {
  const { application, events } = createSelectionApplication();
  await application.selectFeature('layer-a', 'a1');
  await application.handleMapClick({ latlng: { latitude: 5, longitude: 6 } });
  assert.equal(application.getSelection(), null);
  assert.ok(events.some((event) => event.type === 'heurist-map-map-click'));
  assert.ok(events.some((event) => event.type === 'heurist-map-selection-cleared'));
});

test('same-layer replacement sends only the final selection to the engine', async () => {
  const { application, nativeSelections } = createSelectionApplication();
  await application.selectFeature('layer-a', 'a1');
  nativeSelections.length = 0;

  await application.selectFeature('layer-a', 'a2');

  assert.deepEqual(nativeSelections, [
    { layerId: 'layer-a', featureIds: ['a2'] }
  ]);
});

test('selectRecord sends all record geometries in one selection update', async () => {
  const { application, nativeSelections } = createSelectionApplication();

  await application.selectRecord('layer-a', 101);

  assert.deepEqual(nativeSelections, [
    { layerId: 'layer-a', featureIds: ['a1', 'a1-secondary'] }
  ]);
});
