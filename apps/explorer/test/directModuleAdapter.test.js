import test from 'node:test';
import assert from 'node:assert/strict';
import { DirectModuleAdapter } from '../src/modules/DirectModuleAdapter.js';

test('direct adapter mounts Data with the normal bootstrap and bridge', async () => {
  const originalDocument = globalThis.document;
  const root = { className: '', remove() { this.removed = true; } };
  globalThis.document = { createElement: () => root };
  const container = { replaceChildren(child) { this.child = child; } };
  const calls = [];
  const api = {
    ready: async () => calls.push('ready'),
    setDataSource: async (source) => calls.push(['source', source]),
    destroy: async () => calls.push('destroy')
  };
  const adapter = new DirectModuleAdapter({
    id: 'data',
    type: 'data',
    container,
    url: '',
    runtime: { database: 'demo' },
    settings: { options: { ui: { showSourceHeader: true } } },
    hostActions: { getHostContext: () => ({ name: 'heurist-explorer', runtimeMode: 'main' }) },
    assetBaseUrl: '/heurist/hclient/bundles/heurist-data',
    mountModule: async (options) => {
      calls.push(['mount', options]);
      return api;
    }
  });

  try {
    await adapter.mount();
    const mount = calls[0][1];
    assert.equal(container.child, root);
    assert.equal(mount.container, root);
    assert.equal(mount.assetBaseUrl, '/heurist/hclient/bundles/heurist-data');
    assert.equal(mount.bootstrap.runtime.runtimeMode, 'main');
    assert.equal(mount.bootstrap.runtime.database, 'demo');
    assert.deepEqual(mount.bridge.getHostContext(), { name: 'heurist-explorer', runtimeMode: 'main' });

    const source = { type: 'query', request: { q: 't:12' } };
    await adapter.setDataSource(source);
    assert.deepEqual(calls.at(-1), ['source', source]);
    await adapter.destroy();
    assert.equal(root.removed, true);
    assert.ok(calls.includes('destroy'));
  } finally {
    globalThis.document = originalDocument;
  }
});
