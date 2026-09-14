import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeMapConfigurationSettings,
  serializeMapConfigurationSettings
} from '../../src/ui/config/mapConfigurationSchema.js';
import {
  CONFIGURATION_FORMAT,
  CONFIGURATION_VERSION
} from '../../src/ui/config/configurationUtils.js';
import { createMapConfigurationDefaults } from '../../src/ui/config/mapConfigurationDefaults.js';
import { MapConfigurationDialog } from '../../src/ui/config/MapConfigurationDialog.js';
import { normalizeMapLayer } from '../../src/core/MapLayer.js';

test('map configuration defaults contain agreed global fallback settings', () => {
  const value = createMapConfigurationDefaults();
  assert.equal(value.config.defaults.maxAllowedFeatures, 1000);
  assert.equal(value.config.defaults.dynamicRequests, undefined);
  assert.equal(value.config.dynamicDocument.dynamicRequests, false);
  assert.equal(value.config.defaults.markerClustering, false);
  assert.equal(value.config.defaults.preventContinuousWorldBasemap, false);
  assert.equal(value.config.defaults.symbology, null);
  assert.equal(value.options.mapDocuments.initiallyActive, null);
  assert.equal(value.config.dynamicDocument.enabled, true);
  assert.equal(value.config.currentResultsLayer, undefined);
  assert.equal(value.config.dynamicDocument.initiallyActive, undefined);
  assert.equal(value.options.ui.controlCss, null);
  assert.equal(value.options.ui.showHomeControl, false);
  assert.equal(value.options.ui.showOptions, true);
  assert.equal(value.options.ui.showSourceHeader, false);
  assert.deepEqual(value.options.nativeControls, {
    zoom: true, scale: true, bookmark: false, print: false, selector: false, search: false
  });
  assert.equal(value.options.interaction.zoomOnSelection, false);
});

test('configuration normalization strips runtime, obsolete, and unknown properties', () => {
  const value = normalizeMapConfigurationSettings({
    options: {
      database: 'secret-db',
      accessToken: 'secret',
      ui: { enabled: false, showLegend: false, unknown: 1 },
      interaction: { selectionEnabled: false }
    },
    config: {
      defaults: { maxAllowedFeatures: 2500, dynamicRequests: true, unknown: 1 },
      dynamicDocument: { title: 'Search', id: 'do-not-persist', initiallyActive: true },
      currentResultsLayer: { options: { maxAllowedFeatures: 500 } }
    },
    callbacks: { onSave() {} }
  });

  assert.equal(value.options.database, undefined);
  assert.equal(value.options.accessToken, undefined);
  assert.equal(value.options.ui.unknown, undefined);
  assert.equal(value.options.ui.enabled, false);
  assert.equal(value.options.ui.showLegend, false);
  assert.equal(value.options.interaction.selectionEnabled, false);
  assert.equal(value.config.dynamicDocument.id, undefined);
  assert.equal(value.config.dynamicDocument.initiallyActive, undefined);
  assert.equal(value.config.dynamicDocument.title, 'Search');
  assert.equal(value.config.currentResultsLayer, undefined);
  assert.equal(value.config.defaults.unknown, undefined);
  assert.equal(value.config.defaults.maxAllowedFeatures, 1000);
  assert.equal(value.config.defaults.dynamicRequests, undefined);
  assert.equal(value.config.dynamicDocument.dynamicRequests, true, 'legacy global value is migrated');
});


test('native control settings normalize independently and migrate the first draft UI flags', () => {
  const direct = normalizeMapConfigurationSettings({
    options: {
      nativeControls: { zoom: false, scale: false, bookmark: true, print: true, selector: true, search: true }
    }
  });
  assert.deepEqual(direct.options.nativeControls, {
    zoom: false,
    scale: false,
    bookmark: true,
    print: true,
    selector: false,
    search: true
  });

  const migrated = normalizeMapConfigurationSettings({
    options: { ui: { showZoomControl: false, showSearch: true } }
  });
  assert.equal(migrated.options.nativeControls.zoom, false);
  assert.equal(migrated.options.nativeControls.search, true);
  assert.equal(migrated.options.ui.showZoomControl, undefined);
  assert.equal(migrated.options.ui.showSearch, undefined);
});

test('dynamic document zoom settings remain document-specific; global defaults normalize independently', () => {
  const value = normalizeMapConfigurationSettings({
    config: {
      defaults: {
        zoomToPointInKM: 5,
        selectSymbology: { color: '#f00' },
        preventContinuousWorldBasemap: true
      },
      dynamicDocument: { minZoom: 0, maxZoom: 18, minimumZoomKm: null, maximumZoomKm: null }
    }
  });
  assert.equal(value.config.dynamicDocument.minZoom, 0);
  assert.equal(value.config.dynamicDocument.maxZoom, 18);
  assert.equal(value.config.dynamicDocument.minimumZoomKm, null);
  assert.equal(value.config.dynamicDocument.maximumZoomKm, null);
  assert.equal(value.config.defaults.zoomToPointInKM, 5);
  assert.deepEqual(value.config.defaults.selectSymbology, { color: '#f00' });
  assert.equal(value.config.defaults.preventContinuousWorldBasemap, true);
});

test('configuration serializer creates versioned settings envelope', () => {
  const value = serializeMapConfigurationSettings({
    options: { baseMaps: { allowed: ['OpenStreetMap', 'None'], initial: 'None' } }
  });
  assert.equal(value.format, CONFIGURATION_FORMAT);
  assert.equal(value.version, CONFIGURATION_VERSION);
  assert.deepEqual(value.options.baseMaps.allowed, ['OpenStreetMap', 'None']);
  assert.equal(value.options.baseMaps.initial, 'None');
});

test('configuration dialog can be used as a persistence-neutral value object before opening', () => {
  const dialog = new MapConfigurationDialog({
    mode: 'website',
    value: {
      options: { mapDocuments: { allowed: [12, 14] } },
      config: { defaults: { maxAllowedFeatures: 500 } }
    }
  });
  const value = dialog.getValue();
  assert.deepEqual(value.options.mapDocuments.allowed, [12, 14]);
  assert.equal(value.config.defaults.maxAllowedFeatures, 500);
  assert.equal(dialog.mode, 'website');
  assert.equal(dialog.serialize().format, 'heurist-map-settings');
});

test('website configuration starts with unsuitable controls switched off', () => {
  const dialog = new MapConfigurationDialog({
    mode: 'website',
    value: {
      options: {
        ui: { showBaseMaps: true, showOptions: true, showPublish: true },
        nativeControls: { bookmark: true, print: true }
      }
    }
  });
  const value = dialog.getValue();
  assert.equal(value.options.ui.showBaseMaps, false);
  assert.equal(value.options.ui.showOptions, false);
  assert.equal(value.options.ui.showPublish, false);
  assert.equal(value.options.nativeControls.bookmark, false);
  assert.equal(value.options.nativeControls.print, false);

  dialog.setValue({
    options: {
      ui: { showBaseMaps: true, showOptions: true, showPublish: true },
      nativeControls: { bookmark: true, print: true }
    }
  });
  const reset = dialog.getValue();
  assert.equal(reset.options.ui.showBaseMaps, false);
  assert.equal(reset.options.ui.showOptions, false);
  assert.equal(reset.options.ui.showPublish, false);
  assert.equal(reset.options.nativeControls.bookmark, false);
  assert.equal(reset.options.nativeControls.print, false);
});

test('configuration zoom limits are restricted to Leaflet 0-22 range', () => {
  const value = normalizeMapConfigurationSettings({
    config: { dynamicDocument: { minZoom: -1, maxZoom: 23 } }
  });
  assert.equal(value.config.dynamicDocument.minZoom, null);
  assert.equal(value.config.dynamicDocument.maxZoom, null);
});

test('maximum allowed features accepts only configured choices', () => {
  for (const limit of [500, 1000, 2000, 5000]) {
    const value = normalizeMapConfigurationSettings({ config: { defaults: { maxAllowedFeatures: limit } } });
    assert.equal(value.config.defaults.maxAllowedFeatures, limit);
  }
});


test('dynamic requests are not inherited by ordinary MapLayers from global defaults', () => {
  const layer = normalizeMapLayer({
    source: { type: 'heurist-query', query: 't:12' },
    options: {}
  }, { defaults: createMapConfigurationDefaults().config.defaults });
  assert.equal(layer.options.dynamicRequests, false);

  const explicit = normalizeMapLayer({
    source: { type: 'heurist-query', query: 't:12' },
    options: { dynamicRequests: true }
  }, { defaults: createMapConfigurationDefaults().config.defaults });
  assert.equal(explicit.options.dynamicRequests, true);
});
