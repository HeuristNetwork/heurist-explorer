import test from 'node:test';
import assert from 'node:assert/strict';
import { getHeuristMapConfig, applyPersistedSettings } from '../../src/mapConfig.js';
import { HeuristHostAdapter } from '../../src/host/HeuristHostAdapter.js';

function response(data = true) {
  return Promise.resolve({
    ok: true,
    json: async () => ({ status: 'ok', data })
  });
}

test('direct iframe bridge supplies the reduced bootstrap contract', () => {
  const previousFrameElement = globalThis.frameElement;
  const previousLocation = globalThis.location;
  globalThis.location = { href: 'http://localhost/heurist-map/' };
  globalThis.frameElement = {
    heuristMapHost: {
      getConfiguration() {
        return {
          runtime: {
            database: 'osmak_mapping',
            apiBaseUrl: '/heurist/api',
            baseUrl: '/heurist/'
          },
          settings: {
            format: 'heurist-map-settings',
            version: 1,
            options: {
              ui: { showBaseMaps: false },
              mapDocuments: { initiallyActive: null }
            },
            config: {
              dynamicDocument: { title: 'Saved preference title' }
            }
          },
          state: { zoom: 9 }
        };
      },
      updateSettings() {}
    }
  };

  try {
    const config = getHeuristMapConfig();
    assert.equal(config.database, 'osmak_mapping');
    assert.equal(config.apiBaseUrl, '/heurist/api');
    assert.equal(config.ui.showBaseMaps, false);
    assert.equal(config.dynamicDocument.title, 'Saved preference title');
    assert.equal(config.documents.initiallyActive, 'dynamic');
    assert.deepEqual(config.initialState, { zoom: 9 });
    assert.equal(config.host.type, 'heurist');
    assert.equal(config.host.baseUrl, '/heurist/');
    assert.equal(config.host.database, 'osmak_mapping');
    assert.equal(config.host.bridge, globalThis.frameElement.heuristMapHost);
  } finally {
    globalThis.frameElement = previousFrameElement;
    globalThis.location = previousLocation;
  }
});

test('minimal standalone bootstrap uses canonical settings and built-in basemaps', () => {
  const previousFrameElement = globalThis.frameElement;
  const previousBootstrap = globalThis.heuristModuleBootstrap;
  const previousLocation = globalThis.location;
  globalThis.frameElement = null;
  globalThis.location = { href: 'http://localhost/heurist-map/' };
  globalThis.heuristModuleBootstrap = {
    runtime: {
      database: 'demo',
      apiBaseUrl: '/heurist/api',
      baseUrl: '/heurist/'
    }
  };

  try {
    const config = getHeuristMapConfig();
    assert.equal(config.persistedSettings.options.ui.enabled, true);
    assert.equal(config.persistedSettings.options.mapDocuments.allowed, null);
    assert.equal(config.documents.initiallyActive, 'dynamic');
    assert.deepEqual(config.baseMaps.map((item) => item.id), [
      'OpenStreetMap', 'OpenTopoMap', 'Esri.WorldStreetMap', 'Esri.WorldTopoMap',
      'Esri.WorldImagery', 'Esri.WorldShadedRelief', 'Stadia.StamenToner', 'Stadia.StamenTonerLite',
      'Stadia.StamenTerrain', 'Stadia.StamenTerrainBackground', 'Stadia.StamenWatercolor',
      'Esri.NatGeoWorldMap', 'Esri.WorldGrayCanvas', 'MapTilesAPI.OSMEnglish',
      'DARE.RomanEmpire', 'GeoportailFrance.plan', 'GeoportailFrance.parcels',
      'GeoportailFrance.orthos', 'None'
    ]);
    assert.equal(config.mapDocument.id, null);
  } finally {
    globalThis.frameElement = previousFrameElement;
    globalThis.heuristModuleBootstrap = previousBootstrap;
    globalThis.location = previousLocation;
  }
});

test('runtime cannot inject custom basemap catalog or UI settings', () => {
  const previousFrameElement = globalThis.frameElement;
  const previousBootstrap = globalThis.heuristModuleBootstrap;
  const previousLocation = globalThis.location;
  globalThis.frameElement = null;
  globalThis.location = { href: 'http://localhost/heurist-map/' };
  globalThis.heuristModuleBootstrap = {
    runtime: {
      database: 'demo',
      apiBaseUrl: '/heurist/api',
      baseMaps: { available: [{ id: 'Injected', title: 'Injected', type: 'none' }] },
      uiRuntime: { showBaseMaps: false }
    },
    settings: {
      options: {
        ui: { showBaseMaps: true },
        baseMaps: { allowed: ['None'] }
      }
    }
  };

  try {
    const config = getHeuristMapConfig();
    assert.equal(config.ui.showBaseMaps, true);
    assert.deepEqual(config.baseMaps.map((item) => item.id), ['None']);
  } finally {
    globalThis.frameElement = previousFrameElement;
    globalThis.heuristModuleBootstrap = previousBootstrap;
    globalThis.location = previousLocation;
  }
});

test('standalone bootstrap resolves the canonical {runtime, settings, state} contract', () => {
  // Published pages now convert their stored payload into this canonical shape
  // server-side (see docs/integration.md §4.3) before loading heurist-map, so
  // the client only needs to support {runtime, settings, state} directly.
  const previousBootstrap = globalThis.heuristModuleBootstrap;
  globalThis.heuristModuleBootstrap = {
    runtime: { database: 'my_database', apiBaseUrl: '/heurist/api' },
    settings: { options: { ui: { initiallyExpanded: false } } },
    state: { activeDocumentId: 14 }
  };

  try {
    const config = getHeuristMapConfig();
    assert.equal(config.database, 'my_database');
    assert.equal(config.apiBaseUrl, '/heurist/api');
    assert.equal(config.ui.initiallyExpanded, false);
    assert.deepEqual(config.initialState, { activeDocumentId: 14 });
  } finally {
    globalThis.heuristModuleBootstrap = previousBootstrap;
  }
});

test('standalone bootstrap does not crash when window.heuristModuleBootstrap is unset', () => {
  const previousBootstrap = globalThis.heuristModuleBootstrap;
  delete globalThis.heuristModuleBootstrap;

  try {
    assert.doesNotThrow(() => getHeuristMapConfig());
    const config = getHeuristMapConfig();
    assert.equal(config.viewerMode, 'map');
    assert.equal(config.apiBaseUrl, null);
  } finally {
    globalThis.heuristModuleBootstrap = previousBootstrap;
  }
});

test('saving preferences updates the parent-owned bootstrap through the direct bridge', async () => {
  let updated = null;
  const adapter = new HeuristHostAdapter({
    baseUrl: 'http://localhost/heurist/',
    database: 'osmak_mapping',
    bridge: { updateSettings(settings) { updated = settings; } },
    fetchImpl: () => response(true)
  });
  const settings = {
    format: 'heurist-map-settings',
    version: 1,
    options: { ui: { showBaseMaps: false } },
    config: { dynamicDocument: { title: 'Updated' } }
  };

  await adapter.savePreferences(settings);
  assert.deepEqual(updated, settings);
});


test('loadPreferencesOnInit is set when a host (e.g. heurist-explorer) supplies no settings at all', () => {
  const previousFrameElement = globalThis.frameElement;
  const previousLocation = globalThis.location;
  globalThis.location = { href: 'http://localhost/heurist-map/' };
  globalThis.frameElement = {
    heuristMapHost: {
      // Mirrors IframeModuleAdapter._bootstrap() before it loaded any
      // persisted preference: runtime only, settings entirely empty.
      getConfiguration() {
        return {
          runtime: { database: 'osmak_mapping', apiBaseUrl: '/heurist/api', runtimeMode: 'main' },
          settings: {},
          state: null
        };
      },
      getHostContext() { return { name: 'heurist-explorer', runtimeMode: 'main' }; },
      updateSettings() {}
    }
  };

  try {
    const config = getHeuristMapConfig();
    assert.equal(config.loadPreferencesOnInit, true);
  } finally {
    globalThis.frameElement = previousFrameElement;
    globalThis.location = previousLocation;
  }
});

test('loadPreferencesOnInit is false once the bootstrap already carries real settings', () => {
  const previousFrameElement = globalThis.frameElement;
  const previousLocation = globalThis.location;
  globalThis.location = { href: 'http://localhost/heurist-map/' };
  globalThis.frameElement = {
    heuristMapHost: {
      getConfiguration() {
        return {
          runtime: { database: 'osmak_mapping', apiBaseUrl: '/heurist/api', runtimeMode: 'main' },
          settings: { format: 'heurist-map-settings', version: 1, options: {}, config: {} },
          state: null
        };
      },
      updateSettings() {}
    }
  };

  try {
    const config = getHeuristMapConfig();
    assert.equal(config.loadPreferencesOnInit, false);
  } finally {
    globalThis.frameElement = previousFrameElement;
    globalThis.location = previousLocation;
  }
});

test('loadPreferencesOnInit stays false for website/publication runtime modes even with empty settings', () => {
  const previousFrameElement = globalThis.frameElement;
  const previousLocation = globalThis.location;
  globalThis.location = { href: 'http://localhost/heurist-map/' };

  for (const runtimeMode of ['website', 'standalone']) {
    globalThis.frameElement = {
      heuristMapHost: {
        getConfiguration() {
          return { runtime: { database: 'demo', apiBaseUrl: '/heurist/api', runtimeMode }, settings: {}, state: null };
        },
        updateSettings() {}
      }
    };
    try {
      const config = getHeuristMapConfig();
      assert.equal(config.loadPreferencesOnInit, false, `runtimeMode ${runtimeMode}`);
    } finally {
      globalThis.frameElement = previousFrameElement;
    }
  }
  globalThis.location = previousLocation;
});

test('applyPersistedSettings re-derives documents/defaults/ui from a freshly fetched preference', () => {
  const previousFrameElement = globalThis.frameElement;
  const previousLocation = globalThis.location;
  globalThis.location = { href: 'http://localhost/heurist-map/' };
  globalThis.frameElement = {
    heuristMapHost: {
      getConfiguration() {
        return { runtime: { database: 'osmak_mapping', apiBaseUrl: '/heurist/api', runtimeMode: 'main' }, settings: {}, state: null };
      },
      updateSettings() {}
    }
  };

  try {
    const bootConfig = getHeuristMapConfig();
    assert.equal(bootConfig.loadPreferencesOnInit, true);
    assert.equal(bootConfig.defaults.popupTemplate, null);
    assert.equal(bootConfig.ui.showBaseMaps, true);

    // initHeuristMap() would call this with the value from host.loadPreferences().
    const merged = applyPersistedSettings(bootConfig, {
      format: 'heurist-map-settings',
      version: 1,
      options: {
        ui: { showBaseMaps: false },
        mapDocuments: { initiallyActive: 123 }
      },
      config: { defaults: { popupTemplate: 'minimal' } }
    });

    assert.equal(merged.defaults.popupTemplate, 'minimal');
    assert.equal(merged.ui.showBaseMaps, false);
    assert.equal(merged.documents.initiallyActive, 123);
    // Fields untouched by the settings envelope survive the merge.
    assert.equal(merged.database, 'osmak_mapping');
    assert.equal(merged.apiBaseUrl, '/heurist/api');
  } finally {
    globalThis.frameElement = previousFrameElement;
    globalThis.location = previousLocation;
  }
});

test('HeuristHostAdapter delegates record editing to the parent bridge', async () => {
  const edited = [];
  const adapter = new HeuristHostAdapter({
    bridge: {
      editRecord(recordId) {
        edited.push(recordId);
        return Promise.resolve({ saved: true, recordId });
      }
    }
  });

  assert.equal(adapter.supportsEditing(), true);
  assert.deepEqual(await adapter.editRecord(77), { saved: true, recordId: 77 });
  assert.deepEqual(edited, [77]);
});
