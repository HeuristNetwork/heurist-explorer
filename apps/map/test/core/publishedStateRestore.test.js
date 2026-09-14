import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MapApplication } from '../../src/core/MapApplication.js';

const source = fs.readFileSync(new URL('../../src/core/MapApplication.js', import.meta.url), 'utf8');

function createApplication({ baseMaps = [] } = {}) {
  return new MapApplication({
    container: { dispatchEvent() {} },
    config: {
      mapDocument: {},
      documents: { initiallyActive: null },
      defaults: {},
      interaction: {},
      dynamicDocument: { enabled: true, id: 'dynamic', title: 'Runtime map', keepContent: true, layers: [] },
      ui: {},
      baseMaps,
      readonly: true
    },
    mapEngine: {
      async initialize() {},
      setInteractionHandlers() {},
      async destroy() {},
      async setBaseMap() {},
      async fitBounds() {},
      async setView() {},
      async setZoomLimits() {},
      getViewState() { return null; },
      getCapabilities() { return {}; }
    },
    host: { async initialize() {}, async destroy() {}, supportsEditing() { return false; } },
    providers: {},
    layerLoaders: { async load() { throw new Error('not used in this test'); } }
  });
}

test('published layer state restores visibility before theme and opacity', () => {
  const start = source.indexOf('async restoreMapState(state = {})');
  assert.ok(start >= 0);
  const visible = source.indexOf('if (Array.isArray(state.visibleLayerIds))', start);
  const themes = source.indexOf("if (state.activeThemes && typeof state.activeThemes === 'object')", start);
  const opacity = source.indexOf("if (state.layerOpacities && typeof state.layerOpacities === 'object')", start);
  assert.ok(visible > start);
  assert.ok(themes > visible);
  assert.ok(opacity > themes);
});

test('default symbology explicitly clears a source thematic map', () => {
  const start = source.indexOf("if (state.activeThemes && typeof state.activeThemes === 'object')");
  const end = source.indexOf("if (state.layerOpacities && typeof state.layerOpacities === 'object')", start);
  const block = source.slice(start, end);
  assert.match(block, /Number\.isInteger\(index\) && index >= 0 \? index : null/);
});

test('explicit MapDocument basemap is registered even outside configured allowed basemaps', async () => {
  // Site config only allows OpenStreetMap, but the document was authored with
  // a different curated basemap.
  const application = createApplication({
    baseMaps: [{ id: 'OpenStreetMap', title: 'OpenStreetMap', type: 'tile', provider: 'OpenStreetMap' }]
  });

  await application.applyDocumentBaseMap({ worldBaseMap: { label: 'Esri.WorldImagery' } });

  assert.equal(application.getActiveBaseMap()?.id, 'Esri.WorldImagery');
  assert.ok(
    application.getBaseMaps().some((item) => item.id === 'Esri.WorldImagery'),
    'document basemap should be registered so the selector reflects what is rendered'
  );
});

test('unrecognized MapDocument basemap falls back to the configured default', async () => {
  const application = createApplication({
    baseMaps: [{ id: 'OpenStreetMap', title: 'OpenStreetMap', type: 'tile', provider: 'OpenStreetMap' }]
  });

  await application.applyDocumentBaseMap({ worldBaseMap: { label: 'Not.A.Real.Basemap' } });

  assert.equal(application.getActiveBaseMap()?.id, 'OpenStreetMap');
});

test('published theme and opacity state resolve serialized layer ids to runtime keys', () => {
  const start = source.indexOf('async restoreMapState(state = {})');
  const themes = source.indexOf("if (state.activeThemes && typeof state.activeThemes === 'object')", start);
  const opacity = source.indexOf("if (state.layerOpacities && typeof state.layerOpacities === 'object')", themes);
  const basemap = source.indexOf('// Restore the published basemap', opacity);
  const themeBlock = source.slice(themes, opacity);
  const opacityBlock = source.slice(opacity, basemap);

  assert.match(themeBlock, /const runtimeLayerId = this\.findRuntimeLayerKey\(layerId\)/);
  assert.match(themeBlock, /this\.layers\.has\(runtimeLayerId\)/);
  assert.match(themeBlock, /setLayerTheme\(runtimeLayerId,/);
  assert.match(opacityBlock, /const runtimeLayerId = this\.findRuntimeLayerKey\(layerId\)/);
  assert.match(opacityBlock, /this\.layers\.has\(runtimeLayerId\)/);
  assert.match(opacityBlock, /setLayerOpacity\(runtimeLayerId, opacity\)/);
});
