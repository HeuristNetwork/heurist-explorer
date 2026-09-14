import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeMapDocument } from '../../src/core/MapDocument.js';

test('MapDocument without a basemap no longer hardcodes OpenStreetMap', () => {
  const document = normalizeMapDocument({});
  assert.equal(document.worldBaseMap, null);
  assert.equal(normalizeMapDocument({ worldBaseMap: 'None' }).worldBaseMap.code, 'None');
  assert.equal(normalizeMapDocument({ worldBaseMap: 'Esri.WorldImagery' }).worldBaseMap.code, 'Esri.WorldImagery');
});

test('published state captures opacity and restores basemap after document activation', () => {
  const source = fs.readFileSync(new URL('../../src/core/MapApplication.js', import.meta.url), 'utf8');
  assert.match(source, /layerOpacities:\s*Object\.fromEntries/);
  assert.match(source, /state\.layerOpacities.*setLayerOpacity/s);
  const activation = source.indexOf('const targetDocument = state.activeDocumentId');
  const restoreBasemap = source.indexOf('if (state.baseMap != null', activation);
  assert.ok(activation >= 0 && restoreBasemap > activation);
});

test('runtime map initialization falls back to configured initial basemap when document has none', () => {
  const source = fs.readFileSync(new URL('../../src/core/MapApplication.js', import.meta.url), 'utf8');
  assert.match(source, /environment\.baseMapSpecified\s*\?\s*environment\.baseMap\s*:\s*this\.getConfiguredDefaultBaseMap\(\)/s);
});
