import test from 'node:test';
import assert from 'node:assert/strict';

// Minimal DOM stand-ins: compact mode only builds two buttons and toggles classes.
function fakeElement() {
  const classes = new Set();
  return {
    children: [], dataset: {}, className: '', innerHTML: '', title: '',
    classList: {
      toggle(name, on) { if (on) classes.add(name); else classes.delete(name); },
      contains: (name) => classes.has(name)
    },
    setAttribute() {},
    addEventListener() {},
    append(...nodes) { this.children.push(...nodes); for (const node of nodes) node.parent = this; },
    remove() { if (this.parent) this.parent.children = this.parent.children.filter((node) => node !== this); }
  };
}
globalThis.document ??= { createElement: fakeElement };
globalThis.requestAnimationFrame ??= (callback) => setTimeout(callback, 0);

const { ExplorerCompactMode } = await import('../src/ui/ExplorerCompactMode.js');

/** Fake matchMedia whose state the test flips. */
function media(matches) {
  const listeners = new Set();
  return {
    matches,
    addEventListener: (_type, fn) => listeners.add(fn),
    removeEventListener: (_type, fn) => listeners.delete(fn),
    set(value) { this.matches = value; for (const fn of listeners) fn(); }
  };
}

/**
 * Stack geometry: shown regions are 600px high, stacked in region order, in a
 * 600px scroller. `scrolled` records scrollIntoView targets.
 */
function fakeApplication({ hidden = ['north', 'east', 'south'] } = {}) {
  const scroller = { scrollTop: 0, getBoundingClientRect: () => ({ top: 0, bottom: 600, height: 600 }) };
  const scrolled = [];
  const regions = {};
  let offset = 0;
  for (const name of ['north', 'west', 'center', 'east', 'south']) {
    const element = fakeElement();
    element.name = name;
    element.hidden = hidden.includes(name);
    if (!element.hidden) { element.offsetTop = offset; offset += 600; }
    element.getBoundingClientRect = () => ({
      top: element.offsetTop - scroller.scrollTop, bottom: element.offsetTop - scroller.scrollTop + 600
    });
    element.scrollIntoView = () => scrolled.push(name);
    regions[name] = element;
  }
  const dockWest = fakeElement();
  const pane = new EventTarget();
  const layout = new EventTarget();
  Object.assign(layout, {
    cardinal: { root: scroller, getRegionElement: (name) => regions[name] },
    getModuleForRegion: (name) => ({ west: 'data', center: 'map' }[name] || null),
    getRegionForModule: (id) => ({ data: 'west', map: 'center' }[id] || null)
  });
  const app = {
    container: fakeElement(),
    uiConfigValue: { toolbar: { position: 'vertical', buttonSize: 'large-caption' } },
    toolbarCalls: [],
    resized: [],
    modules: new Map([
      ['data', { id: 'data', type: 'data', resize: async () => app.resized.push('data') }],
      ['map', { id: 'map', type: 'map', resize: async () => app.resized.push('map') }]
    ]),
    layout,
    authoringDock: {
      drawer: false, visible: true,
      paneElement: pane,
      cardinal: { getRegionElement: () => dockWest },
      setDrawerMode(on) { this.drawer = on; if (on) this.visible = false; },
      hide() { this.visible = false; },
      show() { this.visible = true; }
    },
    controlPanel: { applyToolbarConfig: (config) => app.toolbarCalls.push(config) },
    syncSearchButton() {},
    showQuerySourcePanel() { app.authoringDock.show(); }
  };
  return { app, regions, dockWest, scroller, scrolled };
}

test('entering compact mode: root class, drawer, small toolbar, rail buttons, region titles', () => {
  const { app, regions, dockWest } = fakeApplication();
  const mq = media(true);
  globalThis.matchMedia = () => mq;
  const compact = new ExplorerCompactMode({ application: app }).start();

  assert.equal(compact.active, true);
  assert.equal(app.container.classList.contains('h-compact'), true);
  assert.equal(app.authoringDock.drawer, true);
  assert.equal(app.toolbarCalls.at(-1).buttonSize, 'small');
  assert.equal(dockWest.children.length, 2);
  assert.equal(regions.west.dataset.compactTitle, 'Data');
  assert.equal(regions.center.dataset.compactTitle, 'Map');
  assert.equal(regions.south.dataset.compactTitle, undefined);
  compact.destroy();
});

test('only an explicit Filter click (h-filter-form-apply) collapses the drawer', () => {
  const { app } = fakeApplication();
  globalThis.matchMedia = () => media(true);
  const compact = new ExplorerCompactMode({ application: app }).start();
  app.showQuerySourcePanel();
  app.authoringDock.paneElement.dispatchEvent(new CustomEvent('h-input-change', { bubbles: true }));
  assert.equal(app.authoringDock.visible, true);
  app.authoringDock.paneElement.dispatchEvent(new CustomEvent('h-filter-form-apply', { bubbles: true }));
  assert.equal(app.authoringDock.visible, false);
  compact.destroy();
});

test('leaving compact mode restores the configured toolbar and removes compact state', async () => {
  const { app, regions, dockWest } = fakeApplication();
  const mq = media(true);
  globalThis.matchMedia = () => mq;
  const compact = new ExplorerCompactMode({ application: app }).start();
  mq.set(false);

  assert.equal(compact.active, false);
  assert.equal(app.container.classList.contains('h-compact'), false);
  assert.equal(app.authoringDock.drawer, false);
  assert.equal(app.toolbarCalls.at(-1).buttonSize, 'large-caption');
  assert.equal(dockWest.children.length, 0);
  assert.equal(regions.west.dataset.compactTitle, undefined);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.ok(app.resized.includes('map'), 'modules are told to re-measure');

  // after the host reapplies its configuration, compact keeps small icons
  mq.set(true);
  compact.refresh();
  assert.equal(app.toolbarCalls.at(-1).buttonSize, 'small');
  compact.destroy();
});

test('Up/Down scroll to the previous/next shown module', () => {
  const { app, scroller, scrolled } = fakeApplication();
  globalThis.matchMedia = () => media(true);
  const compact = new ExplorerCompactMode({ application: app }).start();
  assert.equal(compact.scrollModule(-1), false, 'nothing above the first module');
  assert.equal(compact.scrollModule(1), true);
  assert.deepEqual(scrolled, ['center']);
  scroller.scrollTop = 600;
  assert.equal(compact.scrollModule(1), false, 'nothing below the last module');
  assert.equal(compact.scrollModule(-1), true);
  assert.deepEqual(scrolled, ['center', 'west']);
  compact.destroy();
});

test('toolbar toggle: on screen -> desktop hides it; off screen -> scroll to it', () => {
  const { app, scroller, scrolled } = fakeApplication();
  globalThis.matchMedia = () => media(true);
  const compact = new ExplorerCompactMode({ application: app }).start();
  assert.equal(compact.togglePresentation('data'), null, 'on screen: desktop path hides it');
  assert.equal(compact.togglePresentation('map'), true, 'off screen: scrolled to');
  assert.deepEqual(scrolled, ['center']);
  scroller.scrollTop = 600;
  assert.equal(compact.togglePresentation('map'), null);
  assert.equal(compact.togglePresentation('timeline'), null, 'not shown: desktop path shows it');
  compact.destroy();
  assert.equal(compact.togglePresentation('map'), null, 'inactive: always desktop behavior');
});

test('an explicit QSE Filter click that ran a search (h-query-source-run) collapses the drawer', () => {
  const { app } = fakeApplication();
  globalThis.matchMedia = () => media(true);
  const compact = new ExplorerCompactMode({ application: app }).start();
  app.showQuerySourcePanel();
  app.authoringDock.paneElement.dispatchEvent(new CustomEvent('h-query-source-run', { bubbles: true }));
  assert.equal(app.authoringDock.visible, false);
  compact.destroy();
});

test('scrollToPresentation scrolls to a shown module only while compact', async () => {
  const { app, scrolled } = fakeApplication();
  const mq = media(true);
  globalThis.matchMedia = () => mq;
  const compact = new ExplorerCompactMode({ application: app }).start();
  assert.equal(compact.scrollToPresentation('map'), true);
  assert.equal(compact.scrollToPresentation('timeline'), true, 'scheduled; nothing shown to scroll to');
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(scrolled, ['center']);
  mq.set(false);
  assert.equal(compact.scrollToPresentation('map'), false);
  compact.destroy();
});

test('activating a tool scrolls to its panel (center) and titles it', async () => {
  const { app, regions, scrolled } = fakeApplication();
  globalThis.matchMedia = () => media(true);
  const compact = new ExplorerCompactMode({ application: app }).start();
  // tool mode: the tool slot (not a module) occupies the center region
  Object.assign(app.layout, {
    isToolMode: () => true,
    activeToolId: 'crosstabs',
    getModuleForRegion: (name) => ({ west: 'data', center: '__explorer-tool' }[name] || null)
  });
  app.layout.dispatchEvent(new CustomEvent('modechange', { detail: { mode: 'tool', toolId: 'crosstabs' } }));
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(scrolled, ['center']);
  assert.equal(regions.center.dataset.compactTitle, 'Crosstabs');
  compact.destroy();
});
