import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const appSource = fs.readFileSync(new URL('../../src/core/MapApplication.js', import.meta.url), 'utf8');
const engineSource = fs.readFileSync(new URL('../../src/engine/LeafletMapAdapter.js', import.meta.url), 'utf8');
const loaderSource = fs.readFileSync(new URL('../../src/engine/loaders/GeoJsonLayerLoader.js', import.meta.url), 'utf8');
const publicApiSource = fs.readFileSync(new URL('../../src/host/HeuristMapPublicApi.js', import.meta.url), 'utf8');

test('theme switching updates style and redraws existing native layer data', () => {
  assert.match(appSource, /async setLayerTheme\(layerId, themeIndex = null\)/);
  assert.match(appSource, /activateThematicMap\(sourceStyle, themeIndex\)/);
  assert.match(appSource, /mapEngine\.setLayerStyle\(layerId, nextStyle\)/);
  assert.match(appSource, /heurist-map-layer-style-changed/);
  assert.match(engineSource, /async setLayerStyle\(layerId, style\)/);
  assert.match(engineSource, /\.\.\.entry\.definition/);
  assert.match(engineSource, /selectedFeatureIds/);
});

test('GeoJSON thematic enrichment requests fields for all configured themes', () => {
  assert.match(loaderSource, /getAllThematicFieldCodes/);
  assert.doesNotMatch(loaderSource, /getActiveThematicMap/);
});


test('public API forwards thematic switching to MapApplication', () => {
  assert.match(publicApiSource, /setLayerTheme\(layerId, themeIndex = null\).*application\.setLayerTheme\(layerId, themeIndex\)/s);
});
