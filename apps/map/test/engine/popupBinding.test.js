import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../../src/engine/LeafletMapAdapter.js', import.meta.url), 'utf8');

test('LeafletMapAdapter implements lazy feature popup binding/reopening', () => {
  assert.match(source, /async openFeaturePopup\(layerId, featureId, html = null\)/);
  assert.match(source, /nativeLayer\.bindPopup\(String\(html\)\)/);
  assert.match(source, /nativeLayer\.getPopup\(\)/);
  assert.match(source, /nativeLayer\.openPopup\(\)/);
});
