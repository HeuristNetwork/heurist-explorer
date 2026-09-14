import test from 'node:test';
import assert from 'node:assert/strict';
import { MapApplication } from '../../src/core/MapApplication.js';

function createApplication() {
  const baseMapChanges = [];
  const mapEngine = {
    async setBaseMap(value) { baseMapChanges.push(value?.id ?? null); },
    async removeLayer() { return true; },
    async destroy() {},
    getCapabilities() { return {}; }
  };
  const application = new MapApplication({
    container: { dispatchEvent() {} },
    config: {
      mapDocument: { id: null, title: 'Initial', layers: [], worldBaseMap: null },
      baseMaps: [
        { id: 'OpenStreetMap', title: 'OpenStreetMap', type: 'tile', url: 'osm' },
        { id: 'None', title: 'None', type: 'none' }
      ],
      readonly: true
    },
    mapEngine,
    host: { supportsEditing() { return false; } }
  });
  return { application, baseMapChanges };
}

test('MapDocument activation is mutually exclusive and unload restores default basemap', async () => {
  const { application, baseMapChanges } = createApplication();
  application.mapDocuments.set(1, { id: 1, title: 'One', loadState: 'available' });
  application.loadMapDocument = async () => ({ id: 1, title: 'One', layers: [], worldBaseMap: null });

  await application.activateMapDocument(1);
  assert.equal(application.getActiveMapDocument().id, 1);
  assert.equal(application.getActiveMapDocument().loadState, 'loaded');
  // A MapDocument without an explicit basemap now uses the configured initial/default basemap.
  assert.equal(baseMapChanges.at(-1), 'OpenStreetMap');

  await application.unloadMapDocument(1);
  assert.equal(application.getActiveMapDocument(), null);
  assert.equal(baseMapChanges.at(-1), 'OpenStreetMap');
});

test('stale MapDocument activation cannot become active', async () => {
  const { application } = createApplication();
  application.mapDocuments.set(1, { id: 1, title: 'One', loadState: 'available' });
  application.mapDocuments.set(2, { id: 2, title: 'Two', loadState: 'available' });
  const resolvers = new Map();
  application.loadMapDocument = (id) => new Promise((resolve) => resolvers.set(id, resolve));

  const first = application.activateMapDocument(1);
  const second = application.activateMapDocument(2);
  resolvers.get(2)({ id: 2, title: 'Two', layers: [], worldBaseMap: null });
  await second;
  resolvers.get(1)({ id: 1, title: 'One', layers: [], worldBaseMap: null });
  await assert.rejects(first, (error) => error.name === 'AbortError');
  assert.equal(application.getActiveMapDocument().id, 2);
});

test('stale deferred layer cannot attach after MapDocument switch cancellation', async () => {
  let resolveLayer;
  let addCount = 0;
  const application = new MapApplication({
    container: { dispatchEvent() {} },
    config: { mapDocument: {}, baseMaps: [], readonly: true },
    mapEngine: {
      async addLayer() { addCount += 1; },
      async removeLayer() { return true; },
      getCapabilities() { return {}; }
    },
    host: { supportsEditing() { return false; } },
    layerLoaders: {
      load() {
        return new Promise((resolve) => { resolveLayer = resolve; });
      }
    }
  });

  const mapLayer = {
    id: 10,
    title: 'Slow layer',
    visible: false,
    source: { type: 'heurist-query' },
    style: {},
    options: {}
  };
  const reference = { id: 'map-layer-10', recordId: 10, order: 0 };
  application.registerDeferredLayer(mapLayer, reference);

  const pending = application.loadDeferredLayer(reference.id);
  application.cancelPendingLayerLoads('Document switched');
  resolveLayer({ id: reference.id, title: 'Slow layer', type: 'geojson', data: { type: 'FeatureCollection', features: [] } });

  await assert.rejects(pending, (error) => error.name === 'AbortError');
  assert.equal(addCount, 0);
});

test('superseded MapDocument activation restores the previous radio state', async () => {
  const { application } = createApplication();
  application.mapDocuments.set(1, { id: 1, title: 'One', loadState: 'available', active: false, activating: false });
  application.mapDocuments.set(2, { id: 2, title: 'Two', loadState: 'available', active: false, activating: false });
  const resolvers = new Map();
  application.loadMapDocument = (id) => new Promise((resolve) => resolvers.set(id, resolve));

  const first = application.activateMapDocument(1);
  assert.equal(application.mapDocuments.get(1).loadState, 'loading');

  const second = application.activateMapDocument(2);
  assert.equal(application.mapDocuments.get(1).activating, false);
  assert.equal(application.mapDocuments.get(1).loadState, 'available');
  assert.equal(application.mapDocuments.get(2).loadState, 'loading');

  resolvers.get(2)({ id: 2, title: 'Two', layers: [], worldBaseMap: null });
  await second;
  resolvers.get(1)({ id: 1, title: 'One', layers: [], worldBaseMap: null });
  await assert.rejects(first, (error) => error.name === 'AbortError');
});

test('reload MapDocument enters loading state immediately', async () => {
  const { application } = createApplication();
  application.mapDocuments.set(1, { id: 1, title: 'One', loadState: 'loaded', active: true, activating: false });
  application.activeMapDocumentId = 1;
  application.config.mapDocument = { id: 1, title: 'One', layers: [], worldBaseMap: null };
  let resolveReload;
  application.loadMapDocument = () => new Promise((resolve) => { resolveReload = resolve; });

  const reload = application.reloadMapDocument(1);
  assert.equal(application.mapDocuments.get(1).activating, true);
  assert.equal(application.mapDocuments.get(1).loadState, 'loading');

  resolveReload({ id: 1, title: 'One', layers: [], worldBaseMap: null });
  await reload;
  assert.equal(application.mapDocuments.get(1).loadState, 'loaded');
});

test('MapDocument becomes active as soon as its environment is ready, before layers finish', async () => {
  const { application } = createApplication();
  application.mapDocuments.set(1, {
    id: 1, title: 'One', loadState: 'available', active: false, activating: false
  });

  let finishLayers;
  application.loadMapDocument = async (id, { onEnvironmentReady }) => {
    const document = { id, title: 'One', layers: [], worldBaseMap: null };
    await onEnvironmentReady(document, {});
    await new Promise((resolve) => { finishLayers = resolve; });
    return document;
  };

  const activation = application.activateMapDocument(1);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(application.getActiveMapDocument().id, 1);
  assert.equal(application.getActiveMapDocument().activating, true);
  assert.equal(application.getActiveMapDocument().loadState, 'loading');

  finishLayers();
  await activation;
  assert.equal(application.getActiveMapDocument().activating, false);
  assert.equal(application.getActiveMapDocument().loadState, 'loaded');
});

test('loadMapDocument applies the document environment before preparing layer data', async () => {
  const { application } = createApplication();
  application.config.apiBaseUrl = '/heurist/api';
  application.config.database = 'test_db';
  application.providers = {
    mapDocument: {
      async getById() {
        return {
          id: 1,
          title: 'One',
          layers: [{ id: 'layer-1', recordId: 10, order: 0 }],
          worldBaseMap: null,
          bounds: { west: 10, south: 20, east: 30, north: 40 }
        };
      }
    },
    mapLayer: {},
    queryGeoData: {}
  };
  application.mapDocuments.set(1, {
    id: 1, title: 'One', loadState: 'available', layerDefinitions: []
  });

  const order = [];
  application.beginMapEnvironment = async () => { order.push('environment'); };
  application.prepareReferencedLayers = async () => {
    order.push('layers');
    return [];
  };
  application.renderPreparedLayers = async () => { order.push('render'); };

  await application.loadMapDocument(1);
  assert.deepEqual(order, ['environment', 'layers', 'render']);
});
