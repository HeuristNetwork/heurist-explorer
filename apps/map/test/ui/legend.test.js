import test from 'node:test';
import assert from 'node:assert/strict';
import { detectGeometryTypes } from '../../src/utils/geometryTypes.js';
import { readFile } from 'node:fs/promises';

const layerItemSource = await readFile(new URL('../../src/ui/LayerPanelItem.js', import.meta.url), 'utf8');
const loaderSource = await readFile(new URL('../../src/engine/loaders/GeoJsonLayerLoader.js', import.meta.url), 'utf8');
const appSource = await readFile(new URL('../../src/core/MapApplication.js', import.meta.url), 'utf8');
const legendSource = await readFile(new URL('../../src/ui/legend/LegendRenderer.js', import.meta.url), 'utf8');

test('geometry family detection handles mixed GeoJSON and GeometryCollection', () => {
  assert.deepEqual(detectGeometryTypes({
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] } },
      { type: 'Feature', geometry: { type: 'MultiLineString', coordinates: [] } },
      { type: 'Feature', geometry: { type: 'GeometryCollection', geometries: [
        { type: 'Polygon', coordinates: [] }
      ] } }
    ]
  }), { point: true, line: true, polygon: true });
});

test('geometry types are computed once by the loader and retained in lightweight runtime state', () => {
  assert.match(loaderSource, /geometryTypes: detectGeometryTypes\(geoJson\)/);
  assert.match(appSource, /geometryTypes: clonePlain\(definition\.geometryTypes \?\? null\)/);
});

test('thematic selector is hidden until layer data has loaded', () => {
  assert.match(layerItemSource, /this\.layer\?\.loadState !== 'loaded'/);
  assert.match(layerItemSource, /supportsThematicSelection\(this\.layer\)/);
});

test('legend renders current default or active thematic ranges using geometry-aware samples', () => {
  assert.match(legendSource, /activeTheme = thematic\.find/);
  assert.match(legendSource, /mergeThematicSymbol\(activeTheme\.symbol \|\| \{\}, range\?\.symbol \|\| \{\}\)/);
  assert.match(legendSource, /if \(types\.point\)/);
  assert.match(legendSource, /if \(types\.line\)/);
  assert.match(legendSource, /if \(types\.polygon\)/);
});


test('legend size follows circle radius and iconfont classes match map marker conventions', () => {
  assert.match(legendSource, /iconType \|\| 'circle'\) === 'circle'/);
  assert.match(legendSource, /Number\(symbol\?\.radius\) \* 2/);
  assert.match(legendSource, /normalizeIconFontClass/);
  assert.match(legendSource, /`ui-icon \$\{iconClass/);
  assert.match(legendSource, /classes\.unshift\('fa-solid'\)/);
});

test('legend display option and thematic source gating are passed through the control panel', () => {
  assert.match(layerItemSource, /this\.showLegend/);
  assert.match(layerItemSource, /sourceType === 'heurist-query' \|\| sourceType === 'record'/);
});


test('raster sources do not show a symbology legend', () => {
  assert.match(layerItemSource, /supportsSymbologyLegend\(this\.layer\)/);
  assert.match(layerItemSource, /\['image', 'tile', 'iiif', 'geotiff'\]/);
});

test('legend applies fill opacity independently from stroke opacity', () => {
  assert.match(legendSource, /cssColorWithOpacity\(symbol\?\.fillColor/);
  assert.match(legendSource, /symbol\?\.fillOpacity/);
  assert.doesNotMatch(legendSource, /marker\.style\.opacity/);
});
