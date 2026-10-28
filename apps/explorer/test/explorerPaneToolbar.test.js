import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom, flush } from '../../../shared/test/helpers/fakeDom.js';

installFakeDom();
globalThis.Node ??= globalThis.HTMLElement;
globalThis.requestAnimationFrame ??= (callback) => setTimeout(callback, 0);
const { ExplorerAuthoringDock } = await import('../src/ui/ExplorerAuthoringDock.js');
const { LayoutManager } = await import('../src/core/LayoutManager.js');
const { ExplorerRail } = await import('../src/ui/ExplorerRail.js');
const { ExplorerPaneToolbar } = await import('../src/ui/ExplorerPaneToolbar.js');
const { ExplorerUiConfig } = await import('../src/core/ExplorerUiConfig.js');

/**
 * A real dock, module layout and left rail over a minimal application: Result in
 * the West, Map in the center; Graph, Record (center) and Timeline (south) are
 * configured but deferred (no module yet).
 */
function setup({ placement = 'west' } = {}) {
  const container = document.createElement('div');
  const dock = new ExplorerAuthoringDock(document.createElement('div'), { database: 'db', storage: null });
  dock.setPlacement(placement);
  const layout = new LayoutManager(dock.modulesElement);
  layout.setLayout([{ id: 'data', type: 'data', region: 'west' }, { id: 'map', type: 'map', region: 'center' }]);
  const leftRail = new ExplorerRail({
    side: 'left',
    buttons: [
      { id: 'search', title: 'Search', group: 'author' },
      { id: 'saved-filters', title: 'Filters', group: 'find' }
    ]
  });
  leftRail.mount(container);
  const shown = [];
  const application = {
    container,
    authoringDock: dock,
    layout,
    modules: new Map(),
    uiConfigValue: ExplorerUiConfig.defaults(),
    controlPanel: { leftRail },
    async showPresentation(type) {
      shown.push(type);
      const region = this.uiConfigValue.regions[type];
      if (!layout.getSlot(type)) layout.addDefinition({ id: type, type, region });
      else layout.showModule(type);
      return true;
    }
  };
  const toolbar = new ExplorerPaneToolbar({ application });
  return { application, dock, layout, leftRail, toolbar, shown, container };
}

const strip = (layout, region) => layout.cardinal.getRegionElement(region).querySelector('.h-explorer-pane-tabs');
const tabTypes = (layout, region) => strip(layout, region)?.querySelectorAll('.h-explorer-pane-tab').map((tab) => tab.dataset.type);

test('"In panes" moves the left rail to the top of the West pane, with the pane toggle', () => {
  const { toolbar, dock, leftRail, container, layout } = setup();
  toolbar.setActive(true);
  const west = dock.cardinal.getRegionElement('west');
  assert.ok(container.classList.contains('h-toolbar-panes'));
  assert.equal(leftRail.element.parentElement, west);
  assert.equal(west.children[0], leftRail.element, 'the buttons go first, above the editor');
  assert.ok(leftRail.element.querySelector('.h-explorer-pane-toolbar-toggle'));
  assert.ok(layout.cardinal.root.classList.contains('has-splitter-buttons'));

  // the editor moved north and back: the buttons stay first
  dock.setTemporaryPlacement('north');
  dock.setTemporaryPlacement(null);
  assert.equal(west.children[0], leftRail.element);
});

test('the pane toggle collapses and expands the West pane', () => {
  const { toolbar, dock, leftRail } = setup();
  toolbar.setActive(true);
  const toggle = leftRail.element.querySelector('.h-explorer-pane-toolbar-toggle');
  assert.equal(toggle.querySelector('span').className, 'fa-solid fa-angles-left');
  toggle.click();
  assert.equal(dock.cardinal.state.west.collapsed, true);
  assert.equal(toggle.querySelector('span').className, 'fa-solid fa-angles-right');
  assert.equal(dock.cardinal.options.collapsedSize, 68, 'a strip wide enough for the (large) buttons');

  // picking a filter shows the editor: the pane expands
  dock.show();
  assert.equal(dock.cardinal.state.west.collapsed, false);
});

test('the buttons size sizes the collapsed strips and styles the tabs of collapsed panes', () => {
  const { toolbar, dock, layout, container } = setup();
  toolbar.setButtonSize('small');
  toolbar.setActive(true);
  assert.ok(container.classList.contains('h-pane-buttons-small'));
  assert.equal(dock.cardinal.options.collapsedSize, 34);
  assert.equal(layout.cardinal.options.collapsedSize, 26);

  toolbar.setButtonSize('small-caption');
  assert.ok(container.classList.contains('h-pane-buttons-small-caption'));
  assert.ok(!container.classList.contains('h-pane-buttons-small'));
  assert.equal(dock.cardinal.options.collapsedSize, 160);
  assert.equal(layout.cardinal.options.collapsedSize, 120);
  assert.equal(layout.cardinal.options.collapsedHeight, 32);

  // leaving "In panes": the module layout's own strips
  toolbar.setActive(false);
  assert.ok(!container.classList.contains('h-pane-buttons-small-caption'));
  assert.equal(layout.cardinal.options.collapsedSize, 26);
  assert.equal(layout.cardinal.options.collapsedHeight, null);
});

test('a click on the collapsed West strip (not on a button) expands it', () => {
  const { toolbar, dock } = setup();
  toolbar.setActive(true);
  dock.cardinal.collapse('west');
  const west = dock.cardinal.getRegionElement('west');
  west.dispatchEvent(Object.assign(new Event('click', { bubbles: true }), {}));
  assert.equal(dock.cardinal.state.west.collapsed, false);
});

test('a click on a collapsed module pane, not on a tab, expands it with its module', async () => {
  const { toolbar, layout, shown } = setup();
  toolbar.setActive(true);
  const south = layout.cardinal.getRegionElement('south');
  assert.equal(layout.cardinal.state.south.collapsed, true);
  south.dispatchEvent(new Event('click', { bubbles: true }));
  await flush();
  assert.equal(layout.cardinal.state.south.collapsed, false);
  assert.deepEqual(shown.slice(-1), ['timeline']);
});

test('a configured pane without a module is a collapsed strip; growing it creates the module', async () => {
  const { toolbar, layout, shown } = setup();
  toolbar.setActive(true);
  assert.equal(layout.cardinal.state.south.visible, true);
  assert.equal(layout.cardinal.state.south.collapsed, true);
  assert.deepEqual(tabTypes(layout, 'south'), ['timeline']);
  assert.ok(strip(layout, 'south').classList.contains('is-single'));

  layout.cardinal.grow('south');
  await flush();
  assert.deepEqual(shown, ['timeline']);
  assert.ok(layout.getSlot('timeline'));
});

test('a pane with several modules has tabs; a tab shows its module', async () => {
  const { toolbar, layout, shown } = setup();
  toolbar.setActive(true);
  // the tools are center modules after Graph by default (2026-10-14)
  assert.deepEqual(tabTypes(layout, 'center'), ['recordview', 'map', 'graph', 'report', 'crosstabs', 'actions', 'export', 'publish']);
  assert.ok(!strip(layout, 'center').classList.contains('is-single'));
  const active = () => strip(layout, 'center').querySelectorAll('.h-explorer-pane-tab').filter((tab) => tab.classList.contains('active')).map((tab) => tab.dataset.type);
  assert.deepEqual(active(), ['map']);

  strip(layout, 'center').querySelectorAll('.h-explorer-pane-tab')[2].click();
  await flush();
  assert.deepEqual(shown, ['graph']);
  assert.deepEqual(active(), ['graph'], 'the tab follows the assignment');
});

test('a tab in a pane squeezed by a maximized one restores that pane first', async () => {
  const { toolbar, layout } = setup();
  toolbar.setActive(true);
  layout.cardinal.maximize('west');
  strip(layout, 'center').querySelectorAll('.h-explorer-pane-tab')[0].click();
  await flush();
  assert.equal(layout.cardinal.isMaximized('west'), false);
});

test('leaving "In panes" puts everything back', () => {
  const { toolbar, dock, leftRail, container, layout } = setup();
  toolbar.setActive(true);
  layout.cardinal.maximize('west');
  dock.cardinal.collapse('west');
  toolbar.setActive(false);
  assert.ok(!container.classList.contains('h-toolbar-panes'));
  assert.equal(leftRail.element.parentElement, container);
  assert.equal(leftRail.element.querySelector('.h-explorer-pane-toolbar-toggle'), null);
  assert.equal(dock.cardinal.state.west.collapsed, false);
  assert.equal(layout.cardinal.isMaximized('west'), false);
  assert.equal(layout.cardinal.state.south.visible, false, 'the strip of a pane without a module is hidden again');
  assert.equal(strip(layout, 'center'), null);
  assert.ok(!layout.cardinal.root.classList.contains('has-splitter-buttons'));
});

test('editor placed north: the buttons stay in the West pane, collapsed without a list', () => {
  const { toolbar, dock, leftRail } = setup({ placement: 'north' });
  toolbar.setActive(true);
  assert.equal(dock.getRegion(), 'north');
  assert.equal(leftRail.element.parentElement, dock.cardinal.getRegionElement('west'));
  assert.equal(dock.cardinal.state.west.visible, true);
  assert.equal(dock.cardinal.state.west.collapsed, true);

  dock.setListShown(true);
  assert.equal(dock.cardinal.state.west.collapsed, false, 'a docked list expands it');
  dock.setListShown(false);
  assert.equal(dock.cardinal.state.west.collapsed, true);
});

test('the toolbar position "In panes" is kept by the configuration; the old name is read', () => {
  const data = {};
  const storage = { getItem: (key) => data[key] ?? null, setItem: (key, value) => { data[key] = value; } };
  const config = new ExplorerUiConfig({ database: 'db', storage });
  config.save({ toolbar: { position: 'panes', buttonSize: 'large' } });
  assert.equal(config.load().toolbar.position, 'panes');
  data['heurist.explorer.db.uiConfig'] = JSON.stringify({ toolbar: { position: 'compact' } });
  assert.equal(config.load().toolbar.position, 'panes');
  config.save({ toolbar: { position: 'sideways' } });
  assert.equal(config.load().toolbar.position, 'horizontal');
});

test('"In panes": a gear menu before «/», and modules in Unused have no tab', () => {
  const { toolbar, leftRail, layout, application } = setup();
  application.uiConfigValue.regions.graph = 'unused';
  application.uiConfigValue.regions.report = 'unused';
  toolbar.setActive(true);
  const settings = leftRail.element.querySelector('.h-explorer-pane-toolbar-settings');
  assert.ok(settings);
  assert.deepEqual(settings.querySelectorAll('.h-menu-item').map((item) => item.textContent),
    ['Configuration', 'Help', 'Getting started', 'Manage tags', 'Manage registered files', 'Manage users', 'Manage groups', 'Query tracer',
      'Test edit form', 'Test module configuration']);
  assert.ok(!tabTypes(layout, 'center').includes('graph'));
  assert.ok(!tabTypes(layout, 'center').includes('report'));
  toolbar.setActive(false);
  assert.equal(leftRail.element.querySelector('.h-explorer-pane-toolbar-settings'), null);
});

test('opening the search pane with its expand button shows the Saved Filters list', () => {
  const { toolbar, dock, leftRail, application } = setup();
  const calls = [];
  application.controlPanel.showDefaultList = () => calls.push('saved-filters');
  toolbar.setActive(true);
  const toggle = leftRail.element.querySelector('.h-explorer-pane-toolbar-toggle');
  toggle.click();
  assert.deepEqual(calls, [], 'closing shows nothing');
  toggle.click();
  assert.equal(dock.cardinal.state.west.collapsed, false);
  assert.deepEqual(calls, ['saved-filters']);
});

test('two built-in filters (Recent, All by date) above the Saved Filters search, not in the list', async () => {
  const { readFile } = await import('node:fs/promises');
  const panel = await readFile(new URL('../src/ui/ExplorerControlPanel.js', import.meta.url), 'utf8');
  assert.match(panel, /\{ id: 'builtin:recent', title: 'Recent', query: 'sortby:-m after:"1 week ago"' \}/);
  assert.match(panel, /\{ id: 'builtin:all-by-date', title: 'All by date', query: 'sortby:-m' \}/);
  assert.match(panel, /panel\.append\(builtin, controls, list\);/);
  assert.doesNotMatch(panel, /_builtinFilters\(/);
});
