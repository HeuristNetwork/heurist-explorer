import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeMapConfigurationSettings } from '../../src/ui/config/mapConfigurationSchema.js';
import { createMapConfigurationDefaults } from '../../src/ui/config/mapConfigurationDefaults.js';

test('marker cluster grid pixels defaults to 20 and clamps to 0-100', () => {
  const defaults = createMapConfigurationDefaults();
  assert.equal(defaults.config.defaults.markerClusterGridPixels, 20);
  assert.equal(normalizeMapConfigurationSettings({ config: { defaults: { markerClusterGridPixels: 150 } } }).config.defaults.markerClusterGridPixels, 100);
  assert.equal(normalizeMapConfigurationSettings({ config: { defaults: { markerClusterGridPixels: -5 } } }).config.defaults.markerClusterGridPixels, 0);
});

test('panel hides current-results edit action and substitutes feature count for Vector placeholder', () => {
  const source = fs.readFileSync(new URL('../../src/ui/LayerPanelItem.js', import.meta.url), 'utf8');
  assert.match(source, /!isCurrentResults.*editingEnabled/s);
  assert.match(source, /toLowerCase\(\) === '\[vector\]'.*formatCount\(features\).*features/s);
});

test('published map state captures and restores active themes', () => {
  const source = fs.readFileSync(new URL('../../src/core/MapApplication.js', import.meta.url), 'utf8');
  assert.match(source, /activeThemes:\s*Object\.fromEntries/);
  assert.match(source, /state\.activeThemes.*setLayerTheme/s);
});

test('url and rectype point icons share the image marker path', () => {
  const source = fs.readFileSync(new URL('../../src/engine/LeafletMapAdapter.js', import.meta.url), 'utf8');
  assert.match(source, /resolveImageMarkerUrl\(symbol, feature, iconContext\)/);
  assert.match(source, /type === 'url'.*symbol\.iconUrl/s);
  assert.match(source, /type !== 'rectype'/);
  assert.match(source, /searchParams\.set\('icon', String\(recordTypeId\)\)/);
  assert.match(source, /createImageMarkerIcon\(symbol, imageUrl\)/);
  assert.match(source, /hexToCssFilter\(symbol\.color\)/);
});

test('ordinary legend omits Default label when there are no thematic maps', () => {
  const source = fs.readFileSync(new URL('../../src/ui/legend/LegendRenderer.js', import.meta.url), 'utf8');
  assert.match(source, /label:\s*thematic\.length \? \$HR\('Default'\) : ''/);
});

test('url and rectype icon types survive symbol normalization', async () => {
  const { normalizeMapSymbol, normalizeMapSymbolOverride } = await import('../../src/utils/normalizeMapSymbol.js');
  const url = normalizeMapSymbol({ iconType: 'url', iconUrl: 'http://example.test/icon.png', iconSize: '18' });
  assert.equal(url.iconType, 'url');
  assert.equal(url.iconUrl, 'http://example.test/icon.png');
  assert.deepEqual(url.iconSize, [18, 18]);

  const rectype = normalizeMapSymbol({ iconType: 'rectype', iconSize: 20 });
  assert.equal(rectype.iconType, 'rectype');
  assert.deepEqual(rectype.iconSize, [20, 20]);

  const thematic = normalizeMapSymbolOverride({ iconType: 'url', iconUrl: '/icon/10', iconSize: 11 });
  assert.equal(thematic.iconType, 'url');
  assert.equal(thematic.iconUrl, '/icon/10');
  assert.deepEqual(thematic.iconSize, [11, 11]);
});

test('legend and theme blocks always occupy their own wrapped panel row', () => {
  const css = fs.readFileSync(new URL('../../src/style.css', import.meta.url), 'utf8');
  assert.match(css, /\.heurist-map-layer-themes\{flex:0 0 calc\(100% - 20px\)/);
  assert.match(css, /\.heurist-map-layer-legend\{flex:0 0 calc\(100% - 20px\)/);
});

test('marker clustering falls back to configured defaults only when layer value is absent', async () => {
  const { normalizeMapLayer } = await import('../../src/core/MapLayer.js');
  const inherited = normalizeMapLayer({ source: { type: 'heurist-query' }, options: {} }, {
    defaults: { markerClustering: true, markerClusterGridPixels: 37 }
  });
  assert.equal(inherited.options.markerClustering, true);
  assert.equal(inherited.options.markerClusterGridPixels, 37);

  const explicitFalse = normalizeMapLayer({ source: { type: 'heurist-query' }, options: { markerClustering: false } }, {
    defaults: { markerClustering: true, markerClusterGridPixels: 37 }
  });
  assert.equal(explicitFalse.options.markerClustering, false);
});


test('image marker icons do not pass null Leaflet anchors', () => {
  const source = fs.readFileSync(new URL('../../src/engine/LeafletMapAdapter.js', import.meta.url), 'utf8');
  assert.match(source, /const iconAnchor = leafletPointOption\(symbol\.iconAnchor\)/);
  assert.match(source, /const popupAnchor = leafletPointOption\(symbol\.popupAnchor\)/);
  assert.match(source, /if \(value == null\) return undefined/);
  assert.doesNotMatch(source, /popupAnchor: symbol\.popupAnchor/);
});


test('non-circle marker renderers ignore vector fill background styling', () => {
  const source = fs.readFileSync(new URL('../../src/engine/LeafletMapAdapter.js', import.meta.url), 'utf8');
  assert.match(source, /createImageMarkerIcon\(symbol, imageUrl\)/);
  assert.match(source, /createIconFontIcon\(symbol\)/);
  assert.match(source, /heurist-map-iconfont-marker[\s\S]*background:none/);
  assert.doesNotMatch(source, /const backgroundStyle = symbol\.fill && symbol\.fillColor/);
});

test('operational layers use stable per-layer panes ordered independently of load timing', () => {
  const source = fs.readFileSync(new URL('../../src/engine/LeafletMapAdapter.js', import.meta.url), 'utf8');
  assert.match(source, /createPane\('heurist-map-operational-layers'\)/);
  assert.match(source, /ensureOperationalLayerPane\(definition\)/);
  assert.match(source, /pane:\s*paneName/);
  assert.match(source, /refreshOperationalLayerOrder\(\)/);
  assert.match(source, /Number\(a\.definition\?\.order \|\| 0\) - Number\(b\.definition\?\.order \|\| 0\)/);
});

test('deselection restores normal SVG feature order after bringToFront selection', () => {
  const source = fs.readFileSync(new URL('../../src/engine/LeafletMapAdapter.js', import.meta.url), 'utf8');
  assert.match(source, /if \(pathOrderChanged\) \{\s*restoreNativeLayerOrder\(entry\.layer\)/s);
  assert.match(source, /function restoreNativeLayerOrder\(layer\)/);
  assert.match(source, /function bringNativeFeatureToFront\(layer\)/);
});
