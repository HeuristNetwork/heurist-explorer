import test from 'node:test';
import assert from 'node:assert/strict';
import { IframeModuleAdapter } from '../src/modules/IframeModuleAdapter.js';

test('iframe document forwarding suppresses programmatic activation and forwards user changes', async () => {
  const events = new EventTarget();
  const adapter = new IframeModuleAdapter({ id: 'timeline-1', type: 'timeline', container: null, url: '' });
  adapter.api = {
    addEventListener: (...args) => events.addEventListener(...args),
    activateMapDocument: async (id) => events.dispatchEvent(new CustomEvent('heurist-timeline-document-activated', {
      detail: { document: { id, active: true, loadState: 'loaded' } }
    }))
  };
  const forwarded = [];
  adapter.addEventListener('mapdocumentchange', (event) => forwarded.push(event.detail.documentId));
  adapter._bindChildEvents();
  await adapter.setActiveMapDocument(12);
  assert.deepEqual(forwarded, []);
  await adapter.api.activateMapDocument(13);
  assert.deepEqual(forwarded, ['13']);
});

test('map Show Data excludes its origin from synchronization; Workspace updates carry no current result', async () => {
  const calls = [];
  const adapter = new IframeModuleAdapter({
    id: 'map-1', type: 'map', container: null, url: '',
    hostActions: { showDatasource: (source, options) => calls.push({ source, options }) }
  });
  const source = { reference: { key: 'source:1' }, request: { q: 't:1' } };
  await adapter._createChildHostBridge().showDatasource(source);
  assert.deepEqual(calls, [{ source, options: { origin: 'map-1' } }]);
  assert.deepEqual(adapter.dataSource, source);
  adapter.api = { setDynamicDataSources: (value) => calls.push(value) };
  await adapter.setWorkspaceDataSources([source]);
  assert.deepEqual(calls.at(-1), { workspaceDataSources: [source] });
});

test('iframe bridge does not expose Explorer datasource persistence/workspace actions to presentations', () => {
  const adapter = new IframeModuleAdapter({
    id: 'data', type: 'data', container: null, url: '', hostActions: {
      addDataSourceToWorkspace() {}, saveDatasourceAsFilter() {}, saveDatasourceAsSource() {}
    }
  });
  const bridge = adapter._createChildHostBridge();
  for (const name of [
    'addDataSourceToWorkspace', 'removeDataSourceFromWorkspace', 'isDataSourceInWorkspace',
    'updateDataSourceInWorkspace', 'getWorkspaceDataSources', 'saveDatasourceAsFilter', 'saveDatasourceAsSource'
  ]) assert.equal(name in bridge, false);
  assert.equal(typeof bridge.showDatasource, 'function');
});

test('updateSettings notifies onSettingsChange so Explorer can cache the module preference', async () => {
  const changes = [];
  const adapter = new IframeModuleAdapter({
    id: 'map', type: 'map', container: null, url: '',
    onSettingsChange: (settings) => changes.push(settings)
  });
  const bridge = adapter._createChildHostBridge();
  const saved = { config: { defaults: { popupTemplate: 'minimal' } } };

  const returned = bridge.updateSettings(saved);

  assert.deepEqual(adapter.settings, saved);
  assert.deepEqual(returned, saved);
  assert.deepEqual(changes, [saved]);
});

test('setDataSource swallows a superseded (AbortError) rejection instead of throwing', async () => {
  const adapter = new IframeModuleAdapter({ id: 'graph', type: 'graph', container: null, url: '' });
  const error = new Error('Superseded graph request');
  error.name = 'AbortError';
  adapter.api = { setDataSource: async () => { throw error; } };
  const result = await adapter.setDataSource({ request: { q: 't:1' } });
  assert.equal(result, null);
});

test('setDataSource still rethrows a non-abort error', async () => {
  const adapter = new IframeModuleAdapter({ id: 'graph', type: 'graph', container: null, url: '' });
  adapter.api = { setDataSource: async () => { throw new Error('Server error'); } };
  await assert.rejects(
    () => adapter.setDataSource({ request: { q: 't:1' } }),
    /Server error/
  );
});

test('setDataSource brackets the child module call with setLoading(true)/setLoading(false)', async () => {
  const calls = [];
  const adapter = new IframeModuleAdapter({ id: 'graph', type: 'graph', container: null, url: '' });
  adapter.api = {
    setLoading: (loading) => calls.push(`loading:${loading}`),
    setDataSource: async () => { calls.push('setDataSource'); return 'ok'; }
  };
  await adapter.setDataSource({ request: { q: 't:1' } });
  assert.deepEqual(calls, ['loading:true', 'setDataSource', 'loading:false']);
});

test('setDataSource still clears the loading state when the child module rejects', async () => {
  const calls = [];
  const adapter = new IframeModuleAdapter({ id: 'data', type: 'data', container: null, url: '' });
  adapter.api = {
    setLoading: (loading) => calls.push(`loading:${loading}`),
    setDataSource: async () => { throw new Error('Server error'); }
  };
  await assert.rejects(() => adapter.setDataSource({ request: { q: 't:1' } }));
  assert.deepEqual(calls, ['loading:true', 'loading:false']);
});

test('programmatic Map selection feedback does not clear Graph selection', async () => {
  const events = new EventTarget();
  const adapter = new IframeModuleAdapter({ id: 'map', type: 'map', container: null, url: '' });
  adapter.api = {
    addEventListener: (...args) => events.addEventListener(...args),
    setSelection: async () => {
      events.dispatchEvent(new CustomEvent('heurist-map-selection-changed', {
        detail: { selection: null }
      }));
      return null;
    }
  };
  const forwarded = [];
  adapter.addEventListener('selectionchange', (event) => forwarded.push(event.detail.selection));
  adapter._bindChildEvents();

  await adapter.setSelection([17]);

  assert.deepEqual(adapter.selection, [17]);
  assert.deepEqual(forwarded, []);
});
