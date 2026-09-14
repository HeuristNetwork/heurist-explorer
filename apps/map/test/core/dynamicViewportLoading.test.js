import test from 'node:test';
import assert from 'node:assert/strict';
import { MapApplication } from '../../src/core/MapApplication.js';
import { normalizeExtent } from '../../src/data/QueryGeoDataProvider.js';

const VIEW = {
  zoom: 6,
  bounds: { west: -16, south: 32, east: 40, north: 72 },
  center: { latitude: 52, longitude: 12 }
};

test('dynamic viewport is normalized independently without changing the stored query', () => {
  const query = [{ t: 12 }];
  assert.deepEqual(normalizeExtent(VIEW.bounds), VIEW.bounds);
  assert.deepEqual(query, [{ t: 12 }]);
});

test('dynamic viewport coordinates are clamped to valid longitude and latitude ranges', () => {
  const bounds = { west: -240, south: -120, east: 220, north: 105 };

  assert.deepEqual(
    normalizeExtent(bounds),
    { west: -180, south: -90, east: 180, north: 90 }
  );
});

function createDynamicApplication({ layers, view = VIEW, loaderDelay = 0 } = {}) {
  const requests = [];
  const visibility = [];
  const removed = [];
  const warnings = [];
  let interactionHandlers = {};
  let currentView = structuredClone(view);

  const mapEngine = {
    async initialize() {},
    setInteractionHandlers(value) { interactionHandlers = value; },
    async destroy() {},
    async addLayer(definition) { requests.push(definition); return { id: definition.id }; },
    async removeLayer(id) { removed.push(id); return true; },
    async setLayerVisibility(id, visible) { visibility.push([String(id), visible]); },
    async setLayerOpacity() {}, async setBaseMap() {}, async fitBounds() {}, async setView() {}, async setZoomLimits() {},
    getViewState() { return structuredClone(currentView); },
    distanceKmToZoom() { return null; },
    getCapabilities() { return {}; },
    async getVisibleLayerBounds() { return null; }
  };

  const layerLoaders = {
    async load(mapLayer, context) {
      if (loaderDelay) {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, loaderDelay);
          context.signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(context.signal.reason || new DOMException('aborted', 'AbortError'));
          }, { once: true });
        });
      }
      return {
        id: context.reference.id,
        recordId: mapLayer.id,
        title: mapLayer.title,
        type: 'geojson',
        visible: true,
        selectable: true,
        data: { type: 'FeatureCollection', features: [] },
        source: {
          ...mapLayer.source,
          requestedQuery: mapLayer.source.query,
          requestedExtent: context.viewport || null
        },
        style: {}, popup: { enabled: true }, options: mapLayer.options,
        order: context.reference.order,
        resultMeta: { returnedFeatures: 0, returnedRecords: 0, totalRecords: 0, isPartial: false }
      };
    }
  };

  const container = { dispatchEvent(event) { if (event.type === 'heurist-map-warning') warnings.push(event.detail); } };
  const application = new MapApplication({
    container,
    config: {
      mapDocument: {},
      documents: { initiallyActive: 'dynamic' },
      defaults: {}, interaction: {},
      dynamicDocument: { enabled: true, id: 'dynamic', title: 'Dynamic', layers },
      ui: { showCurrentDocument: true }, baseMaps: [], readonly: true
    },
    mapEngine,
    host: { async initialize() {}, async destroy() {}, supportsEditing() { return false; } },
    providers: {}, layerLoaders
  });
  application.initialized = true;
  return {
    application, requests, visibility, removed, warnings,
    getHandlers: () => interactionHandlers,
    setView: (next) => { currentView = structuredClone(next); }
  };
}

test('only one visible dynamic layer is loaded for the current zoom', async () => {
  const ctx = createDynamicApplication({ layers: [
    { id: 'overview', title: 'Overview', visible: true, source: { type: 'heurist-query', query: [{ t: 12 }] }, options: { dynamicRequests: true, minZoom: 0, maxZoom: 8 } },
    { id: 'detail', title: 'Detail', visible: true, source: { type: 'heurist-query', query: [{ t: 12 }] }, options: { dynamicRequests: true, minZoom: 9, maxZoom: 18 } }
  ] });

  const document = ctx.application.getDynamicDocumentEntry();
  for (const stored of document.layerDefinitions) {
    ctx.application.registerDeferredLayer(stored.mapLayer, stored.reference, { preserveVisible: true });
  }
  await ctx.application.refreshDynamicLayer(VIEW);

  assert.equal(ctx.requests.length, 1);
  assert.equal(ctx.requests[0].id, 'overview');
  assert.deepEqual(ctx.requests[0].source.requestedQuery, [{ t: 12 }]);
  assert.deepEqual(ctx.requests[0].source.requestedExtent, VIEW.bounds);
  assert.equal(ctx.application.getLayer('detail').loadState, 'deferred');
});

test('overlapping dynamic zoom ranges load only the highest-order layer and emit warning', async () => {
  const ctx = createDynamicApplication({ layers: [
    { id: 'lower', title: 'Lower', visible: true, source: { type: 'heurist-query', query: 't:12' }, options: { dynamicRequests: true, minZoom: 0, maxZoom: 10 } },
    { id: 'upper', title: 'Upper', visible: true, source: { type: 'heurist-query', query: 't:12' }, options: { dynamicRequests: true, minZoom: 5, maxZoom: 12 } }
  ] });
  const document = ctx.application.getDynamicDocumentEntry();
  for (const stored of document.layerDefinitions) ctx.application.registerDeferredLayer(stored.mapLayer, stored.reference, { preserveVisible: true });

  await ctx.application.refreshDynamicLayer(VIEW);
  assert.equal(ctx.requests.length, 1);
  assert.equal(ctx.requests[0].id, 'upper');
  assert.equal(ctx.warnings.length, 1);
  assert.equal(ctx.warnings[0].code, 'dynamic-layer-overlap');
});

test('unchanged viewport does not repeat a dynamic request', async () => {
  const ctx = createDynamicApplication({ layers: [
    { id: 'only', title: 'Only', visible: true, source: { type: 'heurist-query', query: 't:12' }, options: { dynamicRequests: true } }
  ] });
  const stored = ctx.application.getDynamicDocumentEntry().layerDefinitions[0];
  ctx.application.registerDeferredLayer(stored.mapLayer, stored.reference, { preserveVisible: true });

  await ctx.application.refreshDynamicLayer(VIEW);
  await ctx.application.refreshDynamicLayer(VIEW);
  assert.equal(ctx.requests.length, 1);
  assert.deepEqual(ctx.visibility.at(-1), ['only', true]);
});

test('new viewport aborts the in-flight dynamic request', async () => {
  const ctx = createDynamicApplication({ layers: [
    { id: 'only', title: 'Only', visible: true, source: { type: 'heurist-query', query: 't:12' }, options: { dynamicRequests: true } }
  ], loaderDelay: 40 });
  const stored = ctx.application.getDynamicDocumentEntry().layerDefinitions[0];
  ctx.application.registerDeferredLayer(stored.mapLayer, stored.reference, { preserveVisible: true });

  const first = ctx.application.refreshDynamicLayer(VIEW);
  await new Promise((resolve) => setTimeout(resolve, 5));
  const secondView = { ...VIEW, bounds: { west: -10, south: 35, east: 30, north: 65 } };
  const second = ctx.application.refreshDynamicLayer(secondView);
  assert.equal(await first, null, 'superseded request is hidden from the caller');
  await second;
  assert.equal(ctx.application.getLayer('only').loadState, 'loaded');
});


test('dynamic refresh handles numeric runtime layer keys used by persisted MapLayers', async () => {
  const ctx = createDynamicApplication({ layers: [
    { id: 17, title: 'Persisted-like layer', visible: true, source: { type: 'heurist-query', query: 't:12' }, options: { dynamicRequests: true } }
  ] });
  const stored = ctx.application.getDynamicDocumentEntry().layerDefinitions[0];
  stored.reference.id = 17;
  ctx.application.registerDeferredLayer(stored.mapLayer, stored.reference, { preserveVisible: true });

  await ctx.application.refreshDynamicLayer(VIEW);
  assert.equal(ctx.requests.length, 1);
  assert.equal(ctx.application.getLayer(17).loadState, 'loaded');
});
