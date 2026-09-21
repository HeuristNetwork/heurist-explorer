import test from 'node:test';
import assert from 'node:assert/strict';
import { ExplorerUiConfig } from '../src/core/ExplorerUiConfig.js';

test('load() returns defaults when nothing is persisted', () => {
  const config = new ExplorerUiConfig({ database: 'demo', storage: memoryStorage() });
  assert.deepEqual(config.load(), ExplorerUiConfig.defaults());
});

test('save() persists and load() round-trips a valid value', () => {
  const storage = memoryStorage();
  const config = new ExplorerUiConfig({ database: 'demo', storage });
  const value = {
    toolbar: { position: 'horizontal', buttonSize: 'large-caption' },
    regions: { data: 'east', map: 'west', graph: 'west', timeline: 'north', recordview: 'south' }
  };
  const saved = config.save(value);
  assert.deepEqual(saved, { version: 1, ...value });
  assert.deepEqual(config.load(), { version: 1, ...value });
  assert.equal(
    storage.getItem('heurist.explorer.demo.uiConfig'),
    JSON.stringify({ version: 1, ...value })
  );
});

test('load() falls back to defaults for missing, corrupt or invalid fields', () => {
  const storage = memoryStorage();
  storage.setItem('heurist.explorer.demo.uiConfig', '{not json');
  const config = new ExplorerUiConfig({ database: 'demo', storage });
  assert.deepEqual(config.load(), ExplorerUiConfig.defaults());

  storage.setItem('heurist.explorer.demo.uiConfig', JSON.stringify({
    toolbar: { position: 'sideways', buttonSize: 'huge' },
    regions: { data: 'nowhere', map: 'center' }
  }));
  assert.deepEqual(config.load(), ExplorerUiConfig.defaults());
});

test('storage keys are scoped per database', () => {
  const storage = memoryStorage();
  new ExplorerUiConfig({ database: 'alpha', storage }).save({ toolbar: { position: 'horizontal', buttonSize: 'small' } });
  new ExplorerUiConfig({ database: 'beta', storage }).save({ toolbar: { position: 'vertical', buttonSize: 'large' } });
  assert.equal(
    JSON.parse(storage.getItem('heurist.explorer.alpha.uiConfig')).toolbar.position,
    'horizontal'
  );
  assert.equal(
    JSON.parse(storage.getItem('heurist.explorer.beta.uiConfig')).toolbar.position,
    'vertical'
  );
});

test('tolerates a storage backend that throws', () => {
  const storage = {
    getItem() { throw new Error('unavailable'); },
    setItem() { throw new Error('unavailable'); }
  };
  const config = new ExplorerUiConfig({ database: 'demo', storage });
  assert.deepEqual(config.load(), ExplorerUiConfig.defaults());
  assert.doesNotThrow(() => config.save({ toolbar: { position: 'horizontal', buttonSize: 'small' } }));
});

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
}
