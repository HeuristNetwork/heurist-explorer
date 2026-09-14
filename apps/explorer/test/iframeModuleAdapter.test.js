import test from 'node:test';
import assert from 'node:assert/strict';
import { IframeModuleAdapter } from '../src/modules/IframeModuleAdapter.js';

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

test('iframe bridge forwards openHelp to the host', () => {
  const calls = [];
  const hostActions = { openHelp: (options) => { calls.push(options); return true; } };
  const adapter = new IframeModuleAdapter({ id: 'map', type: 'map', container: null, url: '', hostActions });
  const bridge = adapter._createChildHostBridge();

  const result = bridge.openHelp({ moduleName: 'map', baseUrl: 'https://example.org/map' });

  assert.equal(result, true);
  assert.deepEqual(calls, [{ moduleName: 'map', baseUrl: 'https://example.org/map' }]);
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
