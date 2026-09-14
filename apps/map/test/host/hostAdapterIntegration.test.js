import test from 'node:test';
import assert from 'node:assert/strict';

import { HeuristHostAdapter } from '../../src/host/HeuristHostAdapter.js';
import { createHostAdapter } from '../../src/host/createHostAdapter.js';
import { HeuristMapConfigurationApi } from '../../src/host/HeuristMapConfigurationApi.js';
import { MapConfigurationDialog } from '../../src/ui/config/MapConfigurationDialog.js';

test('Heurist host adapter uses keyed preference FrontController contract', async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return {
      ok: true,
      json: async () => ({ status: 0, data: { format: 'heurist-map-settings', version: 1 } })
    };
  };
  const host = new HeuristHostAdapter({
    baseUrl: 'http://example.test/heurist/', database: 'demo', fetchImpl
  });

  await host.loadPreferences();
  await host.savePreferences({ format: 'heurist-map-settings', version: 1 });

  assert.match(calls[0].url, /controller=UserController/);
  assert.match(calls[0].url, /action=get_prefs/);
  assert.match(calls[0].url, /key=heurist-map/);
  assert.equal(calls[1].init.method, 'POST');
  assert.match(calls[1].init.body, /key=heurist-map/);
  assert.match(calls[1].init.body, /value=/);
});

test('host factory creates HeuristHostAdapter for declarative host config', () => {
  const host = createHostAdapter({ type: 'heurist', baseUrl: '/heurist/', database: 'demo', fetchImpl: async () => {} });
  assert.ok(host instanceof HeuristHostAdapter);
  assert.deepEqual(host.getCapabilities(), { mapPreferences: true, mapPublishing: true });
});

test('configuration-only API exposes schema operations without MapApplication', () => {
  const api = new HeuristMapConfigurationApi();
  const defaults = api.getConfigurationDefaults();
  assert.equal(defaults.config.defaults.maxAllowedFeatures, 1000);
  assert.equal(defaults.config.defaults.dynamicRequests, undefined);
  assert.equal(defaults.config.dynamicDocument.dynamicRequests, false);
  const serialized = api.serializeConfiguration({ options: {}, config: {} });
  assert.equal(serialized.format, 'heurist-map-settings');
  assert.equal(serialized.version, 1);
  assert.equal(typeof api.applyConfiguration, 'undefined',
    'configuration-only API must not expose live MapApplication configuration');
});



test('Heurist host adapter parses persisted map preference JSON strings', async () => {
  const stored = {
    format: 'heurist-map-settings',
    version: 1,
    options: {
      ui: { enabled: false, showBaseMaps: false },
      nativeControls: { zoom: false, search: true }
    },
    config: {}
  };
  const host = new HeuristHostAdapter({
    baseUrl: 'http://example.test/heurist/',
    database: 'demo',
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ status: 0, data: JSON.stringify(stored) })
    })
  });

  assert.deepEqual(await host.loadPreferences(), stored);
});

test('default host fetch keeps Window/global receiver and avoids illegal invocation', async () => {
  const originalFetch = globalThis.fetch;
  let receiver = null;
  globalThis.fetch = function() {
    receiver = this;
    return Promise.resolve({ ok: true, json: async () => ({ status: 0, data: null }) });
  };
  try {
    const host = new HeuristHostAdapter({ baseUrl: 'http://example.test/heurist/', database: 'demo' });
    await host.loadPreferences();
    assert.equal(receiver, globalThis);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test('Heurist host adapter accepts string ok status and null preference data', async () => {
  const host = new HeuristHostAdapter({
    baseUrl: 'http://example.test/heurist/',
    database: 'demo',
    fetchImpl: async () => ({ ok: true, json: async () => ({ status: 'ok', data: null }) })
  });
  assert.equal(await host.loadPreferences(), null);
});

test('Heurist host adapter accepts string ok status for publish save', async () => {
  const host = new HeuristHostAdapter({
    baseUrl: 'http://example.test/heurist/',
    database: 'demo',
    fetchImpl: async () => ({ ok: true, json: async () => ({ status: 'ok', data: { id: 'abc123' } }) })
  });
  assert.deepEqual(await host.publish({ format: 'heurist-publication' }), { id: 'abc123' });
});

test('Heurist host adapter uses legacy map symbol preferences as runtime defaults', async () => {
  const requestedKeys = [];
  const stored = {
    map_default_style: JSON.stringify({ color: '#123456', fillOpacity: 40 }),
    map_select_style: { color: '#abcdef', weight: 4 }
  };
  const host = new HeuristHostAdapter({
    baseUrl: 'http://example.test/heurist/',
    database: 'demo',
    fetchImpl: async (url) => {
      const key = new URL(String(url)).searchParams.get('key');
      requestedKeys.push(key);
      return { ok: true, json: async () => ({ status: 0, data: stored[key] ?? null }) };
    }
  });
  const config = {
    defaults: { symbology: null, selectSymbology: null },
    persistedSettings: { config: { defaults: { symbology: null, selectSymbology: null } } }
  };

  await host.initialize({ config });

  assert.deepEqual(config.defaults.symbology, { color: '#123456', fillOpacity: 40 });
  assert.deepEqual(config.defaults.selectSymbology, { color: '#abcdef', weight: 4 });
  assert.deepEqual(requestedKeys.sort(), ['map_default_style', 'map_select_style']);
  assert.equal(config.persistedSettings.config.defaults.symbology, null,
    'legacy compatibility defaults must not be copied into persisted heurist-map settings');
});

test('explicit heurist-map symbol defaults take precedence over legacy preferences', async () => {
  let requests = 0;
  const host = new HeuristHostAdapter({
    baseUrl: 'http://example.test/heurist/',
    database: 'demo',
    fetchImpl: async () => {
      requests++;
      return { ok: true, json: async () => ({ status: 0, data: '{}' }) };
    }
  });
  const config = {
    defaults: {
      symbology: { color: '#111111' },
      selectSymbology: { color: '#222222' }
    }
  };

  await host.initialize({ config });

  assert.equal(requests, 0);
  assert.deepEqual(config.defaults.symbology, { color: '#111111' });
  assert.deepEqual(config.defaults.selectSymbology, { color: '#222222' });
});

test('configuration-only API self-heals a missing preferences value from the host', async () => {
  const originalOpen = MapConfigurationDialog.prototype.open;
  MapConfigurationDialog.prototype.open = function() { return this; };
  try {
    const host = { loadPreferences: async () => ({ config: { defaults: { popupTemplate: 'minimal' } } }) };
    const api = new HeuristMapConfigurationApi({ host });

    const dialog = await api.openConfigurationDialog({ mode: 'preferences' });

    assert.equal(dialog.value.config.defaults.popupTemplate, 'minimal');
  } finally {
    MapConfigurationDialog.prototype.open = originalOpen;
  }
});

test('configuration-only API does not fetch preferences when a value is already supplied', async () => {
  const originalOpen = MapConfigurationDialog.prototype.open;
  MapConfigurationDialog.prototype.open = function() { return this; };
  try {
    let called = false;
    const host = { loadPreferences: async () => { called = true; return {}; } };
    const api = new HeuristMapConfigurationApi({ host });

    await api.openConfigurationDialog({
      mode: 'preferences',
      value: { config: { defaults: { popupTemplate: 'standard' } } }
    });

    assert.equal(called, false);
  } finally {
    MapConfigurationDialog.prototype.open = originalOpen;
  }
});

test('configuration-only API never fetches the viewer\'s preference for website/publish modes', async () => {
  const originalOpen = MapConfigurationDialog.prototype.open;
  MapConfigurationDialog.prototype.open = function() { return this; };
  try {
    let called = false;
    const host = { loadPreferences: async () => { called = true; return {}; } };
    const api = new HeuristMapConfigurationApi({ host });

    await api.openConfigurationDialog({ mode: 'website' });

    assert.equal(called, false);
  } finally {
    MapConfigurationDialog.prototype.open = originalOpen;
  }
});

test('legacy map preference failures do not block host initialization', async () => {
  const host = new HeuristHostAdapter({
    baseUrl: 'http://example.test/heurist/',
    database: 'demo',
    fetchImpl: async () => { throw new Error('preference endpoint unavailable'); }
  });
  const config = { defaults: { symbology: null, selectSymbology: null } };

  await host.initialize({ config });

  assert.equal(config.defaults.symbology, null);
  assert.equal(config.defaults.selectSymbology, null);
});
