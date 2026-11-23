/**
 * @file cmsEditorSimplification.test.js
 * @brief Plan 27n1: tab sets that scroll and take the look of the Tabs element, collapsible tree items, the list of the
 *        ▾ of a query field.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 * @since       8.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from './helpers/fakeDom.js';
import { cmsTabsLook } from '../src/site/cmsEdit.js';
import { queryChoiceItems } from '../src/data/queryChoices.js';

test('createTabSet: arrow keys move between the tabs, the label is the title; scroll adds ‹ › around the tabs', async () => {
  installFakeDom();
  const { createTabSet } = await import('../src/widgets/layout/tabs.js');
  const selected = [];
  const run = createTabSet({ prefix: 'h-site', scroll: true, onSelect: (index) => selected.push(index) });
  const panels = [1, 2, 3].map(() => document.createElement('div'));
  panels.forEach((panel, index) => run.add(`Tab ${index + 1}`, panel));
  run.select(0);
  const children = run.strip.children;
  assert.equal(children[0].className, 'h-site-tab-scroll is-prev');
  assert.equal(children.at(-1).className, 'h-site-tab-scroll is-next');
  assert.deepEqual(children.slice(1, -1).map((tab) => tab.textContent), ['Tab 1', 'Tab 2', 'Tab 3'], 'the tabs between the buttons');
  assert.equal(run.tabs[1].title, 'Tab 2');
  assert.equal(run.strip.classList.contains('is-scrolling'), true);
  run.tabs[0].fire('keydown', { key: 'ArrowLeft' });
  assert.equal(run.selected, 2, 'wraps around');
  assert.equal(panels[2].hidden, false);
  assert.equal(panels[0].hidden, true);
  assert.equal(run.tabs[2].tabIndex, 0);
  assert.equal(run.tabs[0].tabIndex, -1);
  assert.deepEqual(selected, [0, 2]);
  run.destroy();
  // without `scroll` no buttons (the tabs of HEditForm and the designer)
  const plain = createTabSet({ prefix: 'h-tabs' });
  plain.add('A', document.createElement('div'));
  assert.equal(plain.strip.children.length, 1);
});

test('HSlider tabs: the shared tab set with the look of the Tabs element (plan 27n1 §2d)', async () => {
  installFakeDom();
  const { HSlider } = await import('../src/widgets/site/HSlider.js');
  const host = document.createElement('div');
  host.append(...[1, 2].map(() => document.createElement('div')));
  const slider = new HSlider().attach(host, { presentation: 'tabs', tabs: { orientation: 'vertical', style: 'pills' } }).render();
  assert.equal(host.classList.contains('h-site-tabs'), true);
  assert.equal(host.getAttribute('data-h-orientation'), 'vertical');
  assert.equal(host.getAttribute('data-h-item-style'), 'pills');
  assert.equal(host.querySelector('.h-slider-nav'), null);
  slider.tabs[1].click();
  assert.equal(slider.index, 1);
  assert.equal(slider.items[1].hidden, false);
  assert.equal(slider.items[0].hidden, true);
  await slider.destroy();
  assert.deepEqual(cmsTabsLook({ orientation: 'x', style: 'nope' }), { orientation: 'horizontal', style: 'tabs' });
});

test('HTree: collapsible items hide their children, keep the state across setItems, expandTo opens the parents', async () => {
  installFakeDom();
  const { HTree } = await import('../src/widgets/tree/HTree.js');
  const items = () => [{ id: 'g', label: 'Group', control: 'group', children: [{ id: 't', label: 'Text', children: [] }] },
    { id: 'x', label: 'Text 2', children: [] }];
  const host = document.createElement('div');
  const tree = new HTree().attach(host, { items: items(), collapsible: (item) => item.control === 'group' }).render();
  const rows = () => host.querySelectorAll('.h-tree-row').map((row) => row.dataset.id);
  assert.deepEqual(rows(), ['g', 't', 'x']);
  assert.equal(host.querySelectorAll('button.h-tree-toggle').length, 1, 'only the group has a chevron');
  tree.toggle('g');
  assert.deepEqual(rows(), ['g', 'x']);
  assert.deepEqual(tree.shownIds(), ['g', 'x']);
  tree.setItems(items());
  assert.deepEqual(rows(), ['g', 'x'], 'still collapsed');
  assert.deepEqual(tree.collapsed(), ['g']);
  tree.expandTo('t');
  assert.deepEqual(rows(), ['g', 't', 'x']);
});

test('the one picker: marks [filter] [parametrized]; without a Filter Form the parameterized ones are disabled (review 7)', () => {
  const choices = [{ value: 'source:1', kind: 'source', id: 1, label: 'A', parameterized: true },
    { value: 'filter:2', kind: 'filter', id: 2, label: 'B', parameterized: false }];
  const any = queryChoiceItems(choices);
  assert.deepEqual(any.map((item) => [item.value, item.marks, Boolean(item.disabled)]),
    [['source:1', ['parametrized'], false], ['filter:2', ['filter'], false]]);
  const without = queryChoiceItems(choices, { parameters: 'without', first: [{ value: 'current', label: 'Current result' }] });
  assert.deepEqual(without.map((item) => [item.value, Boolean(item.disabled)]), [['current', false], ['source:1', true], ['filter:2', false]]);
  assert.ok(without[1].title);
});
