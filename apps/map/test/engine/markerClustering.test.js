import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeMapLayer } from '../../src/core/MapLayer.js';
import { createGeoJsonRuntimeLayer } from '../../src/engine/loaders/GeoJsonLayerLoader.js';

test('markerClustering is preserved from MapLayer normalization to runtime layer', () => {
  const mapLayer = normalizeMapLayer({
    id: 123,
    source: { type: 'inline-geojson', data: { type: 'FeatureCollection', features: [] } },
    options: { markerClustering: true, markerClusterGridPixels: 35 }
  });
  const runtime = createGeoJsonRuntimeLayer(
    mapLayer,
    { reference: { id: 'clustered', order: 0 } },
    { type: 'FeatureCollection', features: [] }
  );

  assert.equal(mapLayer.options.markerClustering, true);
  assert.equal(runtime.options.markerClustering, true);
  assert.equal(mapLayer.options.markerClusterGridPixels, 35);
  assert.equal(runtime.options.markerClusterGridPixels, 35);
});

test('Leaflet.markercluster is declared and loaded by the application entry point', () => {
  const pkg = JSON.parse(fs.readFileSync(new URL('../../../../package.json', import.meta.url), 'utf8'));
  const main = fs.readFileSync(new URL('../../src/main.js', import.meta.url), 'utf8');

  assert.match(pkg.dependencies['leaflet.markercluster'], /^\^1\.5\.3$/);
  assert.match(main, /import L from 'leaflet';/);
  assert.match(main, /window\.L = L;/);
  assert.match(main, /import\('leaflet\.markercluster'\)/);
  assert.ok(main.indexOf('window.L = L;') < main.indexOf("import('leaflet.markercluster')"));
  assert.match(main, /MarkerCluster\.css/);
  assert.match(main, /MarkerCluster\.Default\.css/);
});

test('Leaflet adapter enables clustering with chunked bulk loading', () => {
  const adapter = fs.readFileSync(new URL('../../src/engine/LeafletMapAdapter.js', import.meta.url), 'utf8');

  assert.match(adapter, /L\.markerClusterGroup\(\{[\s\S]*chunkedLoading:\s*true/);
  assert.match(adapter, /clusterLayer\.addLayers\(geoJsonLayer\.getLayers\(\)\)/);
  assert.match(adapter, /createPointLayerFactory\(resolveSymbol, \{[\s\S]*markerClustering,[\s\S]*iconContext: definition\.iconContext,[\s\S]*paneName[\s\S]*\}\)/);
  assert.match(adapter, /maxClusterRadius:\s*finiteNonNegativeNumber\(gridPixels, 20\)/);
});
