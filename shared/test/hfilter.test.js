/**
 * @file hfilter.test.js
 * @brief HFilter (plan 27b §11.3): the pane rule, the list modes, running a filter and the
 *        Filter Form of a parameterized one.
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
globalThis.Node ??= globalThis.HTMLElement;
const { HFilter } = await import('../src/widgets/filter/HFilter.js');

const items = [{ key: 'filter:1', title: 'One' }, { key: 'source:2', title: 'Two' }];

test('a pane for several filters or one parameterized filter only', () => {
  assert.equal(HFilter.needsPane([]), false);
  assert.equal(HFilter.needsPane([items[0]]), false);
  assert.equal(HFilter.needsPane([items[0]], () => true), true);
  assert.equal(HFilter.needsPane(items), true);
});

test('buttons: choosing one runs its DataSource; one item has no list', async () => {
  const runs = [];
  const host = document.createElement('div');
  const widget = new HFilter().attach(host, {
    items,
    resolve: async (item) => ({ title: item.title, request: { q: [{ ids: item.key }] } }),
    onRun: (source) => runs.push(source.request.q[0].ids)
  }).render();
  assert.equal(host.querySelectorAll('.h-filter-item').length, 2);
  assert.equal(await widget.select('source:2'), true);
  assert.deepEqual(runs, ['source:2']);
  const chosen = [...host.querySelectorAll('.h-filter-item')].find((button) => button.dataset.key === 'source:2');
  assert.equal(chosen.classList.contains('is-selected'), true);
  assert.equal(await widget.select('missing'), false);

  const single = document.createElement('div');
  new HFilter().attach(single, { items: [items[0]], resolve: async () => null, onRun: () => {} }).render();
  assert.equal(single.querySelector('.h-filter-buttons'), null);
});

test('select mode, and an unreadable filter is reported', async () => {
  const errors = [];
  const host = document.createElement('div');
  const widget = new HFilter().attach(host, {
    items, mode: 'select', resolve: async () => null, onRun: () => assert.fail('not run'),
    onError: (error) => errors.push(error.message)
  }).render();
  assert.ok(host.querySelector('select.h-filter-select'));
  assert.equal(await widget.select('filter:1'), false);
  assert.equal(errors.length, 1);
});

test('a parameterized filter: its form above the list, Close only with a list', async () => {
  const resolve = async (item) => ({ title: item.title, request: { q: [{ t: '10' }, { 'f:1': '$X1$' }] } });
  const host = document.createElement('div');
  const widget = new HFilter().attach(host, { items, resolve, onRun: () => assert.fail('not run') }).render();
  assert.equal(await widget.select('filter:1'), true);
  assert.equal(host.children[0].classList.contains('h-filter-form-host'), true);
  assert.equal(host.querySelector('.h-filter-form-host').hidden, false);
  const close = [...host.querySelector('.h-filter-form-host').querySelectorAll('button')].find((button) => button.textContent.includes('Close'));
  assert.ok(close);
  close.click();
  await new Promise((resolveTick) => setTimeout(resolveTick, 0));
  assert.equal(host.querySelector('.h-filter-form-host').hidden, true);

  const single = document.createElement('div');
  const alone = new HFilter().attach(single, { items: [items[0]], resolve, onRun: () => {} }).render();
  assert.equal(await alone.select('filter:1'), true);
  assert.equal([...single.querySelectorAll('button')].some((button) => button.textContent.includes('Close')), false);
});
