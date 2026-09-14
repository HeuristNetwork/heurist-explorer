/**
 * phase3a.test.js - Phase 3A automated tests
 *
 * @fileOverview Tests symbol normalization, feature metadata normalization, generated IDs, and layer loader registry behavior.
 * @project     Heurist mapping application
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2026 Heurist Network
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @author      Artem Osmakov <osmakov@gmail.com>
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMapSymbol } from '../../src/utils/normalizeMapSymbol.js';
import { normalizeGeoJson } from '../../src/utils/normalizeGeoJson.js';
import { LayerLoaderRegistry } from '../../src/engine/loaders/LayerLoaderRegistry.js';
import { normalizeMapLayer } from '../../src/core/MapLayer.js';
import { TileLayerLoader } from '../../src/engine/loaders/TileLayerLoader.js';
import { ImageLayerLoader } from '../../src/engine/loaders/ImageLayerLoader.js';
import { createImageFilterCss, normalizeImageFilter, normalizeOpacity, transparentColorToRgb } from '../../src/utils/normalizeImageFilter.js';

test('normalizes legacy opacity at the boundary and derives radius from iconSize', () => {
  const symbol = normalizeMapSymbol({ color: '#000', opacity: 2, iconSize: 18 });
  assert.equal(symbol.color, '#000');
  assert.equal(symbol.opacity, 0.02);
  assert.deepEqual(symbol.iconSize, [18, 18]);
  assert.equal(symbol.radius, 9);
});

test('normalizes Heurist and external feature metadata', () => {
  const result = normalizeGeoJson({
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { rec_ID: 123, rec_Title: 'Record title' }, geometry: null },
      { type: 'Feature', properties: { name: 'External feature' }, geometry: null }
    ]
  }, { layerId: 'layer-a', sourceType: 'remote-geojson' });

  assert.equal(result.features[0].id, 'record-123');
  assert.equal(result.features[0].properties.heurist.recordId, 123);
  assert.equal(result.features[1].id, 'layer-a-feature-2');
  assert.equal(result.features[1].properties.heurist.title, 'External feature');
});


test('layer loader registry rejects unknown source types', async () => {
  const registry = new LayerLoaderRegistry();
  await assert.rejects(
    registry.load({ source: { type: 'shp' } }, {}),
    /not supported/
  );
});


test('normalizes and propagates tiled-image bounds', async () => {
  const layer = normalizeMapLayer({
    id: 50,
    title: 'Tiled image',
    source: {
      type: 'tiled-image',
      url: '/tiles/{z}/{x}/{y}.png',
      bounds: { minx: 10, miny: 20, maxx: 30, maxy: 40 }
    }
  });

  assert.deepEqual(layer.source.bounds, { west: 10, south: 20, east: 30, north: 40 });

  const runtime = await new TileLayerLoader().load(layer, {
    reference: { id: 'tiled-50', recordId: 50, order: 1 }
  });

  assert.deepEqual(runtime.bounds, { west: 10, south: 20, east: 30, north: 40 });
  assert.equal(runtime.noWrap, true);
});


test('normalizes image opacity from fractions and percentages', () => {
  assert.equal(normalizeOpacity(0.65), 0.65);
  assert.equal(normalizeOpacity('65'), 0.65);
  assert.equal(normalizeOpacity(100), 1);
  assert.equal(normalizeOpacity(0), 0);
});

test('normalizes image filters and supplies missing CSS units', () => {
  const filter = normalizeImageFilter({
    blur: 10,
    brightness: '3',
    opacity: 75,
    'hue-rotate': 360,
    transparentColor: '#FfF',
    unsupported: 'ignored'
  });

  assert.deepEqual(filter, {
    transparentColor: '#ffffff',
    blur: '10px',
    brightness: '3',
    'hue-rotate': '360deg'
  });
  assert.equal(createImageFilterCss(filter), 'blur(10px) brightness(3) hue-rotate(360deg)');
  assert.deepEqual(transparentColorToRgb(filter.transparentColor), [255, 255, 255]);
});

test('tile loader propagates raster CSS filters and transparent color', async () => {
  const runtime = await new TileLayerLoader().load({
    id: 127,
    title: 'Raster tiles',
    visible: true,
    source: {
      type: 'tile',
      url: '/tiles/{z}/{x}/{y}.jpeg',
      minZoom: 13,
      maxZoom: 19
    },
    style: {
      symbol: {
        opacity: 40,
        contrast: '2.4',
        grayscale: '0.9',
        transparentColor: '#ffffff'
      }
    },
    options: {}
  }, { reference: { recordId: 127, order: 1 } });

  assert.equal(runtime.opacity, 0.4);
  assert.deepEqual(runtime.imageFilter, {
    transparentColor: '#ffffff',
    contrast: '2.4',
    grayscale: '0.9'
  });
});

test('loads an image source as an engine-neutral runtime layer', async () => {
  const runtime = await new ImageLayerLoader().load({
    id: 501,
    title: 'Sydney Satellite',
    description: '',
    visible: true,
    source: {
      type: 'image',
      url: 'https://example.test/image.jpg',
      bounds: { minx: 151.11488376, miny: -33.93908829, maxx: 151.3212204, maxy: -33.74375321 }
    },
    style: { symbol: { opacity: 75, blur: '10px', contrast: '3' } },
    options: {}
  }, { reference: { recordId: 501, order: 2 } });

  assert.equal(runtime.id, 'map-layer-501');
  assert.equal(runtime.type, 'image');
  assert.equal(runtime.opacity, 0.75);
  assert.deepEqual(runtime.bounds, { west: 151.11488376, south: -33.93908829, east: 151.3212204, north: -33.74375321 });
  assert.deepEqual(runtime.imageFilter, { blur: '10px', contrast: '3' });
});

test('application registry excludes GeoJSON payloads', async () => {
  const { MapApplication } = await import('../../src/core/MapApplication.js');
  const mapEngine = {
    async addLayer(definition) {
      assert.equal(definition.data.features.length, 100);
      return { id: definition.id, type: definition.type };
    },
    async removeLayer() { return true; },
    async setLayerVisibility() {},
    getCapabilities() { return {}; },
    async destroy() {}
  };
  const application = new MapApplication({
    container: { dispatchEvent() {} },
    config: {
      mapDocument: {
        format: 'heurist-map-document',
        version: 1,
        id: null,
        title: 'Test',
        mapBookmark: null,
        bounds: null,
        worldBaseMap: null,
        crs: null,
        layers: []
      },
      readonly: true
    },
    mapEngine,
    host: { supportsEditing() { return false; } }
  });

  const features = Array.from({ length: 100 }, (_, index) => ({
    type: 'Feature',
    id: index + 1,
    properties: { title: `Feature ${index + 1}` },
    geometry: { type: 'Point', coordinates: [index, index] }
  }));

  await application.addLayer({
    id: 'performance-layer',
    type: 'geojson',
    title: 'Performance layer',
    data: { type: 'FeatureCollection', features }
  });

  const layer = application.getLayer('performance-layer');
  assert.equal(layer.featureCount, 100);
  assert.equal(Object.hasOwn(layer, 'data'), false);
  assert.equal(JSON.stringify(layer).includes('Feature 100'), false);
});

test('initially hidden MapLayers defer source loading until first show', async () => {
  const { MapApplication } = await import('../../src/core/MapApplication.js');
  let sourceLoadCount = 0;
  const rendered = [];

  const hiddenMapLayer = {
    id: 77,
    title: 'Hidden query layer',
    description: '',
    visible: false,
    selectable: true,
    source: { type: 'heurist-query', query: { t: 10 } },
    style: { type: 'simple', symbol: {} },
    options: {}
  };

  const mapEngine = {
    async initialize() {},
    async destroy() {},
    async addLayer(layer) { rendered.push(layer.id); return { id: layer.id }; },
    async removeLayer() { return true; },
    async setLayerVisibility() {},
    async fitBounds() {},
    getCapabilities() { return {}; }
  };

  const application = new MapApplication({
    container: new EventTarget(),
    config: {
      mapDocument: {
        format: 'heurist-map-document', version: 1, id: null, title: 'Initial',
        mapBookmark: null, bounds: null, worldBaseMap: null, crs: null, layers: []
      },
      apiBaseUrl: '/heurist/api', database: 'demo', readonly: true
    },
    mapEngine,
    host: { async initialize() {}, async destroy() {}, supportsEditing() { return false; } },
    providers: {
      mapDocument: { getById: async () => ({
        format: 'heurist-map-document', version: 1, id: 1, title: 'Test',
        mapBookmark: null, bounds: null, worldBaseMap: null, crs: null,
        layers: [{ id: 'hidden-77', recordId: 77, order: 1 }]
      }) },
      mapLayer: { getById: async () => hiddenMapLayer },
      queryGeoData: {}
    },
    layerLoaders: {
      async load(mapLayer, context) {
        sourceLoadCount += 1;
        return {
          id: context.reference.id,
          recordId: mapLayer.id,
          title: mapLayer.title,
          type: 'geojson',
          visible: true,
          selectable: true,
          data: { type: 'FeatureCollection', features: [] },
          source: mapLayer.source,
          style: mapLayer.style,
          options: mapLayer.options,
          order: context.reference.order
        };
      }
    }
  });

  await application.initialize();
  await application.loadMapDocument(1);

  assert.equal(sourceLoadCount, 0);
  assert.deepEqual(rendered, []);
  assert.equal(application.getLayer('hidden-77').loadState, 'deferred');
  assert.equal(application.getLayer('hidden-77').visible, false);

  await application.setLayerVisibility('hidden-77', true);

  assert.equal(sourceLoadCount, 1);
  assert.deepEqual(rendered, ['hidden-77']);
  assert.equal(application.getLayer('hidden-77').loadState, 'loaded');
  assert.equal(application.getLayer('hidden-77').visible, true);

  await application.setLayerVisibility('hidden-77', false);
  await application.setLayerVisibility('hidden-77', true);
  assert.equal(sourceLoadCount, 1);
});
