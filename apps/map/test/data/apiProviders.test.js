import test from 'node:test';
import assert from 'node:assert/strict';

import { HeuristApiClient } from '#shared/api';
import { MapDocumentProvider } from '../../src/data/MapDocumentProvider.js';
import { MapLayerProvider } from '../../src/data/MapLayerProvider.js';
import { QueryGeoDataProvider } from '../../src/data/QueryGeoDataProvider.js';
import { MapApplication } from '../../src/core/MapApplication.js';

const mapDocumentFixture = {
  format: 'heurist-map-document',
  version: 1,
  id: 123,
  title: 'Test document',
  mapBookmark: { raw: '', type: 'view', center: { latitude: 0, longitude: 0 }, zoom: 2 },
  bounds: null,
  symbology: null,
  minimumZoom: null,
  maximumZoom: null,
  zoomToPointInKM: 5,
  worldBaseMap: { id: 1, code: 'OpenStreetMap', label: 'OpenStreetMap' },
  crs: { id: 2, code: 'EPSG:3857', label: 'Web Mercator' },
  layers: [{ id: 20, recordId: 20, title: 'Query', order: 1, visible: true }]
};

const mapLayerFixture = {
  format: 'heurist-map-layer',
  version: 1,
  id: 20,
  title: 'Query',
  description: '',
  visible: true,
  selectable: true,
  source: { type: 'heurist-query', recordId: 20, title: 'Query', query: { t: 10 } },
  style: { type: 'simple', symbol: {}, thematic: null },
  timeline: { enabled: false, fields: [] },
  options: {}
};

test('HeuristApiClient builds a database-scoped map URL', async () => {
  let requestedUrl;
  const client = new HeuristApiClient({
    apiBaseUrl: 'https://example.test/heurist/api',
    database: 'demo db',
    fetchImpl: async (url) => {
      requestedUrl = url;
      return jsonResponse({ type: 'FeatureCollection', features: [], meta: {} });
    }
  });

  await client.get('/map', { query: { q: { t: 10 }, simplify: false } });
  const url = new URL(requestedUrl);
  assert.equal(url.pathname, '/heurist/api/demo%20db/map');
  assert.equal(url.searchParams.get('q'), JSON.stringify({ t: 10 }));
});

test('MapDocumentProvider validates and normalizes the response', async () => {
  const provider = new MapDocumentProvider({
    apiClient: { get: async () => mapDocumentFixture }
  });
  const document = await provider.getById(123);
  assert.equal(document.id, 123);
  assert.equal(document.layers[0].order, 1);
});

test('MapLayerProvider validates the public layer response', async () => {
  const provider = new MapLayerProvider({
    apiClient: { get: async () => mapLayerFixture }
  });
  const layer = await provider.getById(20);
  assert.equal(layer.source.type, 'heurist-query');
  assert.equal(layer.timeline.enabled, false);
});

test('QueryGeoDataProvider merges paginated GeoJSON', async () => {
  const calls = [];
  const provider = new QueryGeoDataProvider({
    apiClient: {
      get: async (path, options) => {
        calls.push(options.query.offset);
        const offset = options.query.offset;
        return {
          type: 'FeatureCollection',
          features: offset === 0 ? [{ type: 'Feature', properties: {}, geometry: null }] : [],
          meta: { total: 1, offset, limit: 1 }
        };
      }
    }
  });

  const result = await provider.searchAll({ query: 't:10', limit: 1 });
  assert.equal(result.features.length, 1);
  assert.deepEqual(calls, [0]);
});




test('QueryGeoDataProvider sends raw geo field paths as a POST array', async () => {
  let request = null;
  const provider = new QueryGeoDataProvider({
    apiClient: {
      post: async (path, options) => {
        request = { path, options };
        return {
          type: 'FeatureCollection',
          features: [],
          meta: { total: 0, offset: 0, limit: 1000 }
        };
      },
      get: async () => { throw new Error('geoFields request must use POST'); }
    }
  });

  await provider.search({
    query: 't:10',
    geoFields: ['10:lt134:12:28', '10:lt240:48:lt134:12:28'],
    geoOutputMode: 'features',
    extent: { west: -10, south: 30, east: 40, north: 70 }
  });

  assert.equal(request.path, '/map');
  assert.deepEqual(request.options.body.geofields, [
    '10:lt134:12:28',
    '10:lt240:48:lt134:12:28'
  ]);
  assert.equal(request.options.body.geoOutputMode, 'features');
  assert.deepEqual(request.options.body.extent, { west: -10, south: 30, east: 40, north: 70 });
  assert.equal(request.options.body.query, 't:10');
});

test('QueryGeoDataProvider caps merged GeoJSON at maxAllowedFeatures', async () => {
  const limits = [];
  const provider = new QueryGeoDataProvider({
    apiClient: {
      get: async (_path, options) => {
        limits.push(options.query.limit);
        const count = options.query.limit;
        return {
          type: 'FeatureCollection',
          features: Array.from({ length: count }, (_, index) => ({ type: 'Feature', id: index, properties: {}, geometry: null })),
          meta: { total: 9000, offset: options.query.offset, limit: count }
        };
      }
    }
  });

  const result = await provider.searchAll({ query: 't:10', limit: 2000, maxFeatures: 2000 });
  assert.equal(result.features.length, 2000);
  assert.deepEqual(limits, [2000]);
});

test('MapApplication loads referenced query layers in document order', async () => {
  const added = [];
  const engine = {
    async initialize() {},
    async destroy() {},
    async addLayer(layer) { added.push(layer.id); return { id: layer.id }; },
    async fitBounds() {},
    getCapabilities() { return {}; },
    async removeLayer() {},
    async setLayerVisibility() {},
    async setView() {},
    async invalidateSize() {},
    getViewState() { return {}; }
  };
  const document = {
    ...mapDocumentFixture,
    layers: [
      { id: 30, recordId: 30, title: 'Second', order: 2, visible: true },
      { id: 20, recordId: 20, title: 'First', order: 1, visible: true }
    ]
  };
  const layerFor = (id) => ({
    ...mapLayerFixture,
    id,
    title: `Layer ${id}`,
    source: { ...mapLayerFixture.source, recordId: id, query: `id:${id}` }
  });

  const application = new MapApplication({
    container: new EventTarget(),
    config: {
      mapDocument: mapDocumentFixture,
      apiBaseUrl: '/heurist/api',
      database: 'demo',
      readonly: true
    },
    mapEngine: engine,
    host: { async initialize() {}, async destroy() {}, supportsEditing() { return false; } },
    providers: {
      mapDocument: { getById: async () => document },
      mapLayer: { getById: async (id) => layerFor(id) },
      queryGeoData: {
        searchAll: async () => ({ type: 'FeatureCollection', features: [], meta: {} })
      }
    },
    layerLoaders: {
      async load(mapLayer, context) {
        return {
          id: context.reference.id,
          recordId: mapLayer.id,
          title: mapLayer.title,
          type: 'geojson',
          visible: mapLayer.visible !== false,
          selectable: mapLayer.selectable !== false,
          data: { type: 'FeatureCollection', features: [] },
          source: mapLayer.source,
          style: mapLayer.style,
          popup: mapLayer.popup,
          options: mapLayer.options,
          order: context.reference.order
        };
      }
    }
  });

  await application.initialize();
  await application.loadMapDocument(123);
  assert.deepEqual(added, [20, 30]);
});

test('QueryGeoDataProvider forwards request cancellation', async () => {
  const controller = new AbortController();
  controller.abort();
  const provider = new QueryGeoDataProvider({
    apiClient: { get: async () => { throw new Error('must not be called'); } }
  });

  await assert.rejects(
    provider.searchAll({ query: 't:10', signal: controller.signal }),
    (error) => error.name === 'AbortError'
  );
});

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

test('MapDocument normalizes API min/max bounds', async () => {
  const provider = new MapDocumentProvider({
    apiClient: {
      get: async () => ({
        ...mapDocumentFixture,
        mapBookmark: null,
        bounds: { minx: -153.23896368, miny: -38.34214362, maxx: 190.64474738, maxy: 70.36205494 }
      })
    }
  });

  const document = await provider.getById(123);
  assert.deepEqual(document.bounds, {
    west: -153.23896368,
    south: -38.34214362,
    east: 190.64474738,
    north: 70.36205494
  });
});

test('MapDocument isolates individual layer failures and keeps sibling layers', async () => {
  const added = [];
  const engine = {
    async initialize() {},
    async destroy() {},
    async addLayer(layer) {
      if (Number(layer.id) === 30) throw new Error('Render failed');
      added.push(layer.id);
      return { id: layer.id };
    },
    async fitBounds() {},
    getCapabilities() { return {}; },
    async removeLayer() {},
    async setLayerVisibility() {},
    async setView() {},
    async invalidateSize() {},
    getViewState() { return {}; }
  };
  const document = {
    ...mapDocumentFixture,
    layers: [
      { id: 20, recordId: 20, title: 'Good', order: 1, visible: true },
      { id: 30, recordId: 30, title: 'Bad render', order: 2, visible: true },
      { id: 40, recordId: 40, title: 'Bad record', order: 3, visible: true }
    ]
  };
  const layerFor = (id) => ({
    ...mapLayerFixture,
    id,
    title: `Layer ${id}`,
    source: { ...mapLayerFixture.source, recordId: id, query: `id:${id}` }
  });

  const application = new MapApplication({
    container: new EventTarget(),
    config: {
      mapDocument: mapDocumentFixture,
      apiBaseUrl: '/heurist/api',
      database: 'demo',
      readonly: true
    },
    mapEngine: engine,
    host: { async initialize() {}, async destroy() {}, supportsEditing() { return false; } },
    providers: {
      mapDocument: { getById: async () => document },
      mapLayer: {
        getById: async (id) => {
          if (Number(id) === 40) throw new Error('MapLayer endpoint failed');
          return layerFor(id);
        }
      },
      queryGeoData: {
        searchAll: async () => ({ type: 'FeatureCollection', features: [], meta: {} })
      }
    },
    layerLoaders: {
      async load(mapLayer, context) {
        return {
          id: context.reference.id,
          recordId: mapLayer.id,
          title: mapLayer.title,
          type: 'geojson',
          visible: mapLayer.visible !== false,
          selectable: mapLayer.selectable !== false,
          data: { type: 'FeatureCollection', features: [] },
          source: mapLayer.source,
          style: mapLayer.style,
          popup: mapLayer.popup,
          options: mapLayer.options,
          order: context.reference.order
        };
      }
    }
  });

  await application.initialize();
  await application.loadMapDocument(123);

  assert.deepEqual(added, [20]);
  const layers = application.getLayers();
  assert.deepEqual(layers.map((layer) => layer.id), [20, 30, 40]);
  assert.equal(layers[0].loadState, 'loaded');
  assert.equal(layers[1].loadState, 'error');
  assert.match(layers[1].error.message, /Render failed/);
  assert.equal(layers[2].loadState, 'error');
  assert.match(layers[2].error.message, /MapLayer endpoint failed/);
});
