/**
 * @file hTree.test.js
 * @brief HTree (plan 27c §7): rows and tools, selection and keyboard, hover, drop positions by canDrop.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from './helpers/fakeDom.js';

installFakeDom();
const { HTree } = await import('../src/widgets/tree/HTree.js');

const ITEMS = [
  { id: 'header', label: 'Header', icon: 'fa-heading', draggable: false },
  { id: 'home', label: 'Home', children: [{ id: 'p1', label: 'Page 1' }, { id: 'p2', label: 'Page 2', badge: '!' }] }
];

function treeOf(options = {}) {
  const host = document.createElement('div');
  const calls = [];
  const tree = new HTree().attach(host, {
    items: ITEMS,
    tools: (item) => (item.id === 'header' ? [] : [{ action: 'edit', icon: 'fa-pen', title: 'Edit' }]),
    onSelect: (id) => calls.push(['select', id]),
    onHover: (id) => calls.push(['hover', id]),
    onTool: (action, id) => calls.push(['tool', action, id]),
    onDrop: (...args) => calls.push(['drop', ...args]),
    ...options
  }).render();
  return { tree, host, calls, row: (id) => host.querySelectorAll('.h-tree-row').find((element) => element.dataset.id === id) };
}

test('rows, tools, selection and hover', () => {
  const { tree, calls, row } = treeOf();
  assert.deepEqual(tree.ids(), ['header', 'home', 'p1', 'p2']);
  assert.ok(!row('header').draggable);
  assert.equal(row('p1').draggable, true);
  assert.equal(row('header').querySelector('.h-tree-tool'), null);
  row('p2').click();
  assert.deepEqual(calls.at(-1), ['select', 'p2']);
  assert.ok(row('p2').classList.contains('h-tree-selected'));
  row('p1').querySelector('.h-tree-tool').click();
  assert.deepEqual(calls.at(-1), ['tool', 'edit', 'p1']);
  row('home').fire('mouseover');
  assert.deepEqual(calls.at(-1), ['hover', 'home']);
  tree.highlight('p1');
  assert.ok(row('p1').classList.contains('h-tree-highlighted'));
});

test('keyboard moves the selection', () => {
  const { tree, calls } = treeOf();
  tree.select('home');
  tree.root.fire('keydown', { key: 'ArrowDown' });
  assert.deepEqual(calls.at(-1), ['select', 'p1']);
  tree.root.fire('keydown', { key: 'End' });
  assert.deepEqual(calls.at(-1), ['select', 'p2']);
  tree.root.fire('keydown', { key: 'Home' });
  assert.deepEqual(calls.at(-1), ['select', 'header']);
});

test('drop: the position follows the pointer and canDrop', () => {
  const allowed = { 'p1>home:inside': true, 'p1>p2:before': true, 'p1>p2:after': true };
  const { calls, row } = treeOf({ canDrop: (drag, target, position) => Boolean(allowed[`${drag}>${target}:${position}`]) });
  row('p1').fire('dragstart', { dataTransfer: { setData() {} } });
  row('p2').fire('dragover', { clientY: 2 });
  assert.ok(row('p2').classList.contains('h-tree-drop-before'));
  row('p2').fire('drop', { clientY: 18 });
  assert.deepEqual(calls.at(-1), ['drop', 'p1', 'p2', 'after']);
  row('p1').fire('dragstart', { dataTransfer: { setData() {} } });
  row('home').fire('drop', { clientY: 2 });
  assert.deepEqual(calls.at(-1), ['drop', 'p1', 'home', 'inside'], 'before is not allowed: inside');
  row('p1').fire('dragstart', { dataTransfer: { setData() {} } });
  row('header').fire('drop', { clientY: 10 });
  assert.equal(calls.at(-1)[2], 'home', 'nothing allowed on the header: no drop');
});

test('setItems keeps the selection of an item still there', () => {
  const { tree } = treeOf();
  tree.select('p1');
  tree.setItems([{ id: 'p1', label: 'Page 1' }]);
  assert.equal(tree.selectedId, 'p1');
  tree.setItems([]);
  assert.equal(tree.selectedId, null);
});
