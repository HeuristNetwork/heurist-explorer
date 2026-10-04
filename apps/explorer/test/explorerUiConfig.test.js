import test from 'node:test';
import assert from 'node:assert/strict';
import { applyUiRegions, ExplorerUiConfig, leadingPaneTypes, moduleTypesInOrder, resolveUiLanguage } from '../src/core/ExplorerUiConfig.js';

test('load() returns defaults when nothing is persisted', () => {
  const config = new ExplorerUiConfig({ database: 'demo', storage: memoryStorage() });
  assert.deepEqual(config.load(), ExplorerUiConfig.defaults());
});

test('save() persists and load() round-trips a valid value', () => {
  const storage = memoryStorage();
  const config = new ExplorerUiConfig({ database: 'demo', storage });
  const value = {
    toolbar: { position: 'horizontal', buttonSize: 'large-caption' },
    regions: { data: 'east', map: 'west', graph: 'west', timeline: 'north', recordview: 'south' },
    order: ['map', 'data', 'graph', 'timeline', 'recordview'],
    panes: { north: true, west: false, center: true, east: false, south: true },
    lists: 'popup',
    language: 'fre'
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

test('persisted pane assignments override bootstrap defaults before modules mount', () => {
  const definitions = [
    { id: 'data', type: 'data', region: 'west' },
    { id: 'map', type: 'map', region: 'center' }
  ];
  const configured = applyUiRegions(definitions, {
    regions: { data: 'center', map: 'west' }
  });

  assert.deepEqual(configured.map(({ id, region }) => [id, region]), [
    ['data', 'center'],
    ['map', 'west']
  ]);
  assert.deepEqual(definitions.map(({ id, region }) => [id, region]), [
    ['data', 'west'],
    ['map', 'center']
  ]);
});

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
}

test('defaults: toolbar on top, West (Result) and Center (Record View, Map, Graph) expanded at start', () => {
  const defaults = ExplorerUiConfig.defaults();
  assert.equal(defaults.toolbar.position, 'horizontal');
  assert.deepEqual(defaults.panes, { north: false, west: true, center: true, east: false, south: false });
  assert.deepEqual(defaults.regions, { data: 'west', map: 'center', graph: 'center', timeline: 'south', recordview: 'center' });
  assert.deepEqual(defaults.order, ['data', 'recordview', 'map', 'graph', 'timeline']);
  const config = new ExplorerUiConfig({ database: 'demo', storage: memoryStorage() });
  assert.deepEqual(config.save({ panes: { center: false, east: 'yes' } }).panes,
    { north: false, west: true, center: false, east: false, south: false }, 'invalid values fall back');
});

test('lists: docked by default; only docked or popup', () => {
  assert.equal(ExplorerUiConfig.defaults().lists, 'docked');
  const config = new ExplorerUiConfig({ database: 'demo', storage: memoryStorage() });
  assert.equal(config.save({ lists: 'popup' }).lists, 'popup');
  assert.equal(config.save({ lists: 'floating' }).lists, 'docked');
});

test('language: auto by default follows the host; a chosen language wins', () => {
  assert.equal(ExplorerUiConfig.defaults().language, 'auto');
  const config = new ExplorerUiConfig({ database: 'demo', storage: memoryStorage() });
  assert.equal(config.save({ language: 'klingon' }).language, 'auto');
  assert.equal(resolveUiLanguage(ExplorerUiConfig.defaults(), 'fre'), 'fre');
  assert.equal(resolveUiLanguage({ language: 'ger' }, 'fre'), 'ger');
  assert.equal(resolveUiLanguage({ language: 'auto' }, ''), 'eng');
});

test('order keeps known types once each and appends the missing ones in default order', () => {
  const config = new ExplorerUiConfig({ database: 'demo', storage: memoryStorage() });
  assert.deepEqual(config.save({ order: ['graph', 'bogus', 'map', 'graph'] }).order,
    ['graph', 'map', 'data', 'recordview', 'timeline']);
  assert.deepEqual(config.save({ order: 'map' }).order, ExplorerUiConfig.defaults().order);
});

test('leadingPaneTypes() gives the first module of each pane in the configured order', () => {
  const leading = leadingPaneTypes(ExplorerUiConfig.defaults());
  assert.deepEqual(Object.fromEntries(leading), { west: 'data', center: 'recordview', south: 'timeline' });
  const moved = { ...ExplorerUiConfig.defaults(), order: ['map', 'data', 'recordview', 'graph', 'timeline'] };
  assert.equal(leadingPaneTypes(moved).get('center'), 'map');
});

test('Explorer starts with only the first module of the panes configured as expanded', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/core/ExplorerApplication.js', import.meta.url), 'utf8');
  // modules of the other panes are not even created at start (no show-then-hide)
  assert.match(source, /await this\.applyLayout\(this\.config\.settings\.layout \|\| defaultLayout\(\), \{ deferHidden: true \}\);/);
  assert.match(source, /moduleDefs = moduleDefs\.filter\(shown\);/);
  // an expanded pane starts with its first module in the configured order
  assert.match(source, /const leading = leadingPaneTypes\(this\.uiConfigValue\);/);
  // the toolbar creates them later from the kept definition
  assert.match(source, /const deferred = this\.deferredDefinitions\?\.get\(type\);/);
});

test('moduleTypesInOrder() orders the toolbar by pane (N, W, C, E, S), then by the configured order', () => {
  assert.deepEqual(moduleTypesInOrder(ExplorerUiConfig.defaults()), ['data', 'recordview', 'map', 'graph', 'timeline']);
  const value = {
    regions: { data: 'east', map: 'center', graph: 'north', timeline: 'center', recordview: 'west' },
    order: ['data', 'timeline', 'map', 'graph', 'recordview']
  };
  assert.deepEqual(moduleTypesInOrder(value), ['graph', 'recordview', 'timeline', 'map', 'data']);
});

test('the toolbar does not hide the last visible module', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/core/ExplorerApplication.js', import.meta.url), 'utf8');
  assert.match(source, /PRESENTATION_TYPES\s*\.some\(\(other\) => other !== type && this\.layout\.isPresentationVisible\(other\)\)/);
  assert.match(source, /At least one module must stay visible/);
});
