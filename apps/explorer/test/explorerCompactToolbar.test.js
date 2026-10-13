import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom, flush } from '../../../shared/test/helpers/fakeDom.js';

installFakeDom();
globalThis.Node ??= globalThis.HTMLElement;
globalThis.requestAnimationFrame ??= (callback) => setTimeout(callback, 0);
const { ExplorerAuthoringDock } = await import('../src/ui/ExplorerAuthoringDock.js');
const { LayoutManager } = await import('../src/core/LayoutManager.js');
const { ExplorerRail } = await import('../src/ui/ExplorerRail.js');
const { ExplorerCompactToolbar } = await import('../src/ui/ExplorerCompactToolbar.js');
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
  const toolbar = new ExplorerCompactToolbar({ application });
  return { application, dock, layout, leftRail, toolbar, shown, container };
}

const strip = (layout, region) => layout.cardinal.getRegionElement(region).querySelector('.h-explorer-pane-tabs');
const tabTypes = (layout, region) => strip(layout, region)?.querySelectorAll('.h-explorer-pane-tab').map((tab) => tab.dataset.type);

test('Compact moves the left rail to the top of the West pane, with the pane toggle', () => {
  const { toolbar, dock, leftRail, container, layout } = setup();
  toolbar.setActive(true);
  const west = dock.cardinal.getRegionElement('west');
  assert.ok(container.classList.contains('h-toolbar-compact'));
  assert.equal(leftRail.element.parentElement, west);
  assert.equal(west.children[0], leftRail.element, 'the buttons go first, above the editor');
  assert.ok(leftRail.element.querySelector('.h-explorer-compact-pane-toggle'));
  assert.ok(layout.cardinal.root.classList.contains('has-splitter-buttons'));

  // the editor moved north and back: the buttons stay first
  dock.setTemporaryPlacement('north');
  dock.setTemporaryPlacement(null);
  assert.equal(west.children[0], leftRail.element);
});

test('the pane toggle collapses and expands the West pane', () => {
  const { toolbar, dock, leftRail } = setup();
  toolbar.setActive(true);
  const toggle = leftRail.element.querySelector('.h-explorer-compact-pane-toggle');
  assert.equal(toggle.querySelector('span').className, 'fa-solid fa-angles-left');
  toggle.click();
  assert.equal(dock.cardinal.state.west.collapsed, true);
  assert.equal(toggle.querySelector('span').className, 'fa-solid fa-angles-right');
  assert.equal(dock.cardinal.options.collapsedSize, 34, 'a strip wide enough for the buttons');

  // picking a filter shows the editor: the pane expands
  dock.show();
  assert.equal(dock.cardinal.state.west.collapsed, false);
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
  assert.deepEqual(tabTypes(layout, 'center'), ['recordview', 'map', 'graph']);
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

test('leaving Compact puts everything back', () => {
  const { toolbar, dock, leftRail, container, layout } = setup();
  toolbar.setActive(true);
  layout.cardinal.maximize('west');
  dock.cardinal.collapse('west');
  toolbar.setActive(false);
  assert.ok(!container.classList.contains('h-toolbar-compact'));
  assert.equal(leftRail.element.parentElement, container);
  assert.equal(leftRail.element.querySelector('.h-explorer-compact-pane-toggle'), null);
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

test('the toolbar position compact is kept by the configuration', () => {
  const data = {};
  const storage = { getItem: (key) => data[key] ?? null, setItem: (key, value) => { data[key] = value; } };
  const config = new ExplorerUiConfig({ database: 'db', storage });
  config.save({ toolbar: { position: 'compact', buttonSize: 'large' } });
  assert.equal(config.load().toolbar.position, 'compact');
  config.save({ toolbar: { position: 'sideways' } });
  assert.equal(config.load().toolbar.position, 'horizontal');
});
