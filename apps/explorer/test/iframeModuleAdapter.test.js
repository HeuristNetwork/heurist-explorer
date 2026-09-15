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

test('iframe bridge forwards Explorer datasource workspace actions', async () => {
  const calls = [];
  const hostActions = {
    addDataSourceToWorkspace: (source, options) => calls.push(['add', source, options]),
    removeDataSourceFromWorkspace: (source) => calls.push(['remove', source]),
    isDataSourceInWorkspace: (source) => {
      calls.push(['has', source]);
      return true;
    },
    updateDataSourceInWorkspace: (source) => calls.push(['update', source]),
    getWorkspaceDataSources: () => [dataSource],
    showDatasource: (source) => calls.push(['show', source]),
    saveDatasourceAsFilter: (source) => calls.push(['filter', source]),
    saveDatasourceAsSource: (source, options) => calls.push(['source', source, options])
  };
  const adapter = new IframeModuleAdapter({
    id: 'data', type: 'data', container: null, url: '', hostActions
  });
  const bridge = adapter._createChildHostBridge();
  const dataSource = { type: 'query', query: { q: 't:12' } };
  bridge.addDataSourceToWorkspace(dataSource, { title: 'Places' });
  bridge.removeDataSourceFromWorkspace('query:key');
  assert.equal(bridge.isDataSourceInWorkspace(dataSource), true);
  bridge.updateDataSourceInWorkspace(dataSource);
  assert.deepEqual(bridge.getWorkspaceDataSources(), [dataSource]);
  assert.deepEqual(bridge.getHostContext(), { name: 'heurist-explorer', runtimeMode: 'main' });
  bridge.showDatasource(dataSource);
  bridge.saveDatasourceAsFilter(dataSource);
  bridge.saveDatasourceAsSource(dataSource, { profile: 'data' });

  assert.deepEqual(calls, [
    ['add', dataSource, { title: 'Places' }],
    ['remove', 'query:key'],
    ['has', dataSource],
    ['update', dataSource],
    ['show', dataSource],
    ['filter', dataSource],
    ['source', dataSource, { profile: 'data' }]
  ]);
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
