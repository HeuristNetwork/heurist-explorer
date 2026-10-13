import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from './helpers/fakeDom.js';

installFakeDom();
globalThis.Node ??= globalThis.HTMLElement;
const { HCardinalLayout } = await import('../src/widgets/layout/HCardinalLayout.js');

/** Layout in a 1000 x 800 container, with west, center and east shown. */
function layout(options = {}) {
  const container = document.createElement('div');
  container.getBoundingClientRect = () => ({ top: 0, left: 0, right: 1000, bottom: 800, width: 1000, height: 800 });
  const cardinal = new HCardinalLayout(container, { westSize: 300, eastSize: 200, ...options });
  cardinal.show('east');
  return cardinal;
}

const button = (cardinal, region, action) => cardinal.splitters.get(region).querySelector(`.h-cardinal-splitter-${action}`);

test('grow and shrink step through collapsed, normal and maximized', () => {
  const cardinal = layout();
  assert.equal(cardinal.shrink('west'), true);
  assert.equal(cardinal.state.west.collapsed, true);
  assert.equal(cardinal.shrink('west'), false, 'collapsed is the smallest step');

  cardinal.grow('west');
  assert.equal(cardinal.state.west.collapsed, false);
  assert.equal(cardinal.isMaximized('west'), false);

  cardinal.grow('west');
  assert.equal(cardinal.isMaximized('west'), true);
  assert.equal(cardinal.grow('west'), false, 'maximized is the largest step');

  cardinal.shrink('west');
  assert.equal(cardinal.isMaximized('west'), false);
  assert.equal(cardinal.state.west.size, 300, 'restore keeps the normal size');
});

test('a maximized west takes the rest; center and east are squeezed to strips', () => {
  const cardinal = layout();
  const events = [];
  cardinal.addEventListener('regionmaximizechange', (event) => events.push(event.detail));
  cardinal.maximize('west');
  assert.equal(cardinal.middle.style.gridTemplateColumns, 'minmax(0, 1fr) 7px 26px 7px 26px');
  assert.equal(cardinal.getRegionElement('center').classList.contains('is-collapsed'), true);
  assert.equal(cardinal.getRegionElement('east').classList.contains('is-collapsed'), true);
  assert.equal(cardinal.getRegionElement('west').classList.contains('is-maximized'), true);
  assert.equal(cardinal.state.east.collapsed, false, 'squeezing is not stored as collapse');

  cardinal.restore('west');
  assert.equal(cardinal.middle.style.gridTemplateColumns, '300px 7px minmax(0, 1fr) 7px 200px');
  assert.equal(cardinal.getRegionElement('center').classList.contains('is-collapsed'), false);
  assert.deepEqual(events, [{ region: 'west', maximized: true }, { region: 'west', maximized: false }]);
});

test('a maximized north squeezes the middle row; one region is maximized at a time', () => {
  const cardinal = layout();
  cardinal.show('north');
  cardinal.maximize('north');
  assert.match(cardinal.root.style.gridTemplateRows, /^minmax\(0, 1fr\) 7px 26px /);
  assert.equal(cardinal.getRegionElement('west').classList.contains('is-collapsed'), true);

  cardinal.maximize('east');
  assert.equal(cardinal.isMaximized('north'), false);
  assert.equal(cardinal.getRegionElement('west').classList.contains('is-collapsed'), true, 'the opposite edge is squeezed');
  assert.equal(cardinal.getRegionElement('north').classList.contains('is-collapsed'), false);
});

test('hiding or collapsing a maximized region ends the maximize', () => {
  const cardinal = layout();
  cardinal.maximize('east');
  cardinal.hide('east');
  assert.equal(cardinal.isMaximized('east'), false);
  cardinal.show('east');
  assert.equal(cardinal.getRegionElement('center').classList.contains('is-collapsed'), false);

  cardinal.maximize('east');
  cardinal.collapse('east');
  assert.equal(cardinal.isMaximized('east'), false);
});

test('divider buttons are shown only when switched on, and act on their region', () => {
  const cardinal = layout();
  assert.equal(cardinal.root.classList.contains('has-splitter-buttons'), false);
  cardinal.setSplitterButtons(true);
  assert.equal(cardinal.root.classList.contains('has-splitter-buttons'), true);

  // east: the left arrow grows it
  button(cardinal, 'east', 'grow').click();
  assert.equal(cardinal.isMaximized('east'), true);
  assert.equal(button(cardinal, 'east', 'grow').hidden, true, 'nothing larger than maximized');
  assert.equal(button(cardinal, 'east', 'shrink').title, 'Restore pane size');

  button(cardinal, 'east', 'shrink').click();
  button(cardinal, 'east', 'shrink').click();
  assert.equal(cardinal.state.east.collapsed, true);
  assert.equal(button(cardinal, 'east', 'shrink').hidden, true);
  assert.equal(button(cardinal, 'east', 'grow').title, 'Expand pane');

  cardinal.setSplitterButtons(false);
  assert.equal(cardinal.root.classList.contains('has-splitter-buttons'), false);
});

test('a hidden region keeps its divider hidden', () => {
  const cardinal = layout();
  cardinal.setSplitterButtons(true);
  assert.equal(cardinal.splitters.get('south').hidden, true);
});

test('getState/setState carry the maximized state', () => {
  const cardinal = layout();
  cardinal.maximize('west');
  const state = cardinal.getState();
  assert.equal(state.west.maximized, true);
  const other = layout();
  other.setState(state);
  assert.equal(other.isMaximized('west'), true);
});
