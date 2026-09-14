import test from 'node:test';
import assert from 'node:assert/strict';
import { HostAdapter } from '#shared/host';
import { HeuristHostAdapter } from '../../src/host/HeuristHostAdapter.js';
import { MapApplication } from '../../src/core/MapApplication.js';

test('HeuristHostAdapter exposes generic record editing only when bridge supports it', async () => {
  const calls = [];
  const adapter = new HeuristHostAdapter({
    bridge: {
      editRecord(recordId) {
        calls.push(recordId);
        return Promise.resolve({ saved: true, recordId });
      }
    }
  });

  assert.equal(adapter.supportsEditing(), true);
  assert.deepEqual(await adapter.editRecord(122), { saved: true, recordId: 122 });
  assert.deepEqual(calls, [122]);

  const noBridge = new HeuristHostAdapter();
  assert.equal(noBridge.supportsEditing(), false);
  await assert.rejects(() => noBridge.editRecord(122), /not available/);
});

test('base HostAdapter does not expose editing', async () => {
  const adapter = new HostAdapter();
  assert.equal(adapter.supportsEditing(), false);
  await assert.rejects(() => adapter.editRecord(1), /not available/);
});

test('MapDocument edit uses record editor and reloads only after save', async () => {
  const calls = [];
  const app = Object.create(MapApplication.prototype);
  app.config = { readonly: false };
  app.host = {
    supportsEditing: () => true,
    async editRecord(recordId) {
      calls.push(['edit', recordId]);
      return { saved: true, recordId };
    }
  };
  app.reloadMapDocument = async (recordId) => calls.push(['reload-document', recordId]);

  const result = await app.requestEditMapDocument(132);
  assert.deepEqual(result, { saved: true, recordId: 132 });
  assert.deepEqual(calls, [['edit', 132], ['reload-document', 132]]);

  calls.length = 0;
  app.host.editRecord = async (recordId) => {
    calls.push(['edit', recordId]);
    return { saved: false, recordId };
  };
  await app.requestEditMapDocument(132);
  assert.deepEqual(calls, [['edit', 132]]);
});

test('MapLayer edit resolves persisted record ID and reloads runtime layer after save', async () => {
  const calls = [];
  const app = Object.create(MapApplication.prototype);
  app.config = { readonly: false };
  app.layers = new Map([['map-layer-122', { id: 'map-layer-122', recordId: 122 }]]);
  app.host = {
    supportsEditing: () => true,
    async editRecord(recordId) {
      calls.push(['edit', recordId]);
      return { saved: true, recordId };
    }
  };
  app.reloadLayer = async (layerId) => calls.push(['reload-layer', layerId]);

  await app.requestEditLayer('map-layer-122');
  assert.deepEqual(calls, [['edit', 122], ['reload-layer', 'map-layer-122']]);
});

test('legacy edit-request events remain as fallback when host has no editor', async () => {
  const events = [];
  const app = Object.create(MapApplication.prototype);
  app.config = { readonly: false };
  app.layers = new Map([['map-layer-122', { id: 'map-layer-122', recordId: 122 }]]);
  app.host = { supportsEditing: () => false };
  app.dispatch = (name, detail) => events.push([name, detail]);

  await app.requestEditMapDocument(132);
  await app.requestEditLayer('map-layer-122');

  assert.deepEqual(events, [
    ['heurist-map-edit-document-requested', { documentId: 132, recordId: 132 }],
    ['heurist-map-edit-layer-requested', { layerId: 'map-layer-122', recordId: 122 }]
  ]);
});

test('persisted layer ordinary symbology edit passes canonical value and redraws without reload', async () => {
  const calls = [];
  const app = Object.create(MapApplication.prototype);
  app.config = { readonly: false };
  app.layers = new Map([['map-layer-122', {
    id: 'map-layer-122',
    recordId: 122,
    source: { type: 'heurist-query', query: 't:10' },
    // Runtime style is deliberately normalized/polluted with engine-only fields.
    style: {
      symbol: { iconType: 'circle', color: '#111111', iconSize: [18, 18], radius: 9, blur: null },
      selectSymbol: { color: '#ffffff' },
      thematic: [{ title: 'Population', fields: [{ code: '10:1109', ranges: [] }] }]
    }
  }]]);
  app.activeMapDocumentId = 132;
  app.mapDocuments = new Map([[132, {
    layerDefinitions: [{
      reference: { id: 'map-layer-122' },
      mapLayer: {
        _sourceStyle: {
          symbol: { iconType: 'circle', color: '#111111' },
          thematic: [{ title: 'Population', fields: [{ code: '10:1109', ranges: [] }] }]
        }
      }
    }]
  }]]);
  app.host = {
    supportsSymbologyEditing: () => true,
    async editSymbology(value, options) {
      calls.push(['edit', value, options]);
      return {
        symbol: { iconType: 'circle', color: '#222222' },
        thematic: value.thematic
      };
    }
  };
  app.setLayerStyle = async (layerId, value) => {
    calls.push(['style', layerId, value]);
    return value;
  };
  app.reloadLayer = async (layerId) => calls.push(['reload', layerId]);

  await app.requestEditLayerSymbology('map-layer-122');

  assert.deepEqual(calls[0][1], {
    symbol: { iconType: 'circle', color: '#111111' },
    thematic: [{ title: 'Population', fields: [{ code: '10:1109', ranges: [] }] }]
  });
  assert.equal(calls[0][2].persist, true);
  assert.equal(calls[0][2].query, 't:10');
  assert.equal(calls[0][2].parentSymbol.color, '#ff0000');
  assert.equal(calls[0][2].parentSymbol.opacity, 1);
  assert.equal(calls[0][2].parentSymbol.fillOpacity, 0.2);
  assert.equal(calls.some((call) => call[0] === 'reload'), false);
  assert.equal(calls.at(-1)[0], 'style');
});

test('persisted layer thematic edit reloads layer so thematic attributes are refreshed', async () => {
  const calls = [];
  const app = Object.create(MapApplication.prototype);
  app.config = { readonly: false };
  app.layers = new Map([['map-layer-122', {
    id: 'map-layer-122',
    recordId: 122,
    source: { type: 'heurist-query', query: 't:10' },
    style: { symbol: { iconType: 'circle' }, thematic: [] }
  }]]);
  app.host = {
    supportsSymbologyEditing: () => true,
    async editSymbology(value, options) {
      calls.push(['edit', value, options]);
      return {
        symbol: { iconType: 'circle' },
        thematic: [{ title: 'Type', fields: [{ code: '10:12', ranges: [] }] }]
      };
    }
  };
  app.setLayerStyle = async (layerId, value) => calls.push(['style', layerId, value]);
  app.reloadLayer = async (layerId) => {
    calls.push(['reload', layerId]);
    return { id: layerId };
  };

  await app.requestEditLayerSymbology('map-layer-122', { thematic: true });

  assert.equal(calls[0][2].thematic, true);
  assert.equal(calls[0][2].parentSymbol.color, '#ff0000');
  assert.deepEqual(calls.at(-1), ['reload', 'map-layer-122']);
  assert.equal(calls.some((call) => call[0] === 'style'), true);
  assert.deepEqual(calls.find((call) => call[0] === 'style').slice(1), [
    'map-layer-122',
    {symbol:{iconType:'circle'}, thematic:[{title:'Type', fields:[{code:'10:12', ranges:[]}]}]}
  ]);
});

test('current-results default symbology edit persists map preferences and reapplies inherited defaults', async () => {
  const calls = [];
  const app = Object.create(MapApplication.prototype);
  app.config = {
    readonly: false,
    defaults: { symbology: { iconType: 'circle', color: '#111111' } },
    persistedSettings: { config: { defaults: { symbology: { iconType: 'circle', color: '#111111' } } } }
  };
  app.layers = new Map([['current-results', {
    id: 'current-results',
    recordId: null,
    source: { type: 'heurist-query', query: 'ids:1,2' },
    style: { symbol: { iconType: 'circle', color: '#111111' }, thematic: [] }
  }]]);
  app.host = {
    supportsSymbologyEditing: () => true,
    getCapabilities: () => ({ mapPreferences: true }),
    async editSymbology(value, options) {
      calls.push(['edit', value, options]);
      return { iconType: 'iconfont', iconFont: 'location' };
    },
    async savePreferences(settings) {
      calls.push(['savePreferences', settings]);
      return settings;
    }
  };
  app.applyConfiguration = async (settings) => {
    calls.push(['applyConfiguration', settings]);
    app.config.persistedSettings = settings;
    app.config.defaults = settings.config.defaults;
    return settings;
  };

  await app.requestEditLayerSymbology('current-results');

  assert.equal(calls[0][2].persist, false);
  assert.equal(calls[0][2].parentSymbol.color, '#ff0000');
  assert.equal(calls[0][2].parentSymbol.fillOpacity, 0.2);
  assert.deepEqual(app.config.defaults.symbology, { iconType: 'iconfont', iconFont: 'location' });
  assert.equal(calls.some((call) => call[0] === 'savePreferences'), true);
  assert.equal(calls.at(-1)[0], 'applyConfiguration');
});

test('workspace symbology remains local and never persists a MapLayer record or global default', async () => {
  const calls = [];
  const app = Object.create(MapApplication.prototype);
  app.config = {
    readonly: false,
    defaults: { symbology: { iconType: 'circle', color: '#111111' } },
    persistedSettings: { config: { defaults: { symbology: { iconType: 'circle', color: '#111111' } } } }
  };
  app.layers = new Map([['workspace-source-17', {
    id: 'workspace-source-17',
    recordId: null,
    source: { type: 'heurist-query', query: 't:10' },
    style: { symbol: { iconType: 'circle', color: '#333333' }, thematic: [] },
    options: { workspaceEntry: true }
  }]]);
  app.mapDocuments = new Map();
  app.host = {
    supportsSymbologyEditing: () => true,
    getCapabilities: () => ({ mapPreferences: true }),
    async editSymbology(value, options) {
      calls.push(['edit', value, options]);
      return { symbol: { iconType: 'circle', color: '#abcdef' }, thematic: [] };
    },
    async savePreferences(settings) {
      calls.push(['savePreferences', settings]);
    }
  };
  app.setLayerStyle = async (layerId, value) => calls.push(['style', layerId, value]);
  app.applyConfiguration = async (settings) => calls.push(['applyConfiguration', settings]);

  await app.requestEditLayerSymbology('workspace-source-17');

  assert.equal(calls[0][2].recordId, null);
  assert.equal(calls[0][2].persist, false);
  assert.equal(calls.some((call) => call[0] === 'savePreferences'), false);
  assert.equal(calls.some((call) => call[0] === 'applyConfiguration'), false);
  assert.deepEqual(calls.at(-1), [
    'style',
    'workspace-source-17',
    { symbol: { iconType: 'circle', color: '#abcdef' }, thematic: [] }
  ]);
});
