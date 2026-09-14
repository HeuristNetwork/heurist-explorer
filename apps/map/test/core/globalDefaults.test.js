import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMapLayer } from '../../src/core/MapLayer.js';
import { normalizeMapDocument } from '../../src/core/MapDocument.js';
import { createMapEnvironment } from '../../src/core/createMapEnvironment.js';
import { createGeoJsonRuntimeLayer } from '../../src/engine/loaders/GeoJsonLayerLoader.js';

const defaults = {
  zoomToPointInKM: 7,
  symbology: { color: '#123456', fillColor: '#abcdef', radius: 9 },
  selectSymbology: { color: '#ff00ff', fillColor: '#ffff00', radius: 12 },
  markerClustering: true,
  maxAllowedFeatures: 500,
  dynamicRequests: true,
  popupTemplate: 'Title: {{title}}'
};

test('MapDocument zoomToPointInKM uses global fallback but explicit document value wins', () => {
  const inherited = createMapEnvironment(normalizeMapDocument({}), defaults);
  const explicit = createMapEnvironment(normalizeMapDocument({ zoomToPointInKM: 3 }), defaults);
  assert.equal(inherited.zoomToPointInKM, 7);
  assert.equal(explicit.zoomToPointInKM, 3);
});

test('MapLayer inherits agreed global layer defaults when omitted', () => {
  const layer = normalizeMapLayer({
    title: 'Inherited',
    source: { type: 'heurist-query', query: 't:10' },
    style: {},
    options: {}
  }, { defaults });

  assert.equal(layer.style.symbol.color, '#123456');
  assert.equal(layer.style.symbol.fillColor, '#abcdef');
  assert.deepEqual(layer.style.selectSymbol, { color: '#ff00ff', fillColor: '#ffff00', iconSize: [24, 24], radius: 12 });
  assert.equal(layer.options.markerClustering, true);
  assert.equal(layer.options.maxAllowedFeatures, 500);
  assert.equal(layer.options.dynamicRequests, true);
  assert.equal(layer.options.popupTemplate, 'Title: {{title}}');
  assert.equal(layer.source.limit, 500);
});

test('specific MapLayer settings override global defaults with nullish semantics', () => {
  const layer = normalizeMapLayer({
    source: { type: 'heurist-query', query: 't:10', limit: 250 },
    style: {
      symbol: { color: '#000000' },
      selectSymbol: { color: '#00ff00' }
    },
    options: {
      markerClustering: false,
      maxAllowedFeatures: 2000,
      dynamicRequests: false,
      popupTemplate: 'Specific {{title}}'
    }
  }, { defaults });

  assert.equal(layer.style.symbol.color, '#000000');
  assert.equal(layer.style.selectSymbol.color, '#00ff00');
  assert.equal(layer.options.markerClustering, false);
  assert.equal(layer.options.maxAllowedFeatures, 2000);
  assert.equal(layer.options.dynamicRequests, false);
  assert.equal(layer.options.popupTemplate, 'Specific {{title}}');
  assert.equal(layer.source.limit, 250);
});

test('popupTemplate inherited by a layer reaches the GeoJSON runtime popup definition', () => {
  const layer = normalizeMapLayer({
    source: { type: 'inline-geojson', data: { type: 'FeatureCollection', features: [] } },
    options: {}
  }, { defaults });
  const runtime = createGeoJsonRuntimeLayer(layer, { reference: { id: 'x', order: 1 } }, {
    type: 'FeatureCollection', features: []
  });
  assert.equal(runtime.popup.template, 'Title: {{title}}');
});

test('preventContinuousWorldBasemap applies noWrap to resolved tile basemap', () => {
  const env = createMapEnvironment(normalizeMapDocument({ worldBaseMap: { code: 'OpenStreetMap' } }), {
    preventContinuousWorldBasemap: true
  });
  assert.equal(env.baseMap?.type, 'tile');
  assert.equal(env.baseMap?.noWrap, true);
});

test('reapplying defaults updates inherited values but preserves explicit layer values', async () => {
  const { reapplyMapLayerDefaults } = await import('../../src/core/MapLayer.js');
  const inherited = normalizeMapLayer({
    source: { type: 'heurist-query', query: 't:10' },
    style: {},
    options: {}
  }, { defaults });
  const explicit = normalizeMapLayer({
    source: { type: 'heurist-query', query: 't:10', limit: 42 },
    style: { symbol: { color: '#010203' }, selectSymbol: { color: '#040506' } },
    options: {
      markerClustering: false,
      maxAllowedFeatures: 2000,
      dynamicRequests: false,
      popupTemplate: 'Explicit {{title}}'
    }
  }, { defaults });

  const next = {
    ...defaults,
    symbology: { color: '#999999' },
    selectSymbology: { color: '#888888' },
    markerClustering: false,
    maxAllowedFeatures: 5000,
    dynamicRequests: false,
    popupTemplate: 'Changed {{title}}'
  };

  assert.equal(reapplyMapLayerDefaults(inherited, next), true);
  assert.equal(inherited.style.symbol.color, '#999999');
  assert.equal(inherited.style.selectSymbol.color, '#888888');
  assert.equal(inherited.options.markerClustering, false);
  assert.equal(inherited.options.maxAllowedFeatures, 5000);
  assert.equal(inherited.options.dynamicRequests, false);
  assert.equal(inherited.options.popupTemplate, 'Changed {{title}}');
  assert.equal(inherited.source.limit, 5000);

  assert.equal(reapplyMapLayerDefaults(explicit, next), true);
  assert.equal(explicit.style.symbol.color, '#010203'); // explicit override survives
  assert.equal(explicit.style.symbol.fillColor, '#ff0000'); // inherited parent value is recomputed
  assert.equal(explicit.style.selectSymbol.color, '#040506');
  assert.equal(explicit.options.maxAllowedFeatures, 2000);
  assert.equal(explicit.source.limit, 42);
  assert.equal(explicit.options.popupTemplate, 'Explicit {{title}}');
});
