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

test('a parameterized filter: its form instead of the list, Close shows the list again', async () => {
  const resolve = async (item) => ({ title: item.title, request: { q: [{ t: '10' }, { 'f:1': '$X1$' }] } });
  const host = document.createElement('div');
  const widget = new HFilter().attach(host, { items, resolve, onRun: () => assert.fail('not run') }).render();
  assert.equal(await widget.select('filter:1'), true);
  assert.equal(host.children[0].classList.contains('h-filter-form-host'), true);
  assert.equal(host.querySelector('.h-filter-form-host').hidden, false);
  // the list is hidden while the form is open (2026-10-31)
  assert.equal(host.children[1].hidden, true);
  const close = [...host.querySelector('.h-filter-form-host').querySelectorAll('button')].find((button) => button.textContent.includes('Close'));
  assert.ok(close);
  close.click();
  await new Promise((resolveTick) => setTimeout(resolveTick, 0));
  assert.equal(host.querySelector('.h-filter-form-host').hidden, true);
  assert.equal(host.children[1].hidden, false);

  const single = document.createElement('div');
  const alone = new HFilter().attach(single, { items: [items[0]], resolve, onRun: () => {} }).render();
  assert.equal(await alone.select('filter:1'), true);
  assert.equal([...single.querySelectorAll('button')].some((button) => button.textContent.includes('Close')), false);
});

test('showSource (Saved filter, plan 27j): the form of a source that is not an item, filled in; no parameters: run', async () => {
  const runs = [];
  const host = document.createElement('div');
  const widget = new HFilter().attach(host, { items, resolve: async () => null, onRun: (source) => runs.push(source.request.q) }).render();
  const source = { title: 'People', request: { q: [{ t: '10' }, { 'f:1': '$X1$' }] }, presentation: {} };
  assert.equal(await widget.showSource(source, { X1: 'Paris' }), true);
  assert.equal(host.querySelector('.h-filter-form-host').hidden, false);
  assert.deepEqual(widget.form.getValues().X1, 'Paris');
  assert.deepEqual(runs, []);
  assert.equal(await widget.showSource({ request: { q: [{ t: '10' }] } }), true);
  assert.deepEqual(runs, [[{ t: '10' }]]);
  assert.equal(await widget.showSource(null), false);
});

test('Stop (plan 27l §4): shown after a short delay while requests run, stops them all', async () => {
  const { RequestMonitor } = await import('../src/api/RequestMonitor.js');
  const { STOP_DELAY } = await import('../src/widgets/filter/HFilter.js');
  const monitor = new RequestMonitor({ source: 'page' });
  let aborted = 0;
  monitor.abortAll = () => { aborted += 1; return []; };
  let running = 0;
  Object.defineProperty(monitor, 'inFlightCount', { get: () => running });
  const host = document.createElement('div');
  const widget = new HFilter().attach(host, { items, resolve: async () => null, onRun: () => {}, requestMonitor: monitor }).render();
  const stop = host.querySelector('.h-filter-stop');
  assert.ok(stop);
  assert.equal(stop.hidden, true);
  assert.equal(host.classList.contains('is-loading'), false);
  running = 1;
  monitor.dispatchEvent(new Event('change'));
  assert.equal(stop.hidden, true, 'not at once');
  await new Promise((resolve) => setTimeout(resolve, STOP_DELAY + 20));
  assert.equal(stop.hidden, false);
  assert.ok(host.classList.contains('is-loading'), 'the loading veil (review 2026-11-16)');
  stop.dispatchEvent(new Event('click'));
  assert.equal(aborted, 1);
  assert.equal(stop.hidden, true);
  running = 0;
  monitor.dispatchEvent(new Event('change'));
  await widget.destroy();

  const bare = document.createElement('div');
  new HFilter().attach(bare, { items, resolve: async () => null, onRun: () => {} }).render();
  assert.equal(bare.querySelector('.h-filter-stop'), null, 'no monitor: no Stop');
});

test('mark and showSource with a key: the item of a Saved filter of the page URL is marked (plan 27l §3)', async () => {
  const host = document.createElement('div');
  const widget = new HFilter().attach(host, { items, resolve: async () => null, onRun: () => {} }).render();
  widget.mark('source:2');
  assert.equal(widget.selectedKey, 'source:2');
  widget.mark('other');
  assert.equal(widget.selectedKey, null);
  const runs = [];
  widget.options.onRun = (source) => runs.push(source);
  await widget.showSource({ request: { q: { t: '10' } } }, {}, { key: 'filter:1' });
  assert.equal(widget.selectedKey, 'filter:1');
  assert.equal(runs.length, 1, 'no parameters: run at once');
});
