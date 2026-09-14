import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMapDocument } from '../../src/core/MapDocument.js';
import { normalizeMapLayer } from '../../src/core/MapLayer.js';
import { MapApplication } from '../../src/core/MapApplication.js';

test('MapDocument preserves native and kilometre zoom semantics separately', () => {
  const document = normalizeMapDocument({
    minZoom: 4,
    maxZoom: 18,
    minimumZoomKm: 2,
    maximumZoomKm: 200,
    zoomToPointInKM: 5
  });
  assert.equal(document.minZoom, 4);
  assert.equal(document.maxZoom, 18);
  assert.equal(document.minimumZoomKm, 2);
  assert.equal(document.maximumZoomKm, 200);
  assert.equal(document.zoomToPointInKM, 5);
});

test('MapLayer preserves native and kilometre visibility ranges', () => {
  const layer = normalizeMapLayer({
    options: { minZoom: 6, maxZoom: 16, minimumZoomKm: 1, maximumZoomKm: 100 }
  });
  assert.deepEqual(
    {
      minZoom: layer.options.minZoom,
      maxZoom: layer.options.maxZoom,
      minimumZoomKm: layer.options.minimumZoomKm,
      maximumZoomKm: layer.options.maximumZoomKm
    },
    { minZoom: 6, maxZoom: 16, minimumZoomKm: 1, maximumZoomKm: 100 }
  );
});

test('native layer zoom levels take precedence over kilometre conversion', () => {
  const calls = [];
  const app = new MapApplication({
    container: { dispatchEvent() {} },
    config: { mapDocument: {}, baseMaps: [], dynamicDocument: { enabled: false } },
    mapEngine: {
      getViewState() { return { center: { latitude: -33.8, longitude: 151.2 } }; },
      distanceKmToZoom(km) { calls.push(km); return km === 100 ? 8 : 15; }
    },
    host: {}
  });
  const layer = normalizeMapLayer({
    source: { bounds: { west: 150, south: -34, east: 152, north: -33 } },
    options: { minZoom: 5, maximumZoomKm: 100, minimumZoomKm: 1 }
  });
  const range = app.resolveLayerZoomRange(layer);
  assert.equal(range.minZoom, 5);
  assert.equal(range.maxZoom, 15);
  assert.deepEqual(calls, [1]);
});

test('point selection uses zoomToPointInKM instead of fitBounds', async () => {
  const calls = [];
  const app = new MapApplication({
    container: { dispatchEvent() {} },
    config: { mapDocument: { zoomToPointInKM: 5 }, baseMaps: [], dynamicDocument: { enabled: false } },
    mapEngine: {
      async getSelectionBounds() { return { west: 151, south: -33, east: 151, north: -33 }; },
      distanceKmToZoom(km) { calls.push(['convert', km]); return 13; },
      async setView(center, zoom) { calls.push(['view', center, zoom]); },
      async fitBounds() { calls.push(['fit']); }
    },
    host: {}
  });
  app.selectionLayerId = 'a';
  app.selectedFeatures.set('1', { featureId: '1', recordId: 1 });
  await app.zoomToSelection();
  assert.deepEqual(calls[0], ['convert', 5]);
  assert.equal(calls[1][0], 'view');
  assert.equal(calls[1][2], 13);
  assert.equal(calls.some((item) => item[0] === 'fit'), false);
});

import { normalizeZoomLimit } from '../../src/utils/normalizeZoomLimit.js';

test('absent native zoom values remain absent rather than becoming zoom zero', () => {
  assert.equal(normalizeZoomLimit(null), null);
  assert.equal(normalizeZoomLimit(undefined), null);
  assert.equal(normalizeZoomLimit(''), null);
  assert.equal(normalizeZoomLimit(0), 0);
  assert.equal(normalizeZoomLimit('12'), 12);
});

test('layer with no zoom range resolves to unrestricted visibility', () => {
  const app = new MapApplication({
    container: { dispatchEvent() {} },
    config: { mapDocument: {}, baseMaps: [], dynamicDocument: { enabled: false } },
    mapEngine: {
      getViewState() { return { center: { latitude: 0, longitude: 0 } }; },
      distanceKmToZoom() { throw new Error('conversion must not be called without km limits'); }
    },
    host: {}
  });
  const range = app.resolveLayerZoomRange(normalizeMapLayer({ options: {} }));
  assert.deepEqual(range, { minZoom: null, maxZoom: null });
});

test('document with no zoom range applies unrestricted limits', async () => {
  const calls = [];
  const app = new MapApplication({
    container: { dispatchEvent() {} },
    config: { mapDocument: {}, baseMaps: [], dynamicDocument: { enabled: false } },
    mapEngine: {
      getViewState() { return { center: { latitude: 0, longitude: 0 } }; },
      distanceKmToZoom() { throw new Error('conversion must not be called without km limits'); },
      async setZoomLimits(limits) { calls.push(limits); }
    },
    host: {}
  });
  const environment = { zoomLimits: {} };
  await app.applyDocumentZoomLimits(environment);
  assert.deepEqual(calls, [{ minZoom: null, maxZoom: null }]);
  assert.deepEqual(environment.effectiveZoomLimits, { minZoom: null, maxZoom: null });
});
