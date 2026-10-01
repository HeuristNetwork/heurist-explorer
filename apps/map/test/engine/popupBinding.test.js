import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../../src/engine/LeafletMapAdapter.js', import.meta.url), 'utf8');

test('LeafletMapAdapter opens one map popup with fresh content instead of binding it to the feature', () => {
  assert.match(source, /openFeaturePopup\(layerId, featureId, content, \{ latlng = null \} = \{\}\)/);
  assert.match(source, /L\.popup\(\{/);
  assert.match(source, /\.setContent\(content\)\.openOn\(this\.map\)/);
  // a popup bound to a feature would be reopened with stale content on the next click
  assert.doesNotMatch(source, /\.bindPopup\(/);
});

test('LeafletMapAdapter finds features drawn at the same spot across visible layers', () => {
  assert.match(source, /getCoincidentFeatures\(layerId, featureId, \{ tolerance = 3 \} = \{\}\)/);
  assert.match(source, /latLngToContainerPoint\(latlng\)\.distanceTo\(origin\) <= tolerance/);
  // spiderfied cluster markers are compared by their data position
  assert.match(source, /layer\._preSpiderfyLatlng \|\| layer\.getLatLng\(\)/);
});
