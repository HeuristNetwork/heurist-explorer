import test from 'node:test';
import assert from 'node:assert/strict';

import { HeuristHostAdapter } from '../../src/host/HeuristHostAdapter.js';
import { createHostAdapter } from '../../src/host/createHostAdapter.js';
import { HeuristMapConfigurationApi } from '../../src/host/HeuristMapConfigurationApi.js';
import { ModuleConfigurationDialog } from '../../../../shared/src/ui/config/ModuleConfigurationDialog.js';

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
  // published from heurist-explorer only (plan 29): its bridge has openConfiguration
  assert.deepEqual(host.getCapabilities(), { mapPreferences: true, mapPublishing: false });
  const explorer = createHostAdapter({ type: 'heurist', baseUrl: '/heurist/', database: 'demo', fetchImpl: async () => {},
    bridge: { openConfiguration: async () => null } });
  assert.equal(explorer.getCapabilities().mapPublishing, true);
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
  const originalOpen = ModuleConfigurationDialog.prototype.open;
  ModuleConfigurationDialog.prototype.open = async function() { return null; };
  try {
    const host = { loadPreferences: async () => ({ config: { defaults: { popupTemplate: 'minimal' } } }) };
    const api = new HeuristMapConfigurationApi({ host });

    const handle = await api.openConfigurationDialog({ mode: 'preferences' });
    await handle.result;

    assert.equal(handle.dialog.options.value.config.defaults.popupTemplate, 'minimal');
  } finally {
    ModuleConfigurationDialog.prototype.open = originalOpen;
  }
});

test('configuration-only API does not fetch preferences when a value is already supplied', async () => {
  const originalOpen = ModuleConfigurationDialog.prototype.open;
  ModuleConfigurationDialog.prototype.open = async function() { return null; };
  try {
    let called = false;
    const host = { loadPreferences: async () => { called = true; return {}; } };
    const api = new HeuristMapConfigurationApi({ host });

    await (await api.openConfigurationDialog({
      mode: 'preferences',
      value: { config: { defaults: { popupTemplate: 'standard' } } }
    })).result;

    assert.equal(called, false);
  } finally {
    ModuleConfigurationDialog.prototype.open = originalOpen;
  }
});

test('configuration-only API never fetches the viewer\'s preference for website/publish modes', async () => {
  const originalOpen = ModuleConfigurationDialog.prototype.open;
  ModuleConfigurationDialog.prototype.open = async function() { return null; };
  try {
    let called = false;
    const host = { loadPreferences: async () => { called = true; return {}; } };
    const api = new HeuristMapConfigurationApi({ host });

    await (await api.openConfigurationDialog({ mode: 'website' })).result;

    assert.equal(called, false);
  } finally {
    ModuleConfigurationDialog.prototype.open = originalOpen;
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
