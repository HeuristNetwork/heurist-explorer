import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from '../../../shared/test/helpers/fakeDom.js';

installFakeDom();
globalThis.Node ??= globalThis.HTMLElement;
const { ExplorerAuthoringDock } = await import('../src/ui/ExplorerAuthoringDock.js');

/** In-memory Storage stand-in. */
function memoryStorage(initial = {}) {
  const data = { ...initial };
  return { data, getItem: (key) => data[key] ?? null, setItem: (key, value) => { data[key] = String(value); } };
}

const KEY = 'heurist.explorer.db.authoringDock';

function dock(stored = null) {
  const storage = memoryStorage(stored ? { [KEY]: JSON.stringify(stored) } : {});
  const instance = new ExplorerAuthoringDock(document.createElement('div'), { database: 'db', storage });
  return { dock: instance, storage };
}

const regionOf = (d) => d.paneElement.parentElement?.dataset.region;

test('settings in the old format (widths only) still load; placement defaults to west', () => {
  const { dock: d } = dock({ widths: { editor: 420, form: 360 } });
  assert.equal(d.widths.editor, 420);
  assert.equal(d.getPlacement(), 'west');
  assert.equal(d.getAdvanced(), false);
  assert.equal(regionOf(d), 'west');
  assert.equal(d.isVisible(), true);
});

test('setPlacement moves only the pane, keeps its visibility and is remembered', () => {
  const { dock: d, storage } = dock();
  const moves = [];
  d.addEventListener('placementchange', (event) => moves.push(event.detail.region));
  const modules = d.modulesElement.parentElement;
  d.setPlacement('north');
  assert.equal(regionOf(d), 'north');
  assert.equal(d.cardinal.state.west.visible, false);
  assert.equal(d.isVisible(), true);
  assert.equal(d.modulesElement.parentElement, modules, 'the module layout is never re-parented');
  assert.deepEqual(moves, ['north']);
  assert.equal(JSON.parse(storage.data[KEY]).placement, 'north');

  d.hide();
  d.setPlacement('west');
  assert.equal(regionOf(d), 'west');
  assert.equal(d.isVisible(), false, 'a hidden pane stays hidden');
});

test('a stored north placement is applied at start', () => {
  const { dock: d } = dock({ widths: {}, placement: 'north', northHeight: 120, advanced: true });
  assert.equal(regionOf(d), 'north');
  assert.equal(d.cardinal.state.north.size, 120);
  assert.equal(d.getAdvanced(), true);
});

test('a temporary placement does not change the user placement', () => {
  const { dock: d, storage } = dock({ placement: 'north' });
  d.setTemporaryPlacement('west');
  assert.equal(regionOf(d), 'west');
  assert.equal(d.getPlacement(), 'north');
  d.setTemporaryPlacement(null);
  assert.equal(regionOf(d), 'north');
  assert.equal(JSON.parse(storage.data[KEY] || '{"placement":"north"}').placement, 'north');
});

test('drawer (compact) mode is always west; leaving it restores the placement', () => {
  const { dock: d } = dock({ placement: 'north' });
  d.setDrawerMode(true);
  assert.equal(regionOf(d), 'west');
  assert.equal(d.cardinal.state.west.collapsed, true);
  d.setDrawerMode(false);
  assert.equal(regionOf(d), 'north');
  assert.equal(d.isVisible(), true);
});

test('setAdvanced is remembered', () => {
  const { dock: d, storage } = dock();
  d.setAdvanced(true);
  assert.equal(JSON.parse(storage.data[KEY]).advanced, true);
});

test('docked list: West shows the pane and/or the list; hidden when it holds neither', () => {
  const { dock: d } = dock();
  const west = () => d.cardinal.state.west.visible;
  d.setListShown(true);
  assert.equal(west(), true);
  assert.equal(d.listElement.hidden, false);
  assert.ok(d.cardinal.getRegionElement('west').classList.contains('has-list'), 'pane above the list');
  assert.equal(d.listElement.parentElement, d.paneElement.parentElement);

  d.hide();
  assert.equal(west(), true, 'the list alone keeps the West');
  assert.equal(d.paneElement.hidden, true);
  assert.ok(!d.cardinal.getRegionElement('west').classList.contains('has-list'));

  d.setListShown(false);
  assert.equal(west(), false, 'nothing in the West: hidden');
  d.show();
  assert.equal(west(), true);
});

test('docked list: with a horizontal QSE the list is alone in the West', () => {
  const { dock: d } = dock({ placement: 'north' });
  d.setListShown(true);
  assert.equal(d.cardinal.state.north.visible, true);
  assert.equal(d.cardinal.state.west.visible, true);
  assert.equal(d.paneElement.parentElement?.dataset.region, 'north');
  assert.ok(!d.cardinal.getRegionElement('west').classList.contains('has-list'));
});

test('docked list: the Filter Form in the West hides the list until it closes', () => {
  const { dock: d } = dock();
  d.setListShown(true);
  d.setFormCover(true);
  assert.equal(d.listElement.hidden, true);
  assert.equal(d.isListShown(), false);
  assert.equal(d.cardinal.state.west.visible, true, 'the form fills the West');
  d.setFormCover(false);
  assert.equal(d.listElement.hidden, false);
  assert.equal(d.isListShown(), true);
});

test('query trace: below the pane in the West, behind a docked list', () => {
  const { dock: d } = dock();
  const west = () => d.cardinal.state.west.visible;
  d.setTraceShown(true);
  assert.equal(d.traceElement.hidden, false);
  assert.equal(d.traceElement.parentElement, d.paneElement.parentElement);
  assert.ok(d.cardinal.getRegionElement('west').classList.contains('has-list'), 'pane above the trace');

  d.setListShown(true);
  assert.equal(d.listElement.hidden, false);
  assert.equal(d.traceElement.hidden, true, 'the list covers the trace');
  d.setListShown(false);
  assert.equal(d.traceElement.hidden, false, 'the trace comes back');

  d.hide();
  assert.equal(west(), true, 'the trace alone keeps the West');
  d.setTraceShown(false);
  assert.equal(west(), false, 'no pane, no list, no trace: West hidden');
});

test('query trace: with a horizontal QSE the trace is alone in the West; the Filter Form hides it', () => {
  const { dock: d } = dock({ placement: 'north' });
  assert.equal(d.cardinal.state.west.visible, false);
  d.setTraceShown(true);
  assert.equal(d.cardinal.state.west.visible, true);

  const { dock: w } = dock();
  w.setTraceShown(true);
  w.setFormCover(true);
  assert.equal(w.traceElement.hidden, true);
  w.setFormCover(false);
  assert.equal(w.traceElement.hidden, false);
});

test('query trace: not shown in drawer mode, back afterwards', () => {
  const { dock: d } = dock();
  d.setTraceShown(true);
  d.setDrawerMode(true);
  assert.equal(d.traceElement.hidden, true);
  d.setDrawerMode(false);
  assert.equal(d.traceElement.hidden, false);
});
